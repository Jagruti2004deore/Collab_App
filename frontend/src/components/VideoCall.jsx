import { useEffect, useRef, useState, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export default function VideoCall({
  roomId,
  currentUser,
  stompClient,
  targetUser,
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

  // Keep ref in sync with state so callbacks always see latest value
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
          type: 'ICE_CANDIDATE',
          from: currentUser,
          to: target,
          roomId: roomId,
          candidate: JSON.stringify(event.candidate),
        });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[WebRTC] connection state:', state);
      if (state === 'disconnected' || state === 'failed') {
        cleanupCall();
      }
    };

    return pc;
  }, [currentUser, roomId, sendSignal, cleanupCall]);

  const handleIncomingSignal = useCallback(async (signal) => {
    // Ignore signals not meant for us
    if (signal.to !== currentUser) return;

    console.log('[Signal] received:', signal.type, 'from:', signal.from);

    if (signal.type === 'CALL_OFFER') {
      // Only accept if we are idle — prevents duplicate popups
      if (callStateRef.current !== 'idle') {
        console.log('[Signal] ignoring offer, already in state:', callStateRef.current);
        return;
      }
      setIncomingSignal(signal);
      setRemoteUser(signal.from);
      setCallState('incoming');
      return;
    }

    if (signal.type === 'CALL_ANSWER') {
      if (signal.accepted === true) {
        try {
          const answer = JSON.parse(signal.sdp);
          await pcRef.current?.setRemoteDescription(
            new RTCSessionDescription(answer)
          );
          setCallState('in-call');
        } catch (e) {
          console.error('[WebRTC] setRemoteDescription failed:', e);
          cleanupCall();
        }
      } else {
        alert(signal.from + ' declined the call.');
        cleanupCall();
      }
      return;
    }

    if (signal.type === 'ICE_CANDIDATE') {
      if (signal.candidate && pcRef.current) {
        try {
          await pcRef.current.addIceCandidate(
            new RTCIceCandidate(JSON.parse(signal.candidate))
          );
        } catch (e) {
          console.warn('[WebRTC] ICE candidate error:', e);
        }
      }
      return;
    }

    if (signal.type === 'CALL_END') {
      alert(signal.from + ' ended the call.');
      cleanupCall();
    }
  }, [currentUser, cleanupCall]);

  // Replace the subscription useEffect with this:
useEffect(() => {
  const handler = (e) => {
    handleIncomingSignal(e.detail);
  };
  window.addEventListener('webrtc-signal', handler);
  return () => window.removeEventListener('webrtc-signal', handler);
}, [handleIncomingSignal]);

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
    setCallState('calling');
    try {
      const stream = await getLocalStream();
      const pc     = createPeerConnection(target);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal({
        type: 'CALL_OFFER',
        from: currentUser,
        to: target,
        roomId: roomId,
        sdp: JSON.stringify(offer),
      });
    } catch (e) {
      console.error('[WebRTC] startCall failed:', e);
      alert('Could not access camera/microphone. Please allow permissions.');
      cleanupCall();
    }
  };

  const acceptCall = async () => {
    if (!incomingSignal) return;
    const caller = incomingSignal.from;
    // Set state immediately to prevent double-accept
    setCallState('in-call');
    setIncomingSignal(null);
    try {
      const stream = await getLocalStream();
      const pc     = createPeerConnection(caller);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = JSON.parse(incomingSignal.sdp);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal({
        type: 'CALL_ANSWER',
        from: currentUser,
        to: caller,
        roomId: roomId,
        sdp: JSON.stringify(answer),
        accepted: true,
      });
    } catch (e) {
      console.error('[WebRTC] acceptCall failed:', e);
      declineCall();
    }
  };

  const declineCall = useCallback(() => {
    if (incomingSignal) {
      sendSignal({
        type: 'CALL_ANSWER',
        from: currentUser,
        to: incomingSignal.from,
        roomId: roomId,
        accepted: false,
      });
    }
    setIncomingSignal(null);
    cleanupCall();
  }, [incomingSignal, sendSignal, currentUser, roomId, cleanupCall]);

  const endCall = useCallback(() => {
    if (remoteUser) {
      sendSignal({
        type: 'CALL_END',
        from: currentUser,
        to: remoteUser,
        roomId: roomId,
      });
    }
    cleanupCall();
  }, [remoteUser, sendSignal, currentUser, roomId, cleanupCall]);

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsMuted((prev) => !prev);
  };

  const toggleCamera = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsCamOff((prev) => !prev);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* Call button — idle state */}
      {callState === 'idle' && targetUser && (
        <button
          onClick={() => startCall(targetUser)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl
                     bg-indigo-50 hover:bg-indigo-100 transition text-left
                     border border-indigo-100">
          <span className="text-base">&#x1F4F9;</span>
          <span className="text-xs text-indigo-700 font-medium truncate">
            Call {targetUser}
          </span>
        </button>
      )}

      {/* Calling — waiting for answer */}
      {callState === 'calling' && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-70
                        flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 text-center shadow-2xl
                          max-w-xs w-full mx-4">
            <div className="w-20 h-20 rounded-full bg-indigo-100 flex
                            items-center justify-center mx-auto mb-4 text-3xl">
              {remoteUser ? remoteUser.charAt(0).toUpperCase() : '?'}
            </div>
            <p className="font-semibold text-gray-800 text-lg mb-1">
              Calling {remoteUser}
            </p>
            <p className="text-sm text-gray-400 mb-6">Waiting for answer...</p>
            <button
              onClick={endCall}
              className="w-full bg-red-500 hover:bg-red-600 text-white
                         font-medium py-3 rounded-xl text-sm transition
                         flex items-center justify-center gap-2">
              <span>&#x2716;</span> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Incoming call */}
      {callState === 'incoming' && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-70
                        flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 text-center shadow-2xl
                          max-w-xs w-full mx-4">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex
                            items-center justify-center mx-auto mb-4 text-3xl">
              {remoteUser ? remoteUser.charAt(0).toUpperCase() : '?'}
            </div>
            <p className="font-semibold text-gray-800 text-lg mb-1">
              Incoming call
            </p>
            <p className="text-indigo-600 font-medium mb-1">{remoteUser}</p>
            <p className="text-sm text-gray-400 mb-6">
              is calling you...
            </p>
            <div className="flex gap-3">
              <button
                onClick={declineCall}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white
                           font-medium py-3 rounded-xl text-sm transition
                           flex items-center justify-center gap-1">
                <span>&#x2716;</span> Decline
              </button>
              <button
                onClick={acceptCall}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600
                           text-white font-medium py-3 rounded-xl
                           text-sm transition flex items-center
                           justify-center gap-1">
                <span>&#x2714;</span> Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In call — full screen */}
      {callState === 'in-call' && (
        <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3
                          bg-gray-800 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex
                              items-center justify-center text-white
                              text-sm font-bold">
                {remoteUser ? remoteUser.charAt(0).toUpperCase() : '?'}
              </div>
              <div>
                <p className="text-white text-sm font-medium">
                  In call with {remoteUser}
                </p>
                <p className="text-gray-400 text-xs">Live</p>
              </div>
            </div>
            <button
              onClick={() => setShowWhiteboard((prev) => !prev)}
              className={'text-xs px-3 py-1.5 rounded-lg font-medium transition ' +
                (showWhiteboard
                  ? 'bg-indigo-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600')}>
              {showWhiteboard ? 'Hide Board' : 'Whiteboard'}
            </button>
          </div>

          {/* Content */}
          <div className="flex flex-1 overflow-hidden">

            {/* Video area */}
            <div className={'relative flex-1 bg-gray-900 ' +
              (showWhiteboard ? 'w-1/2' : 'w-full')}>

              {/* Remote video */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />

              {/* Remote cam off placeholder */}
              <div className="absolute inset-0 flex items-center
                              justify-center pointer-events-none">
                <div id="remote-placeholder"
                     className="text-center hidden">
                  <div className="w-24 h-24 rounded-full bg-gray-700
                                  flex items-center justify-center
                                  text-4xl mx-auto mb-3 text-white
                                  font-bold">
                    {remoteUser ? remoteUser.charAt(0).toUpperCase() : '?'}
                  </div>
                  <p className="text-gray-400 text-sm">{remoteUser}</p>
                </div>
              </div>

              {/* Local video — picture in picture */}
              <div className="absolute bottom-4 right-4 w-40 h-28
                              rounded-2xl overflow-hidden border-2
                              border-gray-600 bg-gray-800 shadow-xl">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {isCamOff && (
                  <div className="absolute inset-0 bg-gray-800 flex
                                  items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-gray-600
                                    flex items-center justify-center
                                    text-white font-bold text-sm">
                      {currentUser ? currentUser.charAt(0).toUpperCase() : 'Y'}
                    </div>
                  </div>
                )}
                <div className="absolute bottom-1 left-0 right-0
                                text-center text-xs text-white
                                bg-black bg-opacity-40 py-0.5">
                  You
                </div>
              </div>
            </div>

            {/* Whiteboard panel */}
            {showWhiteboard && (
              <div className="w-1/2 bg-white flex flex-col border-l
                              border-gray-700">
                <div className="px-4 py-2 bg-gray-800 text-white text-xs
                                font-medium shrink-0">
                  Shared Whiteboard
                </div>
                <div className="flex-1 overflow-hidden">
                  <canvas
                    id="call-canvas"
                    width={800}
                    height={600}
                    className="w-full h-full"
                    style={{ background: '#ffffff', cursor: 'crosshair' }}
                    onMouseDown={(e) => {
                      const canvas = e.target;
                      const ctx = canvas.getContext('2d');
                      const rect = canvas.getBoundingClientRect();
                      ctx.beginPath();
                      ctx.moveTo(
                        e.clientX - rect.left,
                        e.clientY - rect.top
                      );
                      canvas._drawing = true;
                    }}
                    onMouseMove={(e) => {
                      const canvas = e.target;
                      if (!canvas._drawing) return;
                      const ctx = canvas.getContext('2d');
                      const rect = canvas.getBoundingClientRect();
                      ctx.lineTo(
                        e.clientX - rect.left,
                        e.clientY - rect.top
                      );
                      ctx.strokeStyle = '#3730a3';
                      ctx.lineWidth = 2;
                      ctx.lineCap = 'round';
                      ctx.stroke();
                    }}
                    onMouseUp={(e) => {
                      e.target._drawing = false;
                    }}
                    onMouseLeave={(e) => {
                      e.target._drawing = false;
                    }}
                  />
                </div>
                <div className="px-3 py-2 bg-gray-100 flex gap-2 shrink-0">
                  <button
                    onClick={() => {
                      const canvas = document.getElementById('call-canvas');
                      const ctx = canvas.getContext('2d');
                      ctx.clearRect(0, 0, canvas.width, canvas.height);
                    }}
                    className="text-xs bg-white border border-gray-200
                               text-red-500 px-3 py-1 rounded-lg
                               hover:bg-red-50 transition">
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Controls bar */}
          <div className="bg-gray-800 px-6 py-4 flex items-center
                          justify-center gap-6 shrink-0">

            {/* Mute */}
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={toggleMute}
                className={'w-14 h-14 rounded-full flex items-center ' +
                  'justify-center transition text-2xl shadow-lg ' +
                  (isMuted
                    ? 'bg-red-500 hover:bg-red-400'
                    : 'bg-gray-600 hover:bg-gray-500')}>
                {isMuted ? (
                  <svg width="24" height="24" viewBox="0 0 24 24"
                       fill="none" stroke="white" strokeWidth="2"
                       strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23"/>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24"
                       fill="none" stroke="white" strokeWidth="2"
                       strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                )}
              </button>
              <span className="text-gray-400 text-xs">
                {isMuted ? 'Unmute' : 'Mute'}
              </span>
            </div>

            {/* Camera */}
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={toggleCamera}
                className={'w-14 h-14 rounded-full flex items-center ' +
                  'justify-center transition text-2xl shadow-lg ' +
                  (isCamOff
                    ? 'bg-red-500 hover:bg-red-400'
                    : 'bg-gray-600 hover:bg-gray-500')}>
                {isCamOff ? (
                  <svg width="24" height="24" viewBox="0 0 24 24"
                       fill="none" stroke="white" strokeWidth="2"
                       strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23"/>
                    <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"/>
                    <path d="M15 13a3 3 0 1 1-6 0"/>
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24"
                       fill="none" stroke="white" strokeWidth="2"
                       strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 7 16 12 23 17V7z"/>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                  </svg>
                )}
              </button>
              <span className="text-gray-400 text-xs">
                {isCamOff ? 'Start Video' : 'Stop Video'}
              </span>
            </div>

            {/* Whiteboard toggle */}
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={() => setShowWhiteboard((prev) => !prev)}
                className={'w-14 h-14 rounded-full flex items-center ' +
                  'justify-center transition shadow-lg ' +
                  (showWhiteboard
                    ? 'bg-indigo-500 hover:bg-indigo-400'
                    : 'bg-gray-600 hover:bg-gray-500')}>
                <svg width="24" height="24" viewBox="0 0 24 24"
                     fill="none" stroke="white" strokeWidth="2"
                     strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="14" rx="2"/>
                  <line x1="8" y1="21" x2="16" y2="21"/>
                  <line x1="12" y1="17" x2="12" y2="21"/>
                  <path d="M8 10 l2 2 4-4"/>
                </svg>
              </button>
              <span className="text-gray-400 text-xs">
                Board
              </span>
            </div>

            {/* End call */}
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={endCall}
                className="w-14 h-14 rounded-full bg-red-500
                           hover:bg-red-400 flex items-center
                           justify-center transition shadow-lg">
                <svg width="24" height="24" viewBox="0 0 24 24"
                     fill="white">
                  <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4
                           1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4
                           1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0
                           1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                </svg>
              </button>
              <span className="text-gray-400 text-xs">End</span>
            </div>

          </div>
        </div>
      )}
    </>
  );
}

//for cheaking only 