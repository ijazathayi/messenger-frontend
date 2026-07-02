import React, { useCallback, useState } from 'react';
import { Lock, Zap, Shield, MessageSquare } from 'lucide-react';

const GOOGLE_CLIENT_ID = '61953097945-qovq5k9vqmqgumkem6qm58i3ku8q6jdv.apps.googleusercontent.com';

const features = [
  { icon: <Shield size={12} color="#3ecf70" />, label: 'End-to-end secure' },
  { icon: <Zap    size={12} color="#f59e0b" />, label: 'Real-time chat'    },
  { icon: <Lock   size={12} color="#4f8ef7" />, label: 'Private & encrypted'},
];

const Login = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleGoogleSuccess = useCallback(async (response) => {
    const idToken = response.credential;
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/auth/google/token', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onLogin(data.user);
      } else {
        setError(data.error || 'Login failed. Please try again.');
      }
    } catch {
      setError('Network error. Make sure the backend is running on port 3002.');
    } finally {
      setLoading(false);
    }
  }, [onLogin]);

  const initGoogleButton = useCallback((node) => {
    if (!node) return;
    const render = () => {
      if (!window.google) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback:  handleGoogleSuccess,
      });
      window.google.accounts.id.renderButton(node, {
        theme:          'filled_black',
        size:           'large',
        width:          280,
        text:           'signin_with',
        shape:          'pill',
        logo_alignment: 'left',
      });
    };
    if (window.google) { render(); }
    else {
      const script = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
      if (script) script.addEventListener('load', render, { once: true });
    }
  }, [handleGoogleSuccess]);

  return (
    <div className="login-page">
      <div className="login-card glass-panel">

        {/* Icon */}
        <div className="login-app-icon">
          <MessageSquare size={36} color="white" />
        </div>

        <h1 className="login-title">Messenger</h1>
        <p className="login-subtitle">
          Connect instantly with friends and family.<br />
          Secure, fast and beautifully simple.
        </p>

        {/* Feature pills */}
        <div className="login-features">
          {features.map((f, i) => (
            <div key={i} className="login-feature-pill">
              {f.icon}&nbsp;{f.label}
            </div>
          ))}
        </div>

        {/* Google button or loading spinner */}
        {loading ? (
          <div className="login-loading">
            <div className="spinner" />
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Signing you in…</span>
          </div>
        ) : (
          <div className="google-btn-wrapper" ref={initGoogleButton} />
        )}

        {error && <p className="login-error">{error}</p>}

        <p className="login-footer">
          By continuing you agree to our <a href="#">Terms</a> &amp;{' '}
          <a href="#">Privacy Policy</a>.<br />
          Your data is never shared or sold.
        </p>
      </div>
    </div>
  );
};

export default Login;
