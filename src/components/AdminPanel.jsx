import React, { useState, useEffect } from 'react';
import { Shield, X, Edit, Trash2, Check, RefreshCw, Key, Eye, EyeOff, MessageSquare, Video, Play } from 'lucide-react';

const BACKEND = import.meta.env.VITE_BACKEND_URL || '';

const getToken = () => localStorage.getItem('messenger_token');
const authFetch = (url, options = {}) => fetch(url, {
  ...options,
  headers: {
    ...(options.headers || {}),
    'Authorization': `Bearer ${getToken()}`,
  },
}).then(res => {
  if (res.status === 401) {
    localStorage.removeItem('messenger_token');
    window.location.reload();
  }
  return res;
});

export default function AdminPanel({ onClose, showToast }) {
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem('messenger_admin_key') || '');
  const [showPassword, setShowPassword] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [editingUserId, setEditingUserId] = useState(null);
  
  // Edit form state
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAbout, setEditAbout] = useState('');
  const [editCode, setEditCode] = useState('');
  const [saving, setSaving] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'recordings'

  // View chats state
  const [viewingChatsFor, setViewingChatsFor] = useState(null);
  const [chats, setChats] = useState([]);

  // Recordings state
  const [recordings, setRecordings] = useState([]);
  const [loadingRec, setLoadingRec] = useState(false);
  const [playingUrl, setPlayingUrl] = useState(null);

  const fetchAdminData = async (keyToUse = adminKey) => {
    try {
      const statsRes = await authFetch(`${BACKEND}/admin/stats?key=${keyToUse}`, {});
      if (!statsRes.ok) throw new Error();
      const statsData = await statsRes.json();
      
      const usersRes = await authFetch(`${BACKEND}/admin/users?key=${keyToUse}`, {});
      const usersData = await usersRes.json();
      
      setStats(statsData);
      setUsers(usersData);
      setAuthorized(true);
      localStorage.setItem('messenger_admin_key', keyToUse);
    } catch (err) {
      setAuthorized(false);
      showToast('Invalid Admin Key', 'error');
    }
  };

  useEffect(() => {
    // Only auto-fetch if we have a saved key
    const saved = localStorage.getItem('messenger_admin_key');
    if (saved) {
      fetchAdminData(saved).catch(() => {});
    }
  }, []);

  const handleAuthSubmit = (e) => {
    e.preventDefault();
    fetchAdminData();
  };

  const startEdit = (user) => {
    setEditingUserId(user.id);
    setEditName(user.name || '');
    setEditEmail(user.email || '');
    setEditAbout(user.about || '');
    setEditCode(user.user_code || '');
  };

  const handleUpdate = async (userId) => {
    setSaving(true);
    try {
      const res = await authFetch(`${BACKEND}/admin/users/${userId}?key=${adminKey}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          email: editEmail,
          about: editAbout,
          user_code: editCode
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast('User details updated successfully');
        setEditingUserId(null);
        fetchAdminData();
      } else {
        showToast(data.error || 'Update failed', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (userId, userName) => {
    if (!window.confirm(`Are you sure you want to delete user "${userName}"? This will permanently remove all their messages.`)) return;
    try {
      const res = await authFetch(`${BACKEND}/admin/users/${userId}?key=${adminKey}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        showToast(`User ${userName} deleted`);
        fetchAdminData();
      } else {
        showToast('Failed to delete user', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
  };

  const handleViewChats = async (user) => {
    try {
      const res = await authFetch(`${BACKEND}/admin/users/${user.id}/chats?key=${adminKey}`, {});
      if (res.ok) {
        const data = await res.json();
        setChats(data);
        setViewingChatsFor(user);
      } else {
        showToast('Failed to fetch chats', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    }
  };

  const fetchRecordings = async () => {
    setLoadingRec(true);
    try {
      const res = await authFetch(`${BACKEND}/admin/recordings?key=${adminKey}`, {});
      if (res.ok) {
        const data = await res.json();
        setRecordings(data);
      } else {
        showToast('Failed to load recordings', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setLoadingRec(false);
    }
  };

  return (
    <div className="settings-overlay" style={{ zIndex: 300 }}>
      <div className="settings-modal" style={{ maxWidth: '900px', width: '90%' }}>
        <div className="settings-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={18} color="var(--accent)" />
            <h2>Admin Control Panel</h2>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="settings-modal-body" style={{ maxHeight: '80vh', overflowY: 'auto', padding: '20px' }}>
          {!authorized ? (
            <form onSubmit={handleAuthSubmit} style={{ maxWidth: '360px', margin: '40px auto', textAlign: 'center' }}>
              <div className="empty-chat-icon" style={{ margin: '0 auto 20px' }}>
                <Key size={30} color="var(--accent)" />
              </div>
              <h3 style={{ marginBottom: '10px' }}>Enter Admin Secret Key</h3>
              <div className="form-group" style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Enter admin key..."
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  required
                  style={{ paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer'
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                Authorize Access
              </button>
            </form>
          ) : (
            <div>
              {/* Stats Banner */}
              {stats && (
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: '12px', marginBottom: '20px'
                }}>
                  {[
                    { label: 'Total Users', val: stats.total_users },
                    { label: 'Online Users', val: stats.online_users, color: 'var(--green)' },
                    { label: 'Total Messages', val: stats.total_messages }
                  ].map((s, idx) => (
                    <div key={idx} className="info-card" style={{ margin: 0, padding: '14px' }}>
                      <div className="info-card-label">{s.label}</div>
                      <div className="info-card-value" style={{ fontSize: '20px', fontWeight: 700, color: s.color || 'inherit', marginTop: '4px' }}>
                        {s.val}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab Switcher */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '18px', background: 'var(--bg-primary)', padding: '4px', borderRadius: 'var(--r-md)', width: 'fit-content' }}>
                {[
                  { id: 'users', label: '👥 Users' },
                  { id: 'recordings', label: '📼 Recordings' }
                ].map(tab => (
                  <button key={tab.id}
                    onClick={() => { setActiveTab(tab.id); if (tab.id === 'recordings') fetchRecordings(); }}
                    style={{
                      padding: '7px 18px', borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer',
                      background: activeTab === tab.id ? 'var(--accent)' : 'transparent',
                      color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)',
                      fontWeight: activeTab === tab.id ? 600 : 400, fontSize: '13px',
                      transition: 'all 0.2s'
                    }}
                  >{tab.label}</button>
                ))}
              </div>

              {activeTab === 'users' && (
              <div>
              {/* Users List Table */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Manage System Users</h3>
                <button className="icon-btn" onClick={() => fetchAdminData()} title="Refresh"><RefreshCw size={14} /></button>
              </div>

              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--bg-primary)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontWeight: 500 }}>User</th>
                      <th style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontWeight: 500 }}>User ID (4-digit)</th>
                      <th style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontWeight: 500 }}>Email Address</th>
                      <th style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontWeight: 500 }}>Status / About</th>
                      <th style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontWeight: 500, textAlign: 'center' }}>Msgs</th>
                      <th style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontWeight: 500, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => {
                      const isEditing = editingUserId === u.id;
                      return (
                        <tr key={u.id} style={{ borderBottom: '1px solid var(--border-light)', verticalAlign: 'middle' }}>
                          {/* Name & Avatar */}
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <img src={u.avatar} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                                onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${u.name}&background=4f8ef7&color=fff`; }} />
                              <div>
                                {isEditing ? (
                                  <input type="text" className="form-input" style={{ padding: '4px 8px', fontSize: '12px', width: '130px' }}
                                    value={editName} onChange={e => setEditName(e.target.value)} />
                                ) : (
                                  <span style={{ fontWeight: 500 }}>{u.name}</span>
                                )}
                                <div style={{ fontSize: '10px', color: u.is_online ? 'var(--green)' : 'var(--text-muted)' }}>
                                  {u.is_online ? 'Online' : 'Offline'}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Unique user code */}
                          <td style={{ padding: '12px 14px', fontFamily: 'monospace' }}>
                            {isEditing ? (
                              <input type="text" className="form-input" style={{ padding: '4px 8px', fontSize: '12px', width: '70px', fontFamily: 'monospace' }}
                                value={editCode} onChange={e => setEditCode(e.target.value)} maxLength={4} />
                            ) : (
                              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>#{u.user_code}</span>
                            )}
                          </td>

                          {/* Email */}
                          <td style={{ padding: '12px 14px' }}>
                            {isEditing ? (
                              <input type="email" className="form-input" style={{ padding: '4px 8px', fontSize: '12px', width: '160px' }}
                                value={editEmail} onChange={e => setEditEmail(e.target.value)} />
                            ) : (
                              u.email
                            )}
                          </td>

                          {/* Status */}
                          <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                            {isEditing ? (
                              <input type="text" className="form-input" style={{ padding: '4px 8px', fontSize: '12px', width: '130px' }}
                                value={editAbout} onChange={e => setEditAbout(e.target.value)} />
                            ) : (
                              u.about || 'Available'
                            )}
                          </td>

                          {/* Msg Count */}
                          <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 500 }}>
                            {u.message_count}
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button className="icon-btn" title="View Chats" onClick={() => handleViewChats(u)}
                                style={{ color: 'var(--accent)' }}>
                                <MessageSquare size={14} />
                              </button>
                              {isEditing ? (
                                <button className="icon-btn" title="Save" onClick={() => handleUpdate(u.id)} disabled={saving}
                                  style={{ background: 'rgba(62,207,112,0.1)', color: 'var(--green)' }}>
                                  <Check size={14} />
                                </button>
                              ) : (
                                <button className="icon-btn" title="Edit" onClick={() => startEdit(u)}>
                                  <Edit size={14} />
                                </button>
                              )}
                              <button className="icon-btn" title="Delete Account" onClick={() => handleDelete(u.id, u.name)}
                                style={{ color: 'var(--red)' }}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </div>
              )}

              {activeTab === 'recordings' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Call Recordings</h3>
                    <button className="icon-btn" onClick={fetchRecordings} title="Refresh"><RefreshCw size={14} /></button>
                  </div>

                  {loadingRec ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading...</div>
                  ) : recordings.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: '40px', marginBottom: '12px' }}>📼</div>
                      No recordings yet. Recordings are saved when a call ends.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {recordings.map(rec => {
                        const date = new Date(rec.created_at).toLocaleString();
                        const mins = Math.floor((rec.duration_seconds || 0) / 60);
                        const secs = (rec.duration_seconds || 0) % 60;
                        const duration = `${mins}:${String(secs).padStart(2, '0')}`;
                        return (
                          <div key={rec.id} style={{
                            background: 'var(--bg-primary)', padding: '14px 16px',
                            borderRadius: 'var(--r-md)', border: '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', gap: '14px'
                          }}>
                            <div style={{
                              width: '42px', height: '42px', borderRadius: '50%',
                              background: rec.call_type === 'video' ? 'rgba(99,102,241,0.15)' : 'rgba(62,207,112,0.15)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                            }}>
                              <Video size={18} color={rec.call_type === 'video' ? 'var(--accent)' : 'var(--green)'} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '3px' }}>
                                {rec.caller_name} #{rec.caller_code} → {rec.receiver_name} #{rec.receiver_code}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '12px' }}>
                                <span>{rec.call_type === 'video' ? '📹 Video' : '🎤 Voice'}</span>
                                <span>⏱ {duration}</span>
                                <span>📅 {date}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => setPlayingUrl(rec.recording_url)}
                              style={{
                                padding: '7px 14px', borderRadius: 'var(--r-sm)', border: 'none',
                                background: 'var(--accent)', color: '#fff', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 600
                              }}
                            >
                              <Play size={13} /> Play
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {/* View Chats Modal Overlay */}
      {viewingChatsFor && (
        <div className="settings-overlay" style={{ zIndex: 400 }}>
          <div className="settings-modal" style={{ maxWidth: '700px', width: '90%' }}>
            <div className="settings-modal-header">
              <h2>Message History: {viewingChatsFor.name}</h2>
              <button className="icon-btn" onClick={() => setViewingChatsFor(null)}><X size={16} /></button>
            </div>
            <div className="settings-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', padding: '20px', background: 'var(--bg-secondary)' }}>
              {chats.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No messages found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {chats.map(msg => {
                    const isSender = msg.sender_id === viewingChatsFor.id;
                    const date = new Date(msg.created_at).toLocaleString();
                    return (
                      <div key={msg.id} style={{
                        background: 'var(--bg-primary)', padding: '12px', borderRadius: 'var(--r-md)',
                        borderLeft: `4px solid ${isSender ? 'var(--accent)' : 'var(--border)'}`,
                        opacity: msg.is_deleted ? 0.6 : 1
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                          <span style={{ fontWeight: 600, color: isSender ? 'var(--accent)' : 'var(--text-secondary)' }}>
                            {isSender ? 'From: ' + viewingChatsFor.name : 'From: ' + msg.sender_name}
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>{date}</span>
                        </div>
                        <div style={{ fontSize: '13.5px', marginBottom: '4px' }}>
                          {msg.is_deleted ? <span style={{ fontStyle: 'italic' }}>Message deleted</span> : msg.text}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>
                          To: {isSender ? msg.receiver_name : viewingChatsFor.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}\n\n      {/* Recording Player Popup */}
      {playingUrl && (
        <div className="settings-overlay" style={{ zIndex: 500, background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setPlayingUrl(null)}>
          <div style={{ maxWidth: '780px', width: '90%', background: 'var(--bg-primary)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Play size={15} color="var(--accent)" /> Playing Recording
              </div>
              <button className="icon-btn" onClick={() => setPlayingUrl(null)}><X size={16} /></button>
            </div>
            <video
              src={playingUrl}
              controls
              autoPlay
              style={{ width: '100%', display: 'block', maxHeight: '70vh', background: '#000' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
