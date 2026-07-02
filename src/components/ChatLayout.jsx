import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LogOut, Search, Send, User, Settings as SettingsIcon,
  Edit2, Trash2, X, Info, Paperclip, FileText, Download,
  MoreVertical, Camera, Check, CheckCheck, MessageSquare, Shield,
  Phone, Video
} from 'lucide-react';
import AdminPanel from './AdminPanel';
import IncomingCallDialog from './IncomingCallDialog';
import CallModal from './CallModal';
import { io } from 'socket.io-client';

const BACKEND = import.meta.env.VITE_BACKEND_URL || '';

/* ─────────────────────────────────────────────
   Avatar helper
───────────────────────────────────────────── */
function Avatar({ src, name = '', size = 40, className = '' }) {
  const [imgError, setImgError] = useState(false);

  // Reset error state if src changes
  useEffect(() => { setImgError(false); }, [src]);

  // First letter of each word, max 2 chars
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

  const colors = [
    'linear-gradient(135deg,#4f8ef7,#8b5cf6)',
    'linear-gradient(135deg,#3ecf70,#059669)',
    'linear-gradient(135deg,#f59e0b,#d97706)',
    'linear-gradient(135deg,#ef4444,#b91c1c)',
    'linear-gradient(135deg,#ec4899,#9d174d)',
  ];
  const bg = colors[(name.charCodeAt(0) || 0) % colors.length];

  const base = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'block',
  };

  // Show image only if src exists AND hasn't errored
  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name}
        style={{ ...base, objectFit: 'cover' }}
        className={className}
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback: coloured circle with initials
  return (
    <div
      style={{
        ...base,
        background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700,
        fontSize: size * 0.38,
        border: '2px solid rgba(255,255,255,0.09)',
        userSelect: 'none',
      }}
      className={className}
    >
      {initials}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Toast
───────────────────────────────────────────── */
function Toast({ message, type }) {
  return <div className={`toast ${type}`}>{message}</div>;
}

/* ─────────────────────────────────────────────
   Main component
───────────────────────────────────────────── */
export default function ChatLayout({ currentUser, onLogout }) {
  const [users,         setUsers]         = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [search,        setSearch]        = useState('');
  const [selectedUser,  setSelectedUser]  = useState(null);
  const [messages,      setMessages]      = useState([]);
  const [draft,         setDraft]         = useState('');
  const [socket,        setSocket]        = useState(null);
  const [online,        setOnline]        = useState(new Set());
  const [showSettings,  setShowSettings]  = useState(false);
  const [showInfo,      setShowInfo]      = useState(false);
  const [editingMsg,    setEditingMsg]    = useState(null);
  const [openMenuId,    setOpenMenuId]    = useState(null);
  const [uploading,     setUploading]     = useState(false);
  const [toast,         setToast]         = useState(null);
  const [showAdmin,     setShowAdmin]     = useState(false);

  // Call state
  const [incomingCall,  setIncomingCall]  = useState(null);  // { signal, from, name, type }
  const [activeCall,    setActiveCall]    = useState(null);  // { peerId, peerName, type, isInitiator, signal? }

  // Profile form
  const [pName,         setPName]         = useState(currentUser.name  || '');
  const [pAbout,        setPAbout]        = useState(currentUser.about || '');
  const [pAvatarFile,   setPAvatarFile]   = useState(null);
  const [pAvatarPrev,   setPAvatarPrev]   = useState(currentUser.avatar || null);
  const [pSaving,       setPSaving]       = useState(false);

  const endRef     = useRef(null);
  const fileRef    = useRef(null);
  const avatarRef  = useRef(null);
  const menuRef    = useRef(null);

  /* toast helper */
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  /* ── Socket ── */
  useEffect(() => {
    // In production, connect directly to the Render backend URL for WebSocket support.
    // In dev, connect to undefined (proxied via Vite).
    const BACKEND = import.meta.env.VITE_BACKEND_URL || undefined;
    const s = io(BACKEND, { withCredentials: true, path: '/socket.io', transports: ['websocket', 'polling'] });
    s.on('online_users_list', ids => setOnline(new Set(ids.map(Number))));
    s.on('user_online',  id => setOnline(p => { const n = new Set(p); n.add(Number(id));    return n; }));
    s.on('user_offline', id => setOnline(p => { const n = new Set(p); n.delete(Number(id)); return n; }));
    s.on('connect', () => s.emit('register', currentUser.id));

    // Incoming call
    s.on('call_incoming', (data) => {
      setIncomingCall(data);
    });

    // Other party ended call
    s.on('call_ended', () => {
      setActiveCall(null);
      setIncomingCall(null);
    });

    setSocket(s);
    return () => s.close();
  }, [currentUser.id]);

  const startCall = (type) => {
    if (!selectedUser) return;
    setActiveCall({ peerId: selectedUser.id, peerName: selectedUser.name, type, isInitiator: true });
  };

  const handleAcceptCall = () => {
    if (!incomingCall) return;
    setActiveCall({
      peerId: incomingCall.from,
      peerName: incomingCall.name,
      type: incomingCall.type,
      isInitiator: false,
      signal: incomingCall.signal
    });
    setIncomingCall(null);
  };

  const handleRejectCall = () => {
    if (incomingCall) {
      socket.emit('end_call', { to: incomingCall.from });
    }
    setIncomingCall(null);
  };

  const handleEndCall = () => {
    setActiveCall(null);
  };

  const handleDeleteChat = async () => {
    if (!selectedUser) return;
    const confirm = window.confirm(`Are you sure you want to delete all chats and remove ${selectedUser.name} from your contacts?`);
    if (!confirm) return;

    try {
      const res = await fetch(`${BACKEND}/api/messages/${selectedUser.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        showToast('Chat deleted and contact removed successfully');
        // Remove from local sidebar contacts list
        setUsers(prev => prev.filter(u => u.id !== selectedUser.id));
        setFilteredUsers(prev => prev.filter(u => u.id !== selectedUser.id));
        // Reset active chat
        setSelectedUser(null);
      } else {
        showToast('Failed to delete chat', 'error');
      }
    } catch (err) {
      showToast('Network error', 'error');
    }
  };

  useEffect(() => {
    if (!socket) return;
    const onMsg = (msg) => setMessages(prev => {
      const inConvo =
        msg.sender_id   === currentUser.id ||
        msg.receiver_id === currentUser.id ||
        (selectedUser && (msg.sender_id === selectedUser.id || msg.receiver_id === selectedUser.id));
      if (inConvo && !prev.find(m => m.id === msg.id)) return [...prev, msg];
      return prev;
    });
    const onUpd = (d) => setMessages(prev => prev.map(m => m.id === d.id ? { ...m, ...d } : m));
    const onSeen = (d) => {
      setMessages(prev => prev.map(m => 
        (m.sender_id === currentUser.id && m.receiver_id === d.by_user_id)
          ? { ...m, status: 'seen' }
          : m
      ));
    };
    socket.on('receive_message',  onMsg);
    socket.on('message_updated',  onUpd);
    socket.on('messages_seen',    onSeen);
    return () => { 
      socket.off('receive_message', onMsg); 
      socket.off('message_updated', onUpd); 
      socket.off('messages_seen', onSeen); 
    };
  }, [socket, selectedUser, currentUser.id]);

  /* ── Mark seen when viewing ── */
  useEffect(() => {
    if (socket && selectedUser && messages.length > 0) {
      const hasUnseen = messages.some(m => m.sender_id === selectedUser.id && m.status !== 'seen');
      if (hasUnseen) {
        socket.emit('mark_seen', { sender_id: selectedUser.id, receiver_id: currentUser.id });
        setMessages(prev => prev.map(m => m.sender_id === selectedUser.id ? { ...m, status: 'seen' } : m));
      }
    }
  }, [messages, selectedUser, socket, currentUser.id]);

  /* ── Fetch users ── */
  useEffect(() => {
    fetch(`${BACKEND}/api/users`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) { setUsers(d); setFilteredUsers(d); } })
      .catch(console.error);
  }, []);

  const isAdmin = currentUser.email === 'theijazlegacy@gmail.com';

  /* ── Search logic ──
     Admin: filter existing list by name or code
     Regular: search by exact 4-digit code via API */
  const [findResult,   setFindResult]   = useState(null);  // found user from API
  const [findError,    setFindError]    = useState('');    // error msg
  const [findLoading,  setFindLoading]  = useState(false);

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setFilteredUsers(users);
      setFindResult(null);
      setFindError('');
      return;
    }

    if (isAdmin) {
      // Admin: filter in place by name or code
      const ql = q.toLowerCase();
      setFilteredUsers(users.filter(u =>
        u.name?.toLowerCase().includes(ql) ||
        String(u.user_code).includes(q)
      ));
    } else {
      // Regular user: only allow 4-digit code search
      setFilteredUsers([]);
      if (/^\d{4}$/.test(q)) {
        setFindLoading(true);
        setFindError('');
        setFindResult(null);
        fetch(`${BACKEND}/api/users/find?code=${q}`, { credentials: 'include' })
          .then(r => r.json())
          .then(data => {
            if (data.error) { setFindError(data.error); setFindResult(null); }
            else setFindResult(data);
          })
          .catch(() => setFindError('Network error'))
          .finally(() => setFindLoading(false));
      } else {
        setFindResult(null);
        if (q.length === 4) setFindError('Enter a 4-digit number');
        else setFindError('');
      }
    }
  }, [search, users, isAdmin]);

  /* ── Fetch messages ── */
  useEffect(() => {
    if (!selectedUser) return;
    setShowInfo(false); setEditingMsg(null); setDraft(''); setOpenMenuId(null);
    fetch(`${BACKEND}/api/messages/${selectedUser.id}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setMessages(d); })
      .catch(console.error);
  }, [selectedUser]);

  /* ── Auto-scroll ── */
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  /* ── Close menu on outside click ── */
  useEffect(() => {
    const h = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenuId(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  /* ── Send / Edit ── */
  const handleSend = (e) => {
    e?.preventDefault();
    if (!draft.trim() || !selectedUser || !socket) return;
    if (editingMsg) {
      socket.emit('edit_message', { message_id: editingMsg.id, new_text: draft });
      setEditingMsg(null);
    } else {
      socket.emit('send_message', {
        sender_id: currentUser.id, receiver_id: selectedUser.id, text: draft,
      });
    }
    setDraft('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  /* ── File upload ── */
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedUser || !socket) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('media', file);
    try {
      const res  = await fetch(`${BACKEND}/api/messages/upload`, { method: 'POST', body: fd, credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        socket.emit('send_message', {
          sender_id: currentUser.id, receiver_id: selectedUser.id,
          text: file.name, attachment_url: data.url, attachment_type: data.type,
        });
      }
    } catch { showToast('Upload failed', 'error'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  /* ── Profile update ── */
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setPSaving(true);
    const fd = new FormData();
    fd.append('name', pName);
    fd.append('about', pAbout);
    if (pAvatarFile) fd.append('avatar', pAvatarFile);
    try {
      const res  = await fetch(`${BACKEND}/api/users/profile`, { method: 'PUT', body: fd, credentials: 'include' });
      const data = await res.json();
      if (data.success) { showToast('Profile updated!'); setShowSettings(false); setPAvatarFile(null); }
      else               showToast(data.error || 'Update failed', 'error');
    } catch { showToast('Network error', 'error'); }
    finally { setPSaving(false); }
  };

  /* ── Message actions ── */
  const startEdit = (msg) => { setEditingMsg(msg); setDraft(msg.text); setOpenMenuId(null); };
  const deleteMsg = (id)  => { if (socket) socket.emit('delete_message', { message_id: id }); setOpenMenuId(null); };

  const isOnline = id => online.has(Number(id));

  /* ── Attachment renderer ── */
  const renderAttachment = (msg) => {
    if (msg.is_deleted) return <span style={{ opacity: 0.55, fontStyle: 'italic' }}>{msg.text}</span>;
    if (!msg.attachment_url) return <span>{msg.text}</span>;
    const t = msg.attachment_type || '';
    if (t.startsWith('image/')) return (
      <img src={msg.attachment_url} alt="Attachment" className="attachment-image"
        onClick={() => window.open(msg.attachment_url, '_blank')} />
    );
    if (t.startsWith('audio/')) return (
      <audio controls src={msg.attachment_url} className="attachment-audio" />
    );
    return (
      <div className="attachment-doc">
        <FileText size={20} />
        <span className="attachment-doc-name">{msg.text}</span>
        <a href={msg.attachment_url} download target="_blank" rel="noopener noreferrer" className="attachment-doc-dl">
          <Download size={15} />
        </a>
      </div>
    );
  };

  /* ════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════ */
  return (
    <div className="app-layout glass-panel">

      {/* ══ SIDEBAR ══ */}
      <aside className="sidebar">

        {/* Header */}
        <div className="sidebar-header">
          <div className="user-profile"
            onClick={() => { setShowSettings(true); setSelectedUser(null); }}>
            <div className="avatar-wrap">
              <Avatar src={currentUser.avatar} name={currentUser.name} size={36} />
              {isOnline(currentUser.id) && <div className="online-dot" />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="user-name">{currentUser.name}</div>
              <div className="user-sub">My profile</div>
            </div>
          </div>
          <div className="sidebar-actions">
            <button className="icon-btn" title="Settings"
              onClick={() => { setShowSettings(true); setSelectedUser(null); }}>
              <SettingsIcon size={16} />
            </button>
            <button className="icon-btn" title="Log out" onClick={onLogout}>
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="sidebar-search">
          <div className="search-input-wrapper">
            <Search size={14} color="var(--text-muted)" />
            <input
              placeholder={isAdmin ? 'Search by name or ID…' : 'Find user by 4-digit ID…'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {!isAdmin && (
            <div style={{ padding: '4px 14px 2px', fontSize: '11px', color: 'var(--text-muted)' }}>
              Enter exact 4-digit ID to find someone new
            </div>
          )}
        </div>

        {/* Contact list */}
        <div className="contact-list">
          {/* Admin: normal filtered list */}
          {isAdmin ? (
            filteredUsers.length === 0 ? (
              <div className="contacts-empty">No contacts found</div>
            ) : (
              filteredUsers.map(user => (
                <div key={user.id}
                  className={`contact-item ${selectedUser?.id === user.id && !showSettings ? 'active' : ''}`}
                  onClick={() => { setSelectedUser(user); setShowSettings(false); }}>
                  <div className="avatar-wrap">
                    <Avatar src={user.avatar} name={user.name} size={40} />
                    {isOnline(user.id) && <div className="online-dot" />}
                  </div>
                  <div className="contact-info">
                    <div className="contact-name">{user.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={`contact-status ${isOnline(user.id) ? 'online' : ''}`}>
                        {isOnline(user.id) ? 'Online' : 'Offline'}
                      </span>
                      <span style={{
                        fontSize: '10.5px', color: 'var(--text-muted)',
                        background: 'var(--bg-hover)', borderRadius: '4px',
                        padding: '0px 5px', fontFamily: 'monospace'
                      }}>#{user.user_code}</span>
                    </div>
                  </div>
                </div>
              ))
            )
          ) : (
            /* Regular user: existing conversations + search result */
            <>
              {/* Search result from API */}
              {search.trim() ? (
                <>
                  {findLoading && (
                    <div className="contacts-empty" style={{ padding: '20px' }}>Searching...</div>
                  )}
                  {findError && !findLoading && (
                    <div className="contacts-empty" style={{ color: 'var(--red)', padding: '20px' }}>
                      {findError}
                    </div>
                  )}
                  {findResult && !findLoading && (
                    <div
                      className={`contact-item ${selectedUser?.id === findResult.id && !showSettings ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedUser(findResult);
                        setShowSettings(false);
                        // Add to users list so it shows in sidebar after
                        if (!users.find(u => u.id === findResult.id)) {
                          setUsers(prev => [...prev, findResult]);
                        }
                      }}>
                      <div className="avatar-wrap">
                        <Avatar src={findResult.avatar} name={findResult.name} size={40} />
                        {isOnline(findResult.id) && <div className="online-dot" />}
                      </div>
                      <div className="contact-info">
                        <div className="contact-name">{findResult.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className={`contact-status ${isOnline(findResult.id) ? 'online' : ''}`}>
                            {isOnline(findResult.id) ? 'Online' : 'Offline'}
                          </span>
                          <span style={{
                            fontSize: '10.5px', color: 'var(--accent)',
                            background: 'rgba(99,102,241,0.1)', borderRadius: '4px',
                            padding: '0px 5px', fontFamily: 'monospace'
                          }}>#{findResult.user_code}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* No search: show existing conversations */
                users.length === 0 ? (
                  <div className="contacts-empty" style={{ padding: '30px 16px', textAlign: 'center', lineHeight: 1.7 }}>
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔍</div>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>No conversations yet</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Enter a 4-digit user ID above to find someone</div>
                  </div>
                ) : (
                  users.map(user => (
                    <div key={user.id}
                      className={`contact-item ${selectedUser?.id === user.id && !showSettings ? 'active' : ''}`}
                      onClick={() => { setSelectedUser(user); setShowSettings(false); }}>
                      <div className="avatar-wrap">
                        <Avatar src={user.avatar} name={user.name} size={40} />
                        {isOnline(user.id) && <div className="online-dot" />}
                      </div>
                      <div className="contact-info">
                        <div className="contact-name">{user.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className={`contact-status ${isOnline(user.id) ? 'online' : ''}`}>
                            {isOnline(user.id) ? 'Online' : 'Offline'}
                          </span>
                          <span style={{
                            fontSize: '10.5px', color: 'var(--text-muted)',
                            background: 'var(--bg-hover)', borderRadius: '4px',
                            padding: '0px 5px', fontFamily: 'monospace'
                          }}>#{user.user_code}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )
              )}
            </>
          )}
        </div>
      </aside>

      {/* ══ MAIN CHAT AREA ══ */}
      <div className="chat-area">

        {/* Settings modal */}
        {showSettings && (
          <div className="settings-overlay"
            onClick={e => { if (e.target === e.currentTarget) setShowSettings(false); }}>
            <div className="settings-modal">
              <div className="settings-modal-header">
                <h2>Edit Profile</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {currentUser.email === 'theijazlegacy@gmail.com' && (
                    <button className="icon-btn" title="Admin Control Panel" onClick={() => { setShowAdmin(true); setShowSettings(false); }}>
                      <Shield size={16} color="var(--accent)" />
                    </button>
                  )}
                  <button className="icon-btn" onClick={() => setShowSettings(false)}>
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="settings-modal-body">
                <form onSubmit={handleUpdateProfile}>

                  {/* Avatar upload */}
                  <div className="avatar-upload-widget">
                    <div className="avatar-upload-circle"
                      onClick={() => avatarRef.current?.click()}>
                      <Avatar
                        src={pAvatarPrev}
                        name={pName}
                        size={80}
                      />
                      <div className="avatar-upload-overlay">
                        <Camera size={18} color="white" />
                        <span>Change</span>
                      </div>
                    </div>
                    <input type="file" accept="image/*" ref={avatarRef}
                      style={{ display: 'none' }}
                      onChange={e => {
                        const f = e.target.files[0];
                        if (!f) return;
                        setPAvatarFile(f);
                        setPAvatarPrev(URL.createObjectURL(f));
                      }} />
                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      Click to change photo
                    </span>
                  </div>

                  {/* Google badge */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '9px 13px', marginBottom: '10px',
                    background: 'rgba(79,142,247,0.07)',
                    border: '1px solid rgba(79,142,247,0.14)',
                    borderRadius: 'var(--r-md)',
                  }}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="15" height="15">
                      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z"/>
                      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z"/>
                    </svg>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Signed in via Google · {currentUser.email}
                    </span>
                  </div>

                  {/* Copyable User Code */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', marginBottom: '18px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-md)',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Your User ID
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                        #{currentUser.user_code}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: '6px 12px', fontSize: '12px', background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                      onClick={() => {
                        navigator.clipboard.writeText(String(currentUser.user_code));
                        showToast('Copied User ID to clipboard!');
                      }}
                    >
                      Copy
                    </button>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Display Name</label>
                    <input className="form-input" type="text" value={pName}
                      onChange={e => setPName(e.target.value)} placeholder="Your name" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">About / Status</label>
                    <input className="form-input" type="text" value={pAbout}
                      onChange={e => setPAbout(e.target.value)} placeholder="e.g. Available" />
                  </div>

                  <button type="submit" className="btn btn-primary"
                    style={{ width: '100%', marginTop: '4px' }} disabled={pSaving}>
                    {pSaving ? 'Saving…' : <><Check size={14} /> Save Changes</>}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {!selectedUser ? (
          <div className="empty-chat">
            <div className="empty-chat-icon">
              <MessageSquare size={34} color="var(--accent)" />
            </div>
            <h3>Start a Conversation</h3>
            <p>Select a contact on the left to begin chatting</p>
          </div>
        ) : (
          <>
            {/* ── Chat header ── */}
            <div className="chat-header">
              <div className="chat-header-info" onClick={() => setShowInfo(v => !v)}>
                <div className="avatar-wrap">
                  <Avatar src={selectedUser.avatar} name={selectedUser.name} size={36} />
                  {isOnline(selectedUser.id) && <div className="online-dot" />}
                </div>
                <div>
                  <div className="chat-user-name">{selectedUser.name}</div>
                  <div className={`chat-status ${isOnline(selectedUser.id) ? 'online' : ''}`}>
                    {isOnline(selectedUser.id) ? 'Online' : 'Offline'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button className="icon-btn" title="Voice Call" onClick={() => startCall('audio')}>
                  <Phone size={17} color="var(--green)" />
                </button>
                <button className="icon-btn" title="Video Call" onClick={() => startCall('video')}>
                  <Video size={17} color="var(--accent)" />
                </button>
                <button className="icon-btn" title="Delete Chat / Contact" onClick={handleDeleteChat} style={{ color: 'var(--red)' }}>
                  <Trash2 size={16} />
                </button>
                <button className="icon-btn" title="Contact info"
                  onClick={() => setShowInfo(v => !v)}>
                  <Info size={17} />
                </button>
              </div>
            </div>

            {/* ── Body row (messages + contact info) ── */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

              {/* Messages column */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* Messages */}
                <div className="messages-container">
                  {messages.map((msg, idx) => {
                    const sent    = msg.sender_id === currentUser.id;
                    const time    = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const canEdit = sent && !msg.is_deleted && Date.now() - new Date(msg.created_at).getTime() < 5 * 60000;
                    const menuOpen = openMenuId === msg.id;

                    return (
                      <div key={msg.id ?? idx}
                        className={`message-wrapper ${sent ? 'sent' : 'received'}`}>

                        {/* Three-dot (sent only) */}
                        {sent && !msg.is_deleted && (
                          <div className="message-action-area" ref={menuOpen ? menuRef : null}>
                            <button className="msg-dots-btn"
                              onClick={() => setOpenMenuId(menuOpen ? null : msg.id)}>
                              <MoreVertical size={14} />
                            </button>
                            {menuOpen && (
                              <div className="msg-dropdown">
                                {canEdit && (
                                  <button className="msg-dropdown-item" onClick={() => startEdit(msg)}>
                                    <Edit2 size={13} /> Edit
                                  </button>
                                )}
                                <button className="msg-dropdown-item danger" onClick={() => deleteMsg(msg.id)}>
                                  <Trash2 size={13} /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Bubble */}
                        <div className={`message ${sent ? 'sent' : 'received'} ${msg.is_deleted ? 'deleted' : ''}`}>
                          {renderAttachment(msg)}
                          <div className="message-time" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {time}
                            {msg.is_edited && !msg.is_deleted && (
                              <span className="message-edited">· edited</span>
                            )}
                            {sent && !msg.is_deleted && (
                              <span style={{ display: 'flex', alignItems: 'center', marginLeft: '2px' }}>
                                {msg.status === 'seen' ? (
                                  <CheckCheck size={14} color="#3ecf70" />
                                ) : (
                                  <Check size={14} color="var(--text-muted)" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={endRef} />
                </div>

                {/* Input */}
                <div className="chat-input-area">
                  {editingMsg && (
                    <div className="edit-banner">
                      <span>Editing message</span>
                      <button style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
                        onClick={() => { setEditingMsg(null); setDraft(''); }}>
                        <X size={13} />
                      </button>
                    </div>
                  )}
                  <div className="input-container">
                    <input type="file" ref={fileRef} style={{ display: 'none' }} onChange={handleFileUpload} />
                    <button className="icon-btn" title="Attach file"
                      onClick={() => fileRef.current?.click()} disabled={uploading}>
                      <Paperclip size={16} color={uploading ? 'var(--text-muted)' : 'var(--text-secondary)'} />
                    </button>
                    <textarea className="chat-input" rows={1}
                      placeholder={editingMsg ? 'Edit message…' : 'Type a message…'}
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={handleKeyDown}
                    />
                    <button className="send-btn" onClick={handleSend} disabled={!draft.trim()}>
                      <Send size={15} />
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Contact info panel ── */}
              {showInfo && (
                <div className="contact-info-panel">

                  {/* Avatar – uses same error-safe Avatar component */}
                  <div style={{ marginBottom: '14px' }}>
                    <Avatar src={selectedUser.avatar} name={selectedUser.name} size={84} />
                  </div>

                  <h3>{selectedUser.name}</h3>

                  {/* Online status */}
                  <div className="contact-info-status">
                    <div className={`contact-info-status-dot ${isOnline(selectedUser.id) ? 'online' : 'offline'}`} />
                    <span className="contact-info-status-text"
                      style={{ color: isOnline(selectedUser.id) ? 'var(--green)' : 'var(--text-muted)', fontSize: '12px' }}>
                      {isOnline(selectedUser.id) ? 'Online now' : 'Offline'}
                    </span>
                  </div>

                  <div className="info-card">
                    <div className="info-card-label">User ID</div>
                    <div className="info-card-value" style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                      #{selectedUser.user_code}
                    </div>
                  </div>

                  {selectedUser.email && (
                    <div className="info-card">
                      <div className="info-card-label">Email</div>
                      <div className="info-card-value">{selectedUser.email}</div>
                    </div>
                  )}

                  <div className="info-card">
                    <div className="info-card-label">About</div>
                    <div className="info-card-value">{selectedUser.about || 'Available'}</div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Admin Panel Modal Overlay */}
      {showAdmin && (
        <AdminPanel onClose={() => setShowAdmin(false)} showToast={showToast} />
      )}

      {/* Incoming Call Popup */}
      <IncomingCallDialog
        call={incomingCall}
        onAccept={handleAcceptCall}
        onReject={handleRejectCall}
      />

      {/* Active Call Screen */}
      {activeCall && (
        <CallModal
          callActive={true}
          callType={activeCall.type}
          peerId={activeCall.peerId}
          peerName={activeCall.peerName}
          isInitiator={activeCall.isInitiator}
          incomingSignal={activeCall.signal}
          socket={socket}
          currentUser={currentUser}
          onEndCall={handleEndCall}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
