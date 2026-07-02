import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import ChatLayout from './components/ChatLayout';
import './index.css';

const BACKEND = import.meta.env.VITE_BACKEND_URL || '';

// JWT helpers
const getToken = () => localStorage.getItem('messenger_token');
const setToken = (t) => localStorage.setItem('messenger_token', t);
const clearToken = () => localStorage.removeItem('messenger_token');
const authHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getToken()}`
});

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    fetch(`${BACKEND}/auth/status`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) setCurrentUser(data.user);
        else clearToken();
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleLogin = (userData, token) => {
    setToken(token);
    setCurrentUser(userData);
  };

  const handleLogout = () => {
    clearToken();
    setCurrentUser(null);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center' }}>
        <div className="login-loading">
          <div className="spinner" />
          <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Loading Messenger…</span>
        </div>
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
