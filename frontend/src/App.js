// src/App.js
// This is the main application component, setting up routing and global context.
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext'; // Import AuthProvider and useAuth
import GoogleLogin from './GoogleLogin'; // Import GoogleLogin component
import Dashboard from './Dashboard';     // Import Dashboard component


// Component to handle routing based on authentication status
const AppRoutes = () => {
  const { user, loading } = useAuth(); // Access authentication state

  if (loading) {
    // Show a loading indicator while authentication state is being determined
    return (
      <div className="flex items-center justify-center min-h-screen text-xl text-gray-700">
        Loading application...
      </div>
    );
  }

  return (
    <Routes>
      {/* Route for login page: If user is logged in, redirect to dashboard; otherwise, show Login component */}
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <GoogleLogin />} />
      {/* Route for dashboard: If user is not logged in, redirect to login; otherwise, show Dashboard component */}
      <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/login" />} />
      {/* Catch-all route: Redirects to login or dashboard based on authentication status */}
      <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} />} />

    </Routes>
  );
};

// Main App component that sets up the Router and AuthProvider
const App = () => {
  return (
    <div className="font-sans antialiased text-gray-900 bg-gray-100 min-h-screen">
      {/* Tailwind CSS CDN for easy styling. This should ideally be in public/index.html head. */}
      {/* For this self-contained example, it's included here. */}
      <script src="https://cdn.tailwindcss.com"></script>
      {/* Custom styles for the Inter font */}
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          body { font-family: 'Inter', sans-serif; }
        `}
      </style>
      <Router>
        {/* AuthProvider makes authentication state available globally to all components within it */}
        <AuthProvider>
          <AppRoutes /> {/* Render the routes component */}
        </AuthProvider>
      </Router>
    </div>
  );
};

export default App;
