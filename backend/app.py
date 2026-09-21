
import os
import logging
from flask import Flask, request, jsonify, Blueprint, current_app 
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
from google.cloud import storage
import firebase_admin
from firebase_admin import credentials, firestore, _apps
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required, JWTManager
from google.cloud import vision
from google.cloud.vision_v1 import types as vision_types
from google.api_core.exceptions import GoogleAPIError 
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from google.oauth2.service_account import Credentials as ServiceAccountCredentials
from google.cloud.firestore_v1.base_query import FieldFilter

# --- Setup ---
load_dotenv() 
logging.basicConfig(level=logging.INFO) 
logger = logging.getLogger(__name__) 
app = Flask(__name__) 

# --- JWT Configuration ---
app.config["JWT_SECRET_KEY"] = os.getenv('JWT_SECRET_KEY', "a-default-super-secret-jwt-key-for-dev")
jwt = JWTManager(app)

# --- Other Configurations ---
app.config['GOOGLE_CLIENT_ID'] = os.getenv('GOOGLE_CLIENT_ID')
app.config['GCS_BUCKET_NAME'] = os.getenv('GCS_BUCKET_NAME')
app.config['PROJECT_ID'] = os.getenv('PROJECT_ID') 
app.config['CONTENT_METADATA_DATABASE_ID'] = os.getenv('CONTENT_METADATA_DATABASE_ID')
app.config['CONTENT_METADATA_COLLECTION_NAME'] = os.getenv('CONTENT_METADATA_COLLECTION_NAME')
app.config['GEMINI_API_KEY'] = os.getenv('GEMINI_API_KEY')

# --- CORS Configuration ---
CORS(app, resources={r"/*": {"origins": os.getenv('REACT_APP_FRONTEND_URL', 'http://localhost:3000')}}, supports_credentials=True)

# --- Define the path to your service account key file ---
CREDENTIALS_FILE_PATH = r'C:\Users\ravee\OneDrive\Desktop\content-orchestration\backend\my-credentials.json'

# --- Load credentials once to use for all clients ---
try:
    if not os.path.exists(CREDENTIALS_FILE_PATH):
        raise FileNotFoundError(f"Credentials file not found at path: {CREDENTIALS_FILE_PATH}. Please ensure it exists.")
    
    service_account_credentials = ServiceAccountCredentials.from_service_account_file(CREDENTIALS_FILE_PATH)
    firebase_cert_credentials = credentials.Certificate(CREDENTIALS_FILE_PATH)
except FileNotFoundError as e:
    logger.error(f"FATAL: {e}")
    service_account_credentials = None
    firebase_cert_credentials = None
except Exception as e:
    logger.error(f"FATAL: Could not load service account credentials. Error: {e}", exc_info=True)
    service_account_credentials = None
    firebase_cert_credentials = None


# --- Firebase Admin SDK and Firestore Initialization for User Credentials ---
db = None 
if firebase_cert_credentials:
    try:
        if not _apps: 
            firebase_admin.initialize_app(firebase_cert_credentials, name='co-user-credentials')
        
        db = firestore.Client(credentials=service_account_credentials, database="co-user-credentials")
        users_collection = db.collection('co-user-credentials') 
        logger.info("Successfully connected to Firestore database: co-user-credentials.")
    except Exception as e:
        logger.error(f"FATAL: Could not initialize Firestore for user credentials. Error: {e}", exc_info=True)
        db = None

# --- Firebase/Firestore Initialization for Content Metadata ---
content_metadata_db = None
if firebase_cert_credentials:
    try:
        if all(map(app.config.get, ['PROJECT_ID', 'CONTENT_METADATA_DATABASE_ID'])):
            if not _apps.get('content-metadata'):
                firebase_admin.initialize_app(firebase_cert_credentials, name='content-metadata')
            
            content_metadata_db = firestore.Client(credentials=service_account_credentials, database=app.config['CONTENT_METADATA_DATABASE_ID'])
            logger.info(f"Successfully connected to Firestore database for content metadata: {app.config['CONTENT_METADATA_DATABASE_ID']}.")
        else:
            logger.warning("Missing PROJECT_ID, CONTENT_METADATA_DATABASE_ID in config. Content metadata Firestore will not be initialized.")
    except Exception as e:
        logger.error(f"FATAL: Could not initialize Firestore for content metadata. Error: {e}", exc_info=True)
        content_metadata_db = None

        
# --- Google Cloud Storage Client Initialization ---
gcs_client = None
if service_account_credentials:
    try:
        gcs_client = storage.Client(credentials=service_account_credentials)
        logger.info("Successfully initialized Google Cloud Storage client.")
    except Exception as e:
        logger.error(f"FATAL: GCS client failed to initialize. ERROR: {e}", exc_info=True)
        gcs_client = None

# --- User Model ---
class User():
    def __init__(self, id, email, username=None, google_id=None, profile_pic_url=None, password_hash=None):
        self.id = id
        self.email = email
        self.username = username or email.split('@')[0]
        self.google_id = google_id
        self.profile_pic_url = profile_pic_url
        self.password_hash = password_hash
    
    def to_dict(self):
        return { 
            'id': self.id, 
            'email': self.email, 
            'username': self.username, 
            'google_id': self.google_id, 
            'profile_pic_url': self.profile_pic_url, 
            'password_hash': self.password_hash 
        }

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        if self.password_hash:
            return check_password_hash(self.password_hash, password)
        return False


# --- Firestore Helper Functions (for user credentials) ---
def get_user_from_db(user_id=None, email=None, google_id=None):
    if not db:
        logger.error("Firestore DB (user credentials) not initialized. Cannot retrieve user.")
        return None
    try:
        if user_id:
            doc_ref = users_collection.document(user_id)
            doc = doc_ref.get()
            if doc.exists:
                return User(**doc.to_dict())
            return None
        
        query_ref = None
        if email:
            query_ref = users_collection.where('email', '==', email).limit(1)
        elif google_id:
            query_ref = users_collection.where('google_id', '==', google_id).limit(1)

        if query_ref:
            docs = list(query_ref.stream())
            if docs:
                return User(**docs[0].to_dict())

    except Exception as e:
        logger.error(f"Error getting user from Firestore (user credentials): {e}", exc_info=True)
    return None

def save_user_to_db(user):
    if not db:
        logger.error("Firestore DB (user credentials) not initialized. Cannot save user.")
        return
    try:
        doc_ref = users_collection.document(user.id) 
        doc_ref.set(user.to_dict()) 
        logger.info(f"User {user.email} saved/updated in Firestore with ID {user.id}.")
    except Exception as e:
        logger.error(f"Error saving user to Firestore (user credentials): {e}", exc_info=True)

@jwt.user_lookup_loader
def user_lookup_callback(_jwt_header, jwt_data):
    identity = jwt_data["sub"]
    return get_user_from_db(user_id=identity)


# --- Google Cloud Storage Helper Functions ---
def get_gcs_client():
    if gcs_client:
        return gcs_client
    else:
        raise RuntimeError("GCS client not initialized.")

def create_user_gcs_folders(user_email, bucket_name):
    logger.info(f"Creating GCS folders for {user_email} in {bucket_name}")
    try:
        storage_client = get_gcs_client()
        bucket = storage_client.bucket(bucket_name)
        for folder_type in ["images", "videos", "audios", "others"]:
            blob = bucket.blob(f"{user_email}/{folder_type}/")
            if not blob.exists():
                blob.upload_from_string('', content_type='application/x-directory') 
        logger.info(f"GCS folders created/verified for {user_email}.")
    except Exception as e:
        logger.error(f"Failed to create GCS folders for {user_email}: {e}", exc_info=True)
        
# --- Authentication Routes ---
auth_bp = Blueprint('auth_bp', __name__)

@auth_bp.route('/google_login', methods=['POST'])
def google_login():
    if not db:
        logger.error("Attempted Google login while Firestore DB (user credentials) is not initialized.")
        return jsonify(success=False, error="Server database service for user credentials is not available."), 503

    token = request.json.get('token')
    if not token:
        return jsonify(success=False, error="No token provided"), 400

    try:
        google_request_obj = google_requests.Request()
        idinfo = id_token.verify_oauth2_token(token, google_request_obj, current_app.config['GOOGLE_CLIENT_ID'])
        
        email, name, picture = idinfo.get('email'), idinfo.get('name'), idinfo.get('picture')
        google_user_id = idinfo['sub']

        user = get_user_from_db(google_id=google_user_id)
        if not user:
            user = get_user_from_db(email=email)
            
        if not user:
            logger.info(f"Creating new user for {email} in Firestore.")
            user = User(id=google_user_id, email=email, username=name, google_id=google_user_id, profile_pic_url=picture)
            save_user_to_db(user)
            create_user_gcs_folders(email, current_app.config['GCS_BUCKET_NAME'])

        access_token = create_access_token(identity=user.id)
        return jsonify(
            success=True, 
            user={'email': user.email, 'name': user.username, 'picture': user.profile_pic_url},
            access_token=access_token
        )
    except Exception as e:
        logger.error(f"Error during Google login: {e}", exc_info=True)
        if "Token has expired" in str(e) or "Signature not valid" in str(e):
             return jsonify(success=False, error='Google token is invalid or expired. Please try logging in again.'), 401
        return jsonify(success=False, error='Server error during Google Login.'), 500

app.register_blueprint(auth_bp, url_prefix='/auth')

# --- Protected File Upload Route (FINAL Corrected Metadata Creation) ---
# --- Protected File Upload Route (FINAL Corrected) ---
@app.route('/upload_file', methods=['POST'])
@jwt_required()
def upload_file():
    """
    Handles file uploads to GCS. Metadata creation is handled by an external pipeline.
    """
    user_email_for_logging = "unknown_user"
    try:
        user_id = get_jwt_identity()
        current_user = get_user_from_db(user_id=user_id)
        
        if not current_user:
            return jsonify(success=False, error="User not found in database."), 404
        
        user_email_for_logging = current_user.email

        if 'file' not in request.files:
            logger.warning(f"Upload attempt failed for {user_email_for_logging}: No file part in request.")
            return jsonify(success=False, error='No file part in the request'), 400
        
        file = request.files['file']
        
        if file.filename == '':
            logger.warning(f"Upload attempt failed for {user_email_for_logging}: No file selected.")
            return jsonify(success=False, error='No selected file'), 400

        category = request.form.get('category', 'others').lower()
        subfolder_map = {
            'images': 'images/',
            'videos': 'videos/',
            'audios': 'audios/'
        }
        subfolder_gcs = subfolder_map.get(category, 'others/') 
        
        original_filename = os.path.basename(file.filename)
        destination_blob_name = f"{current_user.email}/{subfolder_gcs}{original_filename}"
        
        logger.info(f"Uploading '{original_filename}' to '{destination_blob_name}' for user {user_email_for_logging}.")
        
        # 1. Upload to Google Cloud Storage
        storage_client = get_gcs_client()
        bucket = storage_client.bucket(app.config['GCS_BUCKET_NAME'])
        blob = bucket.blob(destination_blob_name)
        blob.upload_from_file(file, content_type=file.content_type)
        
        logger.info(f"Successfully uploaded '{original_filename}' for user {user_email_for_logging}.")
        
        # 2. IMPORTANT: All Firestore interaction has been removed.
        # This route's only job is to upload the file.
        # An external pipeline (e.g., a Cloud Function triggered by GCS upload)
        # will handle the creation and population of the metadata in Firestore.
        
        return jsonify(success=True, message=f'File {original_filename} uploaded successfully. Metadata is being processed by the backend.'), 200

    except Exception as e:
        logger.error(f"Upload error for user {user_email_for_logging}: {str(e)}", exc_info=True)
        return jsonify(success=False, error='An unexpected server-side error occurred during upload.'), 500    



# --- FINAL CORRECTED 'search_files' function (with correct public URL) ---
@app.route('/search_files', methods=['GET'])
@jwt_required()
def search_files():
    """
    Searches for files in Firestore across all user subcollections.
    """
    try:
        user_id = get_jwt_identity()
        current_user = get_user_from_db(user_id=user_id)
        
        if not current_user:
            return jsonify(success=False, error="User not found in database."), 404

        # The user's query is converted to lowercase ONCE at the beginning
        query_text = request.args.get('searchQuery', '').strip().lower()
        
        if not query_text:
            return jsonify(success=False, error="Search query 'searchQuery' is required."), 400

        logger.info(f"User {current_user.email} is searching for: '{query_text}'")

        if not content_metadata_db:
            return jsonify(success=False, error="Content metadata database not available."), 503

        matching_docs = {}
        
        from google.cloud.firestore_v1 import FieldFilter

        categories = ['images', 'videos', 'audios', 'others']
        
        for category in categories:
            collection_ref = content_metadata_db.collection_group(category)

            filename_query = collection_ref \
                .where(filter=FieldFilter('enrichedMetadata.userId', '==', current_user.email)) \
                .where(filter=FieldFilter('enrichedMetadata.originalFileName', '==', query_text))
            
            for doc in filename_query.stream():
                doc_dict = doc.to_dict()
                gcs_path_raw = doc_dict.get('enrichedMetadata', {}).get('gcsPath')
                
                if gcs_path_raw:
                    # --- CORRECTION: Clean up the gcsPath string ---
                    cleaned_gcs_path = gcs_path_raw.replace(f"gs://{app.config['GCS_BUCKET_NAME']}/", '', 1)
                    doc_dict['publicUrl'] = f"https://storage.googleapis.com/{app.config['GCS_BUCKET_NAME']}/{cleaned_gcs_path}"
                
                matching_docs[doc.id] = doc_dict

            keywords_query = collection_ref \
                .where(filter=FieldFilter('enrichedMetadata.userId', '==', current_user.email)) \
                .where(filter=FieldFilter('enrichedMetadata.summaryContent', 'array_contains', query_text))
            
            for doc in keywords_query.stream():
                doc_dict = doc.to_dict()
                gcs_path_raw = doc_dict.get('enrichedMetadata', {}).get('gcsPath')

                if gcs_path_raw:
                    # --- CORRECTION: Clean up the gcsPath string ---
                    cleaned_gcs_path = gcs_path_raw.replace(f"gs://{app.config['GCS_BUCKET_NAME']}/", '', 1)
                    doc_dict['publicUrl'] = f"https://storage.googleapis.com/{app.config['GCS_BUCKET_NAME']}/{cleaned_gcs_path}"

                matching_docs[doc.id] = doc_dict

        results = list(matching_docs.values())
        if results:
            return jsonify(success=True, results=results, count=len(results)), 200
        else:
            return jsonify(success=True, message="No files found matching the search criteria.", results=[], count=0), 200

    except Exception as e:
        logger.error(f"Search error for user {current_user.email if 'current_user' in locals() else 'unknown'}: {str(e)}", exc_info=True)
        return jsonify(success=False, error='An unexpected server-side error occurred during search.'), 500


# --- Main Entry Point ---
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

