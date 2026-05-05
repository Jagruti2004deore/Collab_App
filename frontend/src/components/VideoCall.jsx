import { useEffect, useRef, useState, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.live:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.live:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.live:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

export default function VideoCall({
  roomId,
  currentUser,
  stompClient,
  connected,
  otherUsers,
}) {
  const [callState, setCallState]           = useState('idle');
  const [remoteUser, setRemoteUser]         = useState(null);
  const [isMuted, setIsMuted]               = useState(false);
  const [isCamOff, setIsCamOff]             = useState(false);
  const [incomingSignal, setIncomingSignal] = useState(null);
  const [showWhiteboard, setShowWhiteboard] = useState(false);

  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef          = useRef(null);
  const localStreamRef = useRef(null);
  const callStateRef   = useRef('idle');

  // Keep callStateRef in sync so the window event handler always
  // sees the latest state without stale closure issues
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  const cleanupCall = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    callStateRef.current = 'idle';
    setCallState('idle');
    setRemoteUser(null);
    setIncomingSignal(null);
    setIsMuted(false);
    setIsCamOff(false);
    setShowWhiteboard(false);
  }, []);

  useEffect(() => {
    return () => cleanupCall();
  }, [cleanupCall]);

  const sendSignal = useCallback((signal) => {
    if (!stompClient?.connected) return;
    stompClient.publish({
      destination: '/app/signal/' + roomId,
      body: JSON.stringify(signal),
    });
  }, [stompClient, roomId]);

  const createPeerConnection = useCallback((target) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({
          type:      'ICE_CANDIDATE',
          from:      currentUser,
          to:        target,
          roomId:    roomId,
          candidate: JSON.stringify(event.candidate),
        });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] state:', pc.connectionState);
      if (
        pc.connectionState === 'disconnected' ||
        pc.connectionState === 'failed'
      ) {
        cleanupCall();
      }
    };

    return pc;
  }, [currentUser, roomId, sendSignal, cleanupCall]);

  // ── Signal handler ────────────────────────────────────────────────────────
  const handleSignal = useCallback(async (signal) => {
    const state = callStateRef.current;
    console.log('[Signal] handling:', signal.type,
      'from:', signal.from, 'state:', state);

    if (signal.type === 'CALL_OFFER') {
      if (state !== 'idle') {
        console.log('[Signal] ignoring offer, already in state:', state);
        return;
      }
      setIncomingSignal(signal);
      setRemoteUser(signal.from);
      callStateRef.current = 'incoming';
      setCallState('incoming');
      return;
    }

    if (signal.type === 'CALL_ANSWER') {
      // Only handle if WE are the caller waiting for an answer
      if (state !== 'calling') {
        console.log('[Signal] ignoring answer, not in calling state:', state);
        return;
      }
      if (signal.accepted) {
        try {
          const answer = JSON.parse(signal.sdp);
          await pcRef.current?.setRemoteDescription(
            new RTCSessionDescription(answer)
          );
          callStateRef.current = 'in-call';
          setCallState('in-call');
        } catch (e) {
          console.error('Failed to set remote description', e);
          cleanupCall();
        }
      } else {
        alert(signal.from + ' declined the call.');
        cleanupCall();
      }
      return;
    }

    if (signal.type === 'ICE_CANDIDATE') {
      if (pcRef.current && signal.candidate) {
        try {
          await pcRef.current.addIceCandidate(
            new RTCIceCandidate(JSON.parse(signal.candidate))
          );
        } catch (e) {
          console.warn('ICE error (ignored):', e.message);
        }
      }
      return;
    }

    if (signal.type === 'CALL_END') {
      if (state !== 'idle') {
        alert(signal.from + ' ended the call.');
        cleanupCall();
      }
    }
  }, [cleanupCall]);

  // Listen to window event — dispatched by RoomPage (single subscription)
  useEffect(() => {
    const handler = (e) => handleSignal(e.detail);
    window.addEventListener('webrtc-signal', handler);
    return () => window.removeEventListener('webrtc-signal', handler);
  }, [handleSignal]);

  const getLocalStream = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    return stream;
  };

  const startCall = async (target) => {
    if (callStateRef.current !== 'idle') return;
    setRemoteUser(target);
    callStateRef.current = 'calling';
    setCallState('calling');
    try {
      const stream = await getLocalStream();
      const pc     = createPeerConnection(target);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);
      sendSignal({
        type:   'CALL_OFFER',
        from:   currentUser,
        to:     target,
        roomId: roomId,
        sdp:    JSON.stringify(offer),
      });
    } catch (e) {
      console.error('startCall failed:', e);
      alert('Could not access camera/microphone. Please allow permissions.');
      cleanupCall();
    }
  };

  const acceptCall = async () => {
    if (!incomingSignal) return;
    const caller = incomingSignal.from;
    callStateRef.current = 'in-call';
    setCallState('in-call');
    try {
      const stream = await getLocalStream();
      const pc     = createPeerConnection(caller);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = JSON.parse(incomingSignal.sdp);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal({
        type:     'CALL_ANSWER',
        from:     currentUser,
        to:       caller,
        roomId:   roomId,
        sdp:      JSON.stringify(answer),
        accepted: true,
      });
      setIncomingSignal(null);
    } catch (e) {
      console.error('acceptCall failed:', e);
      declineCall();
    }
  };

  const declineCall = useCallback(() => {
    if (incomingSignal) {
      sendSignal({
        type:     'CALL_ANSWER',
        from:     currentUser,
        to:       incomingSignal.from,
        roomId:   roomId,
        accepted: false,
      });
    }
    setIncomingSignal(null);
    cleanupCall();
  }, [incomingSignal, sendSignal, currentUser, roomId, cleanupCall]);

  const endCall = useCallback(() => {
    if (remoteUser) {
      sendSignal({
        type:   'CALL_END',
        from:   currentUser,
        to:     remoteUser,
        roomId: roomId,
      });
    }
    cleanupCall();
  }, [remoteUser, sendSignal, currentUser, roomId, cleanupCall]);

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsMuted((prev) => !prev);
  };

  const toggleCamera = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsCamOff((prev) => !prev);
  };

  // ── Inline whiteboard for during-call use ────────────────────────────────
  const WbCanvas = () => {
    const cvRef   = useRef(null);
    const drawing = useRef(false);
    const last    = useRef({ x: 0, y: 0 });
    const [wbColor, setWbColor] = useState('#ffffff');
    const [wbEraser, setWbEraser] = useState(false);

    useEffect(() => {
      const cv  = cvRef.current;
      if (!cv) return;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(0, 0, cv.width, cv.height);
    }, []);

    const getP = (e) => {
      const r  = cvRef.current.getBoundingClientRect();
      const sx = cvRef.current.width  / r.width;
      const sy = cvRef.current.height / r.height;
      return {
        x: (e.clientX - r.left) * sx,
        y: (e.clientY - r.top)  * sy,
      };
    };

    const onDown = (e) => { drawing.current = true; last.current = getP(e); };
    const onMove = (e) => {
      if (!drawing.current) return;
      const cv  = cvRef.current;
      const ctx = cv.getContext('2d');
      const p   = getP(e);
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = wbEraser ? '#1f2937' : wbColor;
      ctx.lineWidth   = wbEraser ? 20 : 3;
      ctx.lineCap     = 'round';
      ctx.stroke();
      last.current = p;
    };
    const onUp = () => { drawing.current = false; };

    const COLORS = ['#ffffff','#ef4444','#f97316',
                    '#eab308','#22c55e','#3b82f6','#a855f7'];

    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        flexDirection: 'column', background: '#111827',
      }}>
        <div style={{
          display: 'flex', gap: 6, padding: '6px 10px',
          alignItems: 'center', background: '#1f2937', flexShrink: 0,
          flexWrap: 'wrap',
        }}>
          {COLORS.map((c) => (
            <button key={c}
              onClick={() => { setWbColor(c); setWbEraser(false); }}
              style={{
                width: 16, height: 16, borderRadius: '50%',
                background: c, border: wbColor === c && !wbEraser
                  ? '2px solid #818cf8' : '2px solid transparent',
                cursor: 'pointer', flexShrink: 0,
              }} />
          ))}
          <button
            onClick={() => setWbEraser((v) => !v)}
            style={{
              fontSize: 10, color: wbEraser ? '#818cf8' : '#9ca3af',
              background: 'none', border: 'none', cursor: 'pointer',
              fontWeight: 500,
            }}>
            Eraser
          </button>
          <button
            onClick={() => {
              const cv  = cvRef.current;
              const ctx = cv.getContext('2d');
              ctx.fillStyle = '#1f2937';
              ctx.fillRect(0, 0, cv.width, cv.height);
            }}
            style={{
              fontSize: 10, color: '#f87171', background: 'none',
              border: 'none', cursor: 'pointer', fontWeight: 500,
            }}>
            Clear
          </button>
        </div>
        <canvas
          ref={cvRef}
          width={800}
          height={600}
          style={{
            flex: 1, width: '100%',
            cursor: wbEraser ? 'cell' : 'crosshair',
          }}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
        />
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Call buttons — one per other user */}
      {callState === 'idle' && otherUsers && otherUsers.map((u) => (
        <button
          key={u}
          onClick={() => startCall(u)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            gap: 8, padding: '6px 8px', borderRadius: 8,
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#4f46e5', fontSize: 13, fontWeight: 500,
            marginBottom: 4,
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#eef2ff'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2">
            <path d="M23 7l-7 5 7 5V7z" />
            <rect x="1" y="5" width="15" height="14" rx="2" />
          </svg>
          Call {u}
        </button>
      ))}

      {/* Calling dialog */}
      {callState === 'calling' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 20, padding: '40px 32px',
            textAlign: 'center', maxWidth: 320, width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: '#eef2ff', margin: '0 auto 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 32,
            }}>
              {remoteUser ? remoteUser.charAt(0).toUpperCase() : '?'}
            </div>
            <p style={{ fontWeight: 700, fontSize: 18, margin: '0 0 6px',
                        color: '#111827' }}>
              Calling {remoteUser}...
            </p>
            <p style={{ color: '#9ca3af', fontSize: 14, margin: '0 0 28px' }}>
              Waiting for answer...
            </p>
            <button onClick={endCall} style={{
              width: '100%', background: '#ef4444', color: '#fff',
              border: 'none', borderRadius: 12, padding: '12px 0',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 8,
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Incoming call dialog */}
      {callState === 'incoming' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 20, padding: '40px 32px',
            textAlign: 'center', maxWidth: 320, width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: '#ecfdf5', margin: '0 auto 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 32,
            }}>
              {remoteUser ? remoteUser.charAt(0).toUpperCase() : '?'}
            </div>
            <p style={{ fontWeight: 700, fontSize: 18, margin: '0 0 6px',
                        color: '#111827' }}>
              {remoteUser} is calling
            </p>
            <p style={{ color: '#9ca3af', fontSize: 14, margin: '0 0 28px' }}>
              Incoming video call
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={declineCall} style={{
                flex: 1, background: '#f3f4f6', color: '#374151',
                border: 'none', borderRadius: 12, padding: '12px 0',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>
                Decline
              </button>
              <button onClick={acceptCall} style={{
                flex: 1, background: '#10b981', color: '#fff',
                border: 'none', borderRadius: 12, padding: '12px 0',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-call screen */}
      {callState === 'in-call' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: '#111827', display: 'flex', flexDirection: 'column',
        }}>

          {/* Header bar */}
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 20px', background: '#1f2937', flexShrink: 0,
          }}>
            <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>
              In call with {remoteUser}
            </span>
            <button
              onClick={() => setShowWhiteboard((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: showWhiteboard ? '#4f46e5' : '#374151',
                color: '#fff', border: 'none', borderRadius: 8,
                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
              }}>
              {showWhiteboard ? 'Hide Board' : 'Whiteboard'}
            </button>
          </div>

          {/* Video + optional whiteboard */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

            {/* Video area */}
            <div style={{
              flex: showWhiteboard ? '0 0 55%' : '1',
              position: 'relative', background: '#000',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <video ref={remoteVideoRef} autoPlay playsInline
                style={{ width: '100%', height: '100%',
                         objectFit: 'cover' }} />

              {/* No remote video placeholder */}
              <div style={{
                position: 'absolute',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                color: '#4b5563', pointerEvents: 'none',
              }}>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: '#1f2937',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 36,
                  marginBottom: 8, color: '#6b7280',
                }}>
                  {remoteUser ? remoteUser.charAt(0).toUpperCase() : '?'}
                </div>
                <p style={{ fontSize: 13, margin: 0 }}>{remoteUser}</p>
              </div>

              {/* Local video PiP */}
              <div style={{
                position: 'absolute', bottom: 16, right: 16,
                width: 140, height: 90, borderRadius: 10,
                overflow: 'hidden', border: '2px solid #374151',
                background: '#1f2937',
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              }}>
                <video ref={localVideoRef} autoPlay playsInline muted
                  style={{ width: '100%', height: '100%',
                           objectFit: 'cover' }} />
                {isCamOff && (
                  <div style={{
                    position: 'absolute', inset: 0, background: '#1f2937',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: '#6b7280', fontSize: 11,
                  }}>
                    Cam off
                  </div>
                )}
              </div>
            </div>

            {/* Whiteboard panel */}
            {showWhiteboard && (
              <div style={{
                flex: '0 0 45%', borderLeft: '1px solid #374151',
              }}>
                <WbCanvas />
              </div>
            )}
          </div>

          {/* Controls */}
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 16,
            padding: '16px 0', background: '#1f2937', flexShrink: 0,
          }}>

            {/* Mic */}
            <button onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}
              style={{
                width: 52, height: 52, borderRadius: '50%',
                background: isMuted ? '#ef4444' : '#374151',
                border: 'none', cursor: 'pointer', color: '#fff',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center',
              }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.5"
                   strokeLinecap="round" strokeLinejoin="round">
                {isMuted ? (
                  <>
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
                    <path d="M15 9.34V4a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </>
                ) : (
                  <>
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </>
                )}
              </svg>
            </button>

            {/* Camera */}
            <button onClick={toggleCamera}
              title={isCamOff ? 'Turn on camera' : 'Turn off camera'}
              style={{
                width: 52, height: 52, borderRadius: '50%',
                background: isCamOff ? '#ef4444' : '#374151',
                border: 'none', cursor: 'pointer', color: '#fff',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center',
              }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.5"
                   strokeLinecap="round" strokeLinejoin="round">
                {isCamOff ? (
                  <>
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3" />
                    <path d="M7 3h10l2 3h3a2 2 0 0 1 2 2v9.34" />
                  </>
                ) : (
                  <>
                    <path d="M23 7l-7 5 7 5V7z" />
                    <rect x="1" y="5" width="15" height="14" rx="2" />
                  </>
                )}
              </svg>
            </button>

            {/* End call */}
            <button onClick={endCall} title="End call"
              style={{
                width: 64, height: 52, borderRadius: 30,
                background: '#ef4444', border: 'none',
                cursor: 'pointer', color: '#fff',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) =>
                e.currentTarget.style.background = '#dc2626'}
              onMouseLeave={(e) =>
                e.currentTarget.style.background = '#ef4444'}>
              <svg width="22" height="22" viewBox="0 0 24 24"
                   fill="currentColor">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
              </svg>
            </button>

          </div>
        </div>
      )}
    </>
  );
}