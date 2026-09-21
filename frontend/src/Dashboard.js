import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './Dashboard.css';

const LOCAL_STORAGE_TOKEN_KEY = 'pragyashal_jwt_token';
const LOCAL_STORAGE_USER_KEY = 'pragyashal_user';

const Dashboard = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const [selectedFile, setSelectedFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadMessage, setUploadMessage] = useState('');
    const [detectedCategory, setDetectedCategory] = useState('others');

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchMessage, setSearchMessage] = useState('');
    const [searching, setSearching] = useState(false);

    const FLASK_BACKEND_URL = process.env.REACT_APP_FLASK_BACKEND_URL;

    const [authToken, setAuthToken] = useState(null);

    useEffect(() => {
        const token = localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY);
        if (token) {
            setAuthToken(token);
        }
    }, []);

    const getFileCategoryFromMime = (mimeType) => {
        if (!mimeType) return 'others';
        if (mimeType.startsWith('image/')) return 'images';
        if (mimeType.startsWith('video/')) return 'videos';
        if (mimeType.startsWith('audio/')) return 'audios';
        return 'others';
    };

    const handleLogout = () => {
        localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
        localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
        logout();
        setAuthToken(null);
        navigate('/login');
    };

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        setSelectedFile(file);
        setUploadMessage('');

        if (file) {
            const category = getFileCategoryFromMime(file.type);
            setDetectedCategory(category);
        } else {
            setDetectedCategory('others');
        }
    };

    const handleFileUpload = async () => {
        if (!selectedFile) {
            setUploadMessage('Please select a file first!');
            return;
        }

        setUploading(true);
        setUploadMessage('Uploading...');

        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('category', detectedCategory);
        formData.append('contentType', selectedFile.type);

        try {
            if (!authToken) {
                setUploadMessage('No authentication token found. Please login again.');
                setUploading(false);
                return;
            }

            const res = await fetch(`${FLASK_BACKEND_URL}/upload_file`, {
                method: 'POST',
                body: formData,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setUploadMessage('File uploaded successfully!');
                setSelectedFile(null);
                setDetectedCategory('others');
                document.getElementById('file-upload-input').value = '';
            } else {
                setUploadMessage(`Upload failed: ${data.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Upload API call error:', error);
            setUploadMessage('Network error or server unavailable during upload.');
        } finally {
            setUploading(false);
        }
    };

    const handleSearchChange = (event) => {
        setSearchQuery(event.target.value);
        setSearchResults([]);
        setSearchMessage('');
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            setSearchMessage('Please enter a filename, extension, or keyword to search.');
            setSearchResults([]);
            return;
        }

        setSearching(true);
        setSearchMessage('Searching...');
        setSearchResults([]);

        try {
            if (!authToken) {
                setSearchMessage('No authentication token found. Please login again.');
                setSearching(false);
                return;
            }

            const url = `${FLASK_BACKEND_URL}/search_files?searchQuery=${encodeURIComponent(searchQuery.trim())}`;

            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            const data = await res.json();

            if (res.ok && data.success) {
                if (data.results && data.results.length > 0) {
                    setSearchResults(data.results);
                    setSearchMessage(`${data.results.length} file(s) found!`);
                } else {
                    setSearchResults([]);
                    setSearchMessage('No files found matching your criteria.');
                }
            } else {
                setSearchResults([]);
                setSearchMessage(data.error || 'File not found or an error occurred.');
            }
        } catch (error) {
            console.error('Search API call error:', error);
            setSearchMessage('Network error or server unavailable during search.');
        } finally {
            setSearching(false);
        }
    };

    if (!user) {
        return <Navigate to="/login" />;
    }

    return (
        <div className="dashboard-page">
            <header className="dashboard-header">
                <h2 className="welcome-message">
                    Welcome, <span>{user.name || user.email}!</span>
                </h2>
                <button onClick={handleLogout} className="logout-button">
                    Logout
                </button>
            </header>

            <main>
                {/* Search Section */}
                <div className="search-container">
                    <h3>Search Your Files</h3>
                    <div className="search-input-group">
                        <input
                            type="text"
                            placeholder="Enter a keyword, filename, or file extension to search"
                            value={searchQuery}
                            onChange={handleSearchChange}
                            className="search-input"
                        />
                        <button
                            onClick={handleSearch}
                            disabled={searching}
                            className="search-button"
                        >
                            {searching ? 'Searching...' : 'Search File'}
                        </button>
                    </div>

                    {searchMessage && (
                        <p
                            className={`search-message ${
                                searchMessage.toLowerCase().includes('not found') || searchMessage.toLowerCase().includes('error') ? 'error' : 'success'
                            }`}
                        >
                            {searchMessage}
                        </p>
                    )}

                    {searchResults.length > 0 && (
                        <div className="search-results-list">
                            <h4>Found Files:</h4>
                            {searchResults.map((file, index) => (
                                <div key={index} className="search-result-item">
                                    {/* --- CORRECTION 1: Access nested fields from 'enrichedMetadata' --- */}
                                    <h5>{file.enrichedMetadata.originalFileName} ({file.enrichedMetadata.category})</h5>
                                    
                                    {/* --- CORRECTION 2: Use 'publicUrl' from backend for image source --- */}
                                    {file.enrichedMetadata.category === 'images' && (
                                        <img
                                            src={file.publicUrl}
                                            alt={`Searched File: ${file.enrichedMetadata.originalFileName}`}
                                            className="searched-item-preview"
                                        />
                                    )}
                                    {file.enrichedMetadata.category === 'videos' && (
                                        <video src={file.publicUrl} controls className="searched-item-preview">
                                            Your browser does not support the video tag.
                                        </video>
                                    )}
                                    {file.enrichedMetadata.category === 'audios' && (
                                        <audio src={file.publicUrl} controls className="searched-item-preview">
                                            Your browser does not support the audio element.
                                        </audio>
                                    )}
                                    
                                    {/* --- CORRECTION 3: Use 'publicUrl' for download link --- */}
                                    <a
                                        href={file.publicUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        download={file.enrichedMetadata.originalFileName}
                                        className="download-link"
                                    >
                                        Download {file.enrichedMetadata.originalFileName}
                                    </a>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Content Upload Section */}
                <div className="upload-container">
                    <h3>Content Upload</h3>
                    <p>Your personal cloud storage is ready! Upload your multimedia files to begin.</p>

                    <div className="file-dropzone">
                        <span className="file-dropzone-text">
                            {selectedFile ? selectedFile.name : 'Click here to select a file'}
                        </span>
                        <input
                            id="file-upload-input"
                            type="file"
                            onChange={handleFileChange}
                            className="file-input-hidden"
                        />
                    </div>

                    {selectedFile && (
                        <p className="detected-category">
                            Detected Category: <span>{detectedCategory}</span>
                        </p>
                    )}

                    <button
                        onClick={handleFileUpload}
                        disabled={uploading || !selectedFile}
                        className="upload-button"
                    >
                        {uploading ? 'Uploading...' : 'Upload File'}
                    </button>

                    {uploadMessage && (
                        <p
                            className={`upload-message ${
                                uploadMessage.toLowerCase().includes('failed') ? 'error' : 'success'
                            }`}
                        >
                            {uploadMessage}
                        </p>
                    )}
                </div>
            </main>
        </div>
    );
};

export default Dashboard;