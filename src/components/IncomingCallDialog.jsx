import React from 'react';
import { Phone, Video, PhoneOff } from 'lucide-react';

export default function IncomingCallDialog({ call, onAccept, onReject }) {
  if (!call) return null;

  const isVideo = call.type === 'video';

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: 'var(--bg-secondary)', padding: '30px', borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-lg)', textAlign: 'center', minWidth: '300px',
        animation: 'callPulse 2s infinite'
      }}>
        <div style={{
          width: '80px', height: '80px', borderRadius: '50%', background: 'var(--bg-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
          color: 'var(--accent)'
        }}>
          {isVideo ? <Video size={40} /> : <Phone size={40} />}
        </div>
        <h3 style={{ marginBottom: '8px', color: 'var(--text-primary)' }}>Incoming {isVideo ? 'Video' : 'Voice'} Call</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '30px', fontSize: '18px' }}>
          <strong>{call.name}</strong> is calling you...
        </p>
        
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
          <button 
            onClick={onReject}
            title="Reject Call"
            style={{
              width: '60px', height: '60px', borderRadius: '50%', background: 'var(--red)',
              color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)'
            }}
          >
            <PhoneOff size={24} />
          </button>
          
          <button 
            onClick={onAccept}
            title="Accept Call"
            style={{
              width: '60px', height: '60px', borderRadius: '50%', background: 'var(--green)',
              color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(62, 207, 112, 0.4)'
            }}
          >
            {isVideo ? <Video size={24} /> : <Phone size={24} />}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes callPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.02); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
