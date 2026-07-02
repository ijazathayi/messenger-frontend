import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import ChatLayout from './components/ChatLayout';
import './index.css';

const BACKEND = import.meta.env.VITE_BACKEND_URL || '';

// JWT helpers
const getToken  = () => localStorage.getItem('messenger_token');
const setToken  = (t) => localStorage.setItem('messenger_token', t);
const clearToken = () => localStorage.removeItem('messenger_token');

// Cache user data in localStorage so we can restore on network failure
const getCachedUser = () => {
  try { return JSON.parse(localStorage.getItem('messenger_user') || 'null'); } catch { return null; }
};
const setCachedUser = (u) => localStorage.setItem('messenger_user', JSON.stringify(u));
const clearCache    = () => { clearToken(); localStorage.removeItem('messenger_user'); };

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    const token = getToken();

    // No token → show login immediately
    if (!token) { setLoading(false); return; }

    // Have cached user → restore immediately, verify in background
    const cached = getCachedUser();
    if (cached) {
      setCurrentUser(cached);
      setLoading(false);
      // Still verify in background to refresh user data
      verifyToken(token, false);
      return;
    }

    // No cache but have token → wait for server
    verifyToken(token, true);
  }, []);

  const verifyToken = (token, showLoadingOnFail) => {
    let attempts = 0;

    const attempt = () => {
      attempts++;
      fetch(`${BACKEND}/auth/status`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          if (data.authenticated && data.user) {
            setCachedUser(data.user);
            setCurrentUser(data.user);
          } else {
            // Server explicitly says token is bad — only clear if no cached user
            if (!getCachedUser()) {
              clearCache();
            }
          }
          setLoading(false);
        })
        .catch(() => {
          if (attempts < 4) {
            // Retry with exponential backoff (2s, 4s, 8s)
            setTimeout(attempt, attempts * 2000);
          } else {
            // Give up — keep cached user if available, otherwise show login
            const cached = getCachedUser();
            if (cached) {
              setCurrentUser(cached);
            }
            setLoading(false);
          }
        });
    };

    attempt();
  };

  const handleLogin = (userData, token) => {
    setToken(token);
    setCachedUser(userData);
    setCurrentUser(userData);
  };

  const handleLogout = () => {
    clearCache();
    setCurrentUser(null);
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex', height: '100vh', width: '100vw',
        alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: '12px'
      }}>
        <div className="login-loading">
          <div className="spinner" />
          <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Connecting…</span>
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: '12px', opacity: 0.6 }}>
          Server may take ~30s to wake up
        </span>
      </div>
    );
  }

  return (
    <>
      {currentUser ? (
        <ChatLayout currentUser={currentUser} onLogout={handleLogout} />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </>
  );
}

export default App;
