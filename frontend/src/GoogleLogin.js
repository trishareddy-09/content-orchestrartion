
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './GoogleLogin.css';

const LOCAL_STORAGE_TOKEN_KEY = 'pragyashal_jwt_token';
const LOCAL_STORAGE_USER_KEY = 'pragyashal_user';

const GoogleLogin = () => {
    const navigate = useNavigate();
    const { login } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    const FLASK_BACKEND_URL = process.env.REACT_APP_FLASK_BACKEND_URL;

    useEffect(() => {
        const storedToken = localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY);
        const storedUser = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
        if (storedToken && storedUser) {
            try {
                const userObj = JSON.parse(storedUser);
                login({
                    email: userObj.email,
                    name: userObj.name,
                    picture: userObj.picture,
                    token: storedToken,
                });
                navigate('/dashboard');
            } catch {
                localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
                localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
            }
        }
    }, [login, navigate]);

    const handleGoogleCredentialResponse = useCallback(async (response) => {
        setErrorMessage('');
        if (response.credential) {
            try {
                const res = await fetch(`${FLASK_BACKEND_URL}/auth/google_login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: response.credential }),
                });
                const data = await res.json();
                if (data.success) {
                    const decodedToken = JSON.parse(atob(response.credential.split('.')[1]));
                    const userObj = {
                        email: decodedToken.email,
                        name: decodedToken.name || decodedToken.email.split('@')[0],
                        picture: decodedToken.picture || null,
                    };
                    
                    localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, data.access_token);
                    localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(userObj));

                    login({
                        ...userObj,
                        token: data.access_token,
                    });
                    navigate(data.redirect_url || '/dashboard');
                } else {
                    setErrorMessage(data.error || 'Google login failed.');
                }
            } catch (error) {
                setErrorMessage('Network error or server unavailable.');
            }
        } else {
            setErrorMessage('Google login failed: No credential received.');
        }
    }, [navigate, login, FLASK_BACKEND_URL]);

    useEffect(() => {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => {
            if (window.google && window.google.accounts && window.google.accounts.id) {
                window.google.accounts.id.initialize({
                    client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
                    callback: handleGoogleCredentialResponse,
                });
                window.google.accounts.id.renderButton(
                    document.getElementById('googleSignInButton'),
                    { theme: 'outline', size: 'large', type: 'standard', text: 'signin_with' }
                );
            }
        };
        document.body.appendChild(script);
        return () => {
            document.body.removeChild(script);
        };
    }, [handleGoogleCredentialResponse]);

    const handleEmailLogin = async (e) => {
        e.preventDefault();
        setErrorMessage('');
        if (!email || !password) {
            setErrorMessage('Please enter both email and password.');
            return;
        }
        try {
            const res = await fetch(`${FLASK_BACKEND_URL}/auth/email_login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (data.success) {
                const userObj = {
                    email: data.user.email,
                    name: data.user.name,
                    picture: data.user.picture || null,
                };
                localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, data.access_token);
                localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(userObj));

                login({
                    ...userObj,
                    token: data.access_token,
                });
                navigate(data.redirect_url || '/dashboard');
            } else {
                setErrorMessage(data.error || 'Invalid email or password.');
            }
        } catch (error) {
            setErrorMessage('Network error or server unavailable.');
        }
    };

    return (
        <div className="login-page">
            <div className="login-container">
                <div className="login-header">
                    <h1>Pragyashal</h1>
                    <h2>Log in to your account</h2>
                </div>

                <div id="googleSignInButton"></div>

                <div className="divider">Or continue with email</div>

                <form onSubmit={handleEmailLogin} className="login-form">
                    <div className="form-group">
                        <label className="form-label" htmlFor="email">
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Enter your email address"
                            className="form-input"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="password">
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            className="form-input"
                            required
                        />
                    </div>

                    <div className="forgot-password">
                        <a href="/forgot-password">Forgot password?</a>
                    </div>

                    {errorMessage && <p className="error-message">{errorMessage}</p>}

                    <button type="submit" className="submit-button">
                        Sign In
                    </button>
                </form>
            </div>
        </div>
    );
};

export default GoogleLogin;
