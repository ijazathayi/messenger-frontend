import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import ChatLayout from './components/ChatLayout';
import './index.css';

const BACKEND = import.meta.env.VITE_BACKEND_URL || '';

// JWT helpers
const getToken = () => localStorage.getItem('messenger_token');
const setToken = (t) => localStorage.setItem('messenger_token', t);
const clearToken = () => localStorage.removeItem('messenger_token');

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    // Retry up to 3 times with delay (handles Render cold start)
    let attempts = 0;
    const checkStatus = () => {
      attempts++;
      fetch(`${BACKEND}/auth/status`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      })
        .then(res => res.json())
        .then(data => {
          if (data.authenticated) {
            setCurrentUser(data.user);
          } else if (attempts < 3) {
            // Server might be waking up, retry after 3s
            setTimeout(checkStatus, 3000);
            return;
          } else {
            clearToken();
          }
          setLoading(false);
        })
        .catch(() => {
          if (attempts < 3) {
            setTimeout(checkStatus, 3000);
          } else {
            // After 3 retries, show login but keep the token
            // so next manual login will just refresh it
            setLoading(false);
          }
        });
    };
    checkStatus();
  }, []);

  const handleLogin = (userData, token) => {
    console.log('[App] Saving token to localStorage:', !!token);
    setToken(token);
    console.log('[App] Token saved, verifying:', !!localStorage.getItem('messenger_token'));
    setCurrentUser(userData);
  };

  const handleLogout = () => {
    clearToken();
    setCurrentUser(null);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
        <div className="login-loading">
          <div className="spinner" />
          <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Connecting to server…</span>
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: '12px', opacity: 0.6 }}>This may take up to 30s on first load</span>
      </div>
    );
  }

  return (
    <>
      {currentUser ? (
        <ChatLayout currentUser={currentUser} onLogout={handleLogout} getToken={getToken} />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </>
  );
}

export default App;
