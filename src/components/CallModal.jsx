import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone } from 'lucide-react';

const CLOUDINARY_CLOUD  = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

// Free STUN + Open Relay TURN — works across mobile networks
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

export default function CallModal({
  callActive, callType, peerId, peerName,
  isInitiator, socket, currentUser, incomingSignal, onEndCall,
}) {
  const [micEnabled,   setMicEnabled]   = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [callStatus,   setCallStatus]   = useState(isInitiator ? 'Calling…' : 'Connecting…');
  const [hasRemote,    setHasRemote]    = useState(false);
  const [uploading,    setUploading]    = useState(false);

  const localVideoRef     = useRef(null);
  const remoteMediaRef    = useRef(null);   // <video> or <audio> depending on callType
  const pcRef             = useRef(null);
  const localStreamRef    = useRef(null);
  const pendingCandidates = useRef([]);     // buffer ICE candidates until remote desc is set
  const remoteDescSet     = useRef(false);
  const mediaRecorderRef  = useRef(null);
  const recordedChunks    = useRef([]);
  const callStartTime     = useRef(null);
  const endedRef          = useRef(false);

  /* ── Flush buffered ICE candidates ── */
  const flushCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !remoteDescSet.current) return;
    while (pendingCandidates.current.length > 0) {
      const c = pendingCandidates.current.shift();
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); }
      catch (e) { console.warn('[ICE] addIceCandidate error:', e.message); }
    }
  }, []);

  /* ── Recording helpers ── */
  const startRecording = (stream) => {
    recordedChunks.current = [];
    callStartTime.current  = Date.now();
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm';
    try {
      const mr = new MediaRecorder(stream, { mimeType: mime });
      mr.ondataavailable = (e) => { if (e.data?.size > 0) recordedChunks.current.push(e.data); };
      mr.start(1000);
      mediaRecorderRef.current = mr;
    } catch (e) { console.warn('[Recording] start failed:', e); }
  };

  const uploadRecording = async () => {
    const chunks = recordedChunks.current;
    if (!chunks.length || !CLOUDINARY_CLOUD || !CLOUDINARY_PRESET) return;
    const blob = new Blob(chunks, { type: 'video/webm' });
    const duration = Math.round((Date.now() - callStartTime.current) / 1000);
    setUploading(true);
    try {
      const fd = new FormData();
      const name = `call_${currentUser.id}_${peerId}_${Date.now()}`;
      fd.append('file', blob, name + '.webm');
      fd.append('upload_preset', CLOUDINARY_PRESET);
      fd.append('resource_type', 'video');
      fd.append('public_id', name);
      const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/video/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.secure_url) {
        socket.emit('save_recording', {
          caller_id: currentUser.id, receiver_id: peerId,
          call_type: callType, recording_url: data.secure_url, duration_seconds: duration,
        });
      }
    } catch (e) { console.error('[Recording] upload failed:', e); }
    finally { setUploading(false); }
  };

  /* ── Main call initialisation ── */
  useEffect(() => {
    if (!callActive || !socket) return;

    let cancelled = false;
    endedRef.current = false;

    const init = async () => {
      try {
        // 1. Get local media
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callType === 'video' ? { facingMode: 'user' } : false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        localStreamRef.current = stream;

        // Show local preview
        if (localVideoRef.current && callType === 'video') {
          localVideoRef.current.srcObject = stream;
        }

        // 2. Create peer connection
        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;

        // 3. Add local tracks
        stream.getTracks().forEach(t => pc.addTrack(t, stream));

        // 4. Handle incoming remote track
        pc.ontrack = (e) => {
          const remote = e.streams[0];
          if (remoteMediaRef.current) {
            remoteMediaRef.current.srcObject = remote;
          }
          setHasRemote(true);
          setCallStatus('Connected');

          // Start recording combined stream
          const combined = new MediaStream([
            ...stream.getTracks(),
            ...remote.getTracks(),
          ]);
          startRecording(combined);
        };

        // 5. Send ICE candidates
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit('ice_candidate', { to: peerId, candidate: e.candidate });
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log('[ICE] state:', pc.iceConnectionState);
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            setCallStatus('Connected');
          } else if (pc.iceConnectionState === 'failed') {
            setCallStatus('Connection failed');
          }
        };

        // 6. Signaling — initiator creates offer, answerer sets remote + answers
        if (isInitiator) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('call_user', {
            userToCall: peerId,
            signalData: offer,
            from: currentUser.id,
            name: currentUser.name,
            type: callType,
          });
        } else {
          // Answerer: set remote description from the incoming signal first
          await pc.setRemoteDescription(new RTCSessionDescription(incomingSignal));
          remoteDescSet.current = true;
          await flushCandidates();

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('answer_call', { to: peerId, signal: answer });
        }
      } catch (err) {
        console.error('[Call] init error:', err);
        setCallStatus('Failed: ' + (err.message || 'Could not access camera/mic'));
      }
    };

    init();
    return () => { cancelled = true; };
  }, [callActive, socket]); // eslint-disable-line

  /* ── Socket event handlers for signaling ── */
  useEffect(() => {
    if (!socket) return;

    const onCallAccepted = async (signal) => {
      const pc = pcRef.current;
      if (!pc || pc.signalingState === 'closed') return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        remoteDescSet.current = true;
        await flushCandidates();
      } catch (e) { console.error('[Call] setRemoteDescription error:', e); }
    };

    const onIceCandidate = async (candidate) => {
      if (!remoteDescSet.current) {
        // Buffer until remote description is set
        pendingCandidates.current.push(candidate);
        return;
      }
      const pc = pcRef.current;
      if (!pc || pc.signalingState === 'closed') return;
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (e) { console.warn('[ICE] add error:', e.message); }
    };

    socket.on('call_accepted',  onCallAccepted);
    socket.on('ice_candidate',  onIceCandidate);
    return () => {
      socket.off('call_accepted', onCallAccepted);
      socket.off('ice_candidate', onIceCandidate);
    };
  }, [socket, flushCandidates]);

  /* ── End call ── */
  const endCall = useCallback(async () => {
    if (endedRef.current) return;
    endedRef.current = true;

    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      await new Promise(r => setTimeout(r, 400));
    }
    socket.emit('end_call', { to: peerId });
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    await uploadRecording();
    onEndCall();
  }, [socket, peerId, onEndCall]); // eslint-disable-line

  /* ── Controls ── */
  const toggleMic = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setMicEnabled(track.enabled); }
  };

  const toggleVideo = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setVideoEnabled(track.enabled); }
  };

  if (!callActive) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: '#0d0d0d',
      display: 'flex', flexDirection: 'column', zIndex: 2000,
    }}>
      {/* Header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, padding: '20px 24px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        color: 'white', zIndex: 10,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>{peerName}</h2>
          <div style={{ fontSize: '13px', color: '#aaa', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block',
              background: callStatus === 'Connected' ? '#3ecf70' : '#f59e0b',
              animation: callStatus !== 'Connected' ? 'pulse 1.5s infinite' : 'none',
            }} />
            {uploading ? '📤 Saving recording…' : callStatus}
          </div>
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '20px' }}>
          🔴 REC
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {callType === 'video' ? (
          <>
            {/* Remote video — always in DOM so ref is ready when ontrack fires */}
            <video
              ref={remoteMediaRef}
              autoPlay playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: hasRemote ? 'block' : 'none' }}
            />
            {!hasRemote && (
              <div style={{ color: '#555', textAlign: 'center', position: 'absolute' }}>
                <div style={{ fontSize: '64px', marginBottom: '12px' }}>📹</div>
                <div style={{ fontSize: '16px' }}>Waiting for {peerName}…</div>
              </div>
            )}
            {/* Local preview (mini) */}
            <div style={{
              position: 'absolute', bottom: '110px', right: '20px',
              width: '120px', height: '160px', borderRadius: '14px',
              overflow: 'hidden', background: '#111', zIndex: 10,
              border: '2px solid rgba(255,255,255,0.12)',
              boxShadow: '0 6px 24px rgba(0,0,0,0.7)',
            }}>
              <video ref={localVideoRef} autoPlay playsInline muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            {/* Audio element for remote voice — always in DOM */}
            <audio ref={remoteMediaRef} autoPlay playsInline style={{ display: 'none' }} />
            <div style={{
              width: '130px', height: '130px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #4f8ef7, #3ecf70)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', margin: '0 auto 20px',
              boxShadow: hasRemote ? '0 0 40px rgba(62,207,112,0.4)' : 'none',
              animation: !hasRemote ? 'ringPulse 2s infinite' : 'none',
            }}>
              <Phone size={55} />
            </div>
            <div style={{ color: '#aaa', fontSize: '16px' }}>
              {hasRemote ? 'Voice Call Active' : callStatus}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, padding: '28px 0 40px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
        display: 'flex', justifyContent: 'center', gap: '20px', zIndex: 10,
      }}>
        <CtrlBtn active={micEnabled} onClick={toggleMic} title={micEnabled ? 'Mute' : 'Unmute'}>
          {micEnabled ? <Mic size={22} /> : <MicOff size={22} />}
        </CtrlBtn>
        {callType === 'video' && (
          <CtrlBtn active={videoEnabled} onClick={toggleVideo} title={videoEnabled ? 'Camera off' : 'Camera on'}>
            {videoEnabled ? <Video size={22} /> : <VideoOff size={22} />}
          </CtrlBtn>
        )}
        <button onClick={endCall} disabled={uploading} title="End Call" style={{
          width: '64px', height: '64px', borderRadius: '50%',
          background: '#e55353', color: 'white', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(229,83,83,0.5)',
          opacity: uploading ? 0.6 : 1,
        }}>
          <PhoneOff size={24} />
        </button>
      </div>

      <style>{`
        @keyframes ringPulse {
          0%   { box-shadow: 0 0 0 0 rgba(79,142,247,0.5); }
          70%  { box-shadow: 0 0 0 28px rgba(79,142,247,0); }
          100% { box-shadow: 0 0 0 0 rgba(79,142,247,0); }
        }
        @keyframes pulse {
          0%,100% { opacity:1; } 50% { opacity:0.3; }
        }
      `}</style>
    </div>
  );
}

function CtrlBtn({ active, onClick, title, children }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: '56px', height: '56px', borderRadius: '50%', border: 'none',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: active ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.85)',
      color: active ? 'white' : '#111',
      backdropFilter: 'blur(10px)',
      transition: 'all 0.2s',
      boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
    }}>
      {children}
    </button>
  );
}
