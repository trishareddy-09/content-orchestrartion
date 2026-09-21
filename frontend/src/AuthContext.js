    // // frontend/src/AuthContext.js
    // // This file manages the user's authentication state across the application using React Context.
    // import React, { createContext, useContext, useState, useEffect } from 'react';

    // // Create a context for authentication. Initial value is null.
    // const AuthContext = createContext(null);

    // // Custom hook to easily access the authentication context in any component.
    // export const useAuth = () => useContext(AuthContext);

    // // Auth Provider component to wrap the application's components that need authentication state.
    // export const AuthProvider = ({ children }) => {
    //   const [user, setUser] = useState(null); // State to hold the current authenticated user.
    //   const [loading, setLoading] = useState(true); // State to indicate if authentication state is being loaded.

    //   useEffect(() => {
    //     // On component mount, try to load user data from local storage to persist the session.
    //     const storedUser = localStorage.getItem('user');
    //     if (storedUser) {
    //       try {
    //         setUser(JSON.parse(storedUser)); // Parse and set user data if found.
    //       } catch (e) {
    //         console.error("Failed to parse stored user from localStorage:", e);
    //         localStorage.removeItem('user'); // Clear corrupted data if parsing fails.
    //       }
    //     }
    //     setLoading(false); // Authentication state loading is complete.
    //   }, []); // Empty dependency array means this effect runs only once on mount.

    //   // Function to log in a user: sets user state and stores data in local storage.
    //   const login = (userData) => {
    //     setUser(userData);
    //     localStorage.setItem('user', JSON.stringify(userData)); // Store user data for persistence.
    //   };

    //   // Function to log out a user: clears user state and removes data from local storage.
    //   const logout = () => {
    //     setUser(null);
    //     localStorage.removeItem('user'); // Remove user data from local storage.
    //     // Ensure Google Identity Services (GSI) also signs out or disables auto-select
    //     // to prevent automatic re-login after explicit logout.
    //     if (window.google && window.google.accounts && window.google.accounts.id) {
    //       window.google.accounts.id.disableAutoSelect();
    //     }
    //   };

    //   return (
    //     <AuthContext.Provider value={{ user, loading, login, logout }}>
    //       {/* Render children only after loading is complete to avoid UI flickering or incorrect state. */}
    //       {!loading && children}
    //     </AuthContext.Provider>
    //   );
    // };
    

   // frontend/src/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On initial load, check if user data and token are in local storage
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('user');
      const token = localStorage.getItem('authToken');
      if (storedUser && token) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error("Failed to parse user from localStorage", error);
      localStorage.clear(); // Clear storage if data is corrupt
    } finally {
      setLoading(false);
    }
  }, []);

  // Login function now saves user and the JWT token
  const login = (userData, token) => {
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('authToken', token); // Save the token
    setUser(userData);
  };

  // Logout function now clears user and the JWT token
  const logout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('authToken'); // Remove the token
    setUser(null);
  };

  // A helper function for other components to get the current token
  const getToken = () => {
    return localStorage.getItem('authToken');
  };

  const value = { user, loading, login, logout, getToken };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

// Custom hook to easily use the auth context
export const useAuth = () => {
  return useContext(AuthContext);
};
