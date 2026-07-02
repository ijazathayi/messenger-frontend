import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone } from 'lucide-react';

const CLOUDINARY_CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export default function CallModal({
  callActive,
  callType,
  peerId,
  peerName,
  isInitiator,
  socket,
  currentUser,
  incomingSignal,
  onEndCall
}) {
  const [stream,        setStream]        = useState(null);
  const [micEnabled,   setMicEnabled]    = useState(true);
  const [videoEnabled, setVideoEnabled]  = useState(callType === 'video');
  const [remoteStream, setRemoteStream]  = useState(null);
  const [callStatus,   setCallStatus]    = useState(isInitiator ? 'Calling...' : 'Connecting...');
  const [uploading,    setUploading]     = useState(false);

  const localVideoRef  = useRef();
  const remoteVideoRef = useRef();
  const peerConnectionRef = useRef(null);
  const mediaRecorderRef  = useRef(null);
  const recordedChunksRef = useRef([]);
  const callStartTimeRef  = useRef(null);

  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  };

  const startRecording = (combinedStream) => {
    if (!combinedStream) return;
    recordedChunksRef.current = [];
    callStartTimeRef.current = Date.now();

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    try {
      const recorder = new MediaRecorder(combinedStream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(1000); // collect data every second
      console.log('[Recording] Started');
    } catch (e) {
      console.warn('[Recording] MediaRecorder failed:', e);
    }
  };

  const uploadRecording = async () => {
    const chunks = recordedChunksRef.current;
    if (!chunks || chunks.length === 0) return;

    const blob = new Blob(chunks, { type: 'video/webm' });
    const durationSeconds = Math.round((Date.now() - callStartTimeRef.current) / 1000);

    setUploading(true);
    try {
      const formData = new FormData();
      const filename = `call_${currentUser.id}_${peerId}_${Date.now()}`;
      formData.append('file', blob, filename + '.webm');
      formData.append('upload_preset', CLOUDINARY_PRESET);
      formData.append('resource_type', 'video');
      formData.append('public_id', filename);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/video/upload`,
        { method: 'POST', body: formData }
      );
      const data = await res.json();

      if (data.secure_url) {
        console.log('[Recording] Uploaded:', data.secure_url);
        socket.emit('save_recording', {
          caller_id: currentUser.id,
          receiver_id: peerId,
          call_type: callType,
          recording_url: data.secure_url,
          duration_seconds: durationSeconds
        });
      }
    } catch (err) {
      console.error('[Recording] Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    let localMediaStream = null;

    const initCall = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: callType === 'video',
          audio: true
        });
        setStream(mediaStream);
        localMediaStream = mediaStream;

        if (localVideoRef.current && callType === 'video') {
          localVideoRef.current.srcObject = mediaStream;
        }

        const pc = new RTCPeerConnection(rtcConfig);
        peerConnectionRef.current = pc;

        mediaStream.getTracks().forEach(track => pc.addTrack(track, mediaStream));

        pc.ontrack = (event) => {
          const remote = event.streams[0];
          setRemoteStream(remote);
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
          setCallStatus('Connected');

          // Build a combined stream (local + remote) for recording
          const combined = new MediaStream([
            ...mediaStream.getTracks(),
            ...remote.getTracks()
          ]);
          startRecording(combined);
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('ice_candidate', { to: peerId, candidate: event.candidate });
          }
        };

        if (isInitiator) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('call_user', {
            userToCall: peerId,
            signalData: offer,
            from: currentUser.id,
            name: currentUser.name,
            type: callType
          });
        } else if (incomingSignal) {
          await pc.setRemoteDescription(new RTCSessionDescription(incomingSignal));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('answer_call', { to: peerId, signal: answer });
        }
      } catch (err) {
        console.error('Failed to get local stream or init WebRTC', err);
        setCallStatus('Failed to access camera/mic');
      }
    };

    if (callActive && socket) initCall();

    return () => {
      if (localMediaStream) localMediaStream.getTracks().forEach(t => t.stop());
      if (peerConnectionRef.current) peerConnectionRef.current.close();
    };
  }, [callActive, isInitiator, callType]);

  useEffect(() => {
    if (!socket || !peerConnectionRef.current) return;

    const handleCallAccepted = async (signal) => {
      const pc = peerConnectionRef.current;
      if (pc && pc.signalingState !== 'closed') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
      }
    };

    const handleIceCandidate = async (candidate) => {
      const pc = peerConnectionRef.current;
      if (pc && pc.signalingState !== 'closed') {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (e) { console.error('ICE candidate error', e); }
      }
    };

    socket.on('call_accepted', handleCallAccepted);
    socket.on('ice_candidate', handleIceCandidate);
    return () => {
      socket.off('call_accepted', handleCallAccepted);
      socket.off('ice_candidate', handleIceCandidate);
    };
  }, [socket, callActive]);

  const toggleMic = () => {
    if (stream) {
      const track = stream.getAudioTracks()[0];
      if (track) { track.enabled = !track.enabled; setMicEnabled(track.enabled); }
    }
  };

  const toggleVideo = () => {
    if (stream) {
      const track = stream.getVideoTracks()[0];
      if (track) { track.enabled = !track.enabled; setVideoEnabled(track.enabled); }
    }
  };

  const endCall = async () => {
    // Stop recorder and upload
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      // Wait a tick for ondataavailable to fire
      await new Promise(r => setTimeout(r, 300));
    }

    socket.emit('end_call', { to: peerId });
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (peerConnectionRef.current) peerConnectionRef.current.close();

    await uploadRecording();
    onEndCall();
  };

  if (!callActive) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: '#0d0d0d',
      display: 'flex', flexDirection: 'column', zIndex: 2000
    }}>
      {/* Header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, padding: '20px 24px',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        color: 'white', zIndex: 10
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>{peerName}</h2>
          <div style={{ fontSize: '13px', color: '#aaa', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: callStatus === 'Connected' ? '#3ecf70' : '#f59e0b',
              display: 'inline-block', animation: callStatus !== 'Connected' ? 'pulse 1.5s infinite' : 'none'
            }} />
            {uploading ? '📤 Saving recording to cloud...' : callStatus}
          </div>
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '20px' }}>
          🔴 Recording
        </div>
      </div>

      {/* Main Video/Audio Area */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {callType === 'video' ? (
          <>
            {/* Always render remote video — srcObject set by ontrack */}
            <video ref={remoteVideoRef} autoPlay playsInline
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                display: remoteStream ? 'block' : 'none'
              }} />
            {!remoteStream && (
              <div style={{ color: '#555', fontSize: '16px', textAlign: 'center', position: 'absolute' }}>
                <div style={{ fontSize: '60px', marginBottom: '12px' }}>📹</div>
                Waiting for {peerName}...
              </div>
            )}
            {/* Local mini window */}
            <div style={{
              position: 'absolute', bottom: '110px', right: '28px',
              width: '130px', height: '175px', borderRadius: '14px',
              overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
              background: '#1a1a1a', zIndex: 10, border: '2px solid rgba(255,255,255,0.1)'
            }}>
              <video ref={localVideoRef} autoPlay playsInline muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            {/* Always-rendered audio element for remote voice */}
            <audio ref={remoteVideoRef} autoPlay playsInline style={{ display: 'none' }} />
            <div style={{
              width: '130px', height: '130px', borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent), var(--green))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', margin: '0 auto 20px',
              boxShadow: callStatus === 'Connected' ? '0 0 40px rgba(100,200,100,0.3)' : 'none',
              animation: callStatus !== 'Connected' ? 'ringPulse 2s infinite' : 'none'
            }}>
              <Phone size={55} />
            </div>
            <div style={{ color: '#aaa', fontSize: '16px' }}>
              {callStatus === 'Connected' ? 'Voice Call Active' : callStatus}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, padding: '28px 0 36px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
        display: 'flex', justifyContent: 'center', gap: '20px', zIndex: 10
      }}>
        <CtrlBtn active={micEnabled} onClick={toggleMic} title={micEnabled ? 'Mute' : 'Unmute'}>
          {micEnabled ? <Mic size={22} /> : <MicOff size={22} />}
        </CtrlBtn>

        {callType === 'video' && (
          <CtrlBtn active={videoEnabled} onClick={toggleVideo} title={videoEnabled ? 'Disable Camera' : 'Enable Camera'}>
            {videoEnabled ? <Video size={22} /> : <VideoOff size={22} />}
          </CtrlBtn>
        )}

        <button onClick={endCall} disabled={uploading} title="End Call" style={{
          width: '64px', height: '64px', borderRadius: '50%',
          background: 'var(--red)', color: 'white', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(239,68,68,0.5)',
          opacity: uploading ? 0.6 : 1
        }}>
          <PhoneOff size={24} />
        </button>
      </div>

      <style>{`
        @keyframes ringPulse {
          0%   { box-shadow: 0 0 0 0 rgba(100,200,100,0.4); }
          70%  { box-shadow: 0 0 0 25px rgba(100,200,100,0); }
          100% { box-shadow: 0 0 0 0 rgba(100,200,100,0); }
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
      boxShadow: '0 2px 12px rgba(0,0,0,0.3)'
    }}>
      {children}
    </button>
  );
}
