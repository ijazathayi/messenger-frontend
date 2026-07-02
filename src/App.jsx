import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import ChatLayout from './components/ChatLayout';
import './index.css';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user already has a session (e.g. after page refresh)
    fetch('/auth/status', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) setCurrentUser(data.user);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Called by Login component after successful Google token verification
  const handleLogin = (userData) => {
    setCurrentUser(userData);
  };

  const handleLogout = () => {
    fetch('/auth/logout', { method: 'POST', credentials: 'include' })
      .then(res => res.json())
      .then(data => { if (data.success) setCurrentUser(null); })
      .catch(console.error);
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
        <ChatLayout currentUser={currentUser} onLogout={handleLogout} />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </>
  );
}

export default App;
