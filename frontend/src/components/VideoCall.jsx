import { useEffect, useRef, useState, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function VideoCall({
  roomId,
  currentUser,
  onlineUsers,
  stompClient,
  connected,
}) {
  const [callState, setCallState]           = useState('idle');
  const [remoteUser, setRemoteUser]         = useState(null);
  const [isMuted, setIsMuted]               = useState(false);
  const [isCamOff, setIsCamOff]             = useState(false);
  const [incomingSignal, setIncomingSignal] = useState(null);

  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef          = useRef(null);
  const localStreamRef = useRef(null);

  // ── Cleanup ───────────────────────────────────────────────────────────────

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
  }, []);

  // ── Unmount cleanup ───────────────────────────────────────────────────────

  useEffect(() => {
    return () => cleanupCall();
  }, [cleanupCall]);

  // ── Send signal ───────────────────────────────────────────────────────────

  const sendSignal = useCallback((signal) => {
    if (!stompClient?.connected) return;
    stompClient.publish({
      destination: `/app/signal/${roomId}`,
      body: JSON.stringify(signal),
    });
  }, [stompClient, roomId]);

  // ── Create peer connection ─────────────────────────────────────────────────

  const createPeerConnection = useCallback((targetUser) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({
          type:      'ICE_CANDIDATE',
          from:      currentUser,
          to:        targetUser,
          roomId,
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
      if (
        pc.connectionState === 'disconnected' ||
        pc.connectionState === 'failed'
      ) {
        cleanupCall();
      }
    };

    return pc;
  }, [currentUser, roomId, sendSignal, cleanupCall]);

  // ── Handle incoming signals ───────────────────────────────────────────────

  const handleIncomingSignal = useCallback(async (signal) => {
    if (signal.type === 'CALL_OFFER') {
      setIncomingSignal(signal);
      setRemoteUser(signal.from);
      setCallState('incoming');
      return;
    }

    if (signal.type === 'CALL_ANSWER') {
      if (signal.accepted) {
        try {
          const answer = JSON.parse(signal.sdp);
          await pcRef.current?.setRemoteDescription(
            new RTCSessionDescription(answer)
          );
          setCallState('in-call');
        } catch (e) {
          console.error('Failed to set remote description', e);
          cleanupCall();
        }
      } else {
        alert(`${signal.from} declined the call.`);
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
          console.warn('ICE candidate error (ignored):', e);
        }
      }
      return;
    }

    if (signal.type === 'CALL_END') {
      alert(`${signal.from} ended the call.`);
      cleanupCall();
    }
  }, [cleanupCall]);

  // ── Subscribe to signal queue ─────────────────────────────────────────────

  useEffect(() => {
    if (!stompClient || !connected) return;

    const sub = stompClient.subscribe(
      `/user/queue/signal`,
      (frame) => {
        const signal = JSON.parse(frame.body);
        handleIncomingSignal(signal);
      }
    );

    return () => {
      try { sub.unsubscribe(); } catch (e) {
        console.warn('Unsubscribe error:', e);
      }
    };
  }, [stompClient, connected, handleIncomingSignal]);

  // ── Get local media ───────────────────────────────────────────────────────

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

  // ── Start call ────────────────────────────────────────────────────────────

  const startCall = async (targetUser) => {
    if (callState !== 'idle') return;
    setRemoteUser(targetUser);
    setCallState('calling');

    try {
      const stream = await getLocalStream();
      const pc     = createPeerConnection(targetUser);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      sendSignal({
        type: 'CALL_OFFER',
        from: currentUser,
        to:   targetUser,
        roomId,
        sdp:  JSON.stringify(offer),
      });
    } catch (e) {
      console.error('Failed to start call:', e);
      alert('Could not access camera/microphone. Please allow permissions.');
      cleanupCall();
    }
  };

  // ── Accept call ───────────────────────────────────────────────────────────

  const acceptCall = async () => {
    if (!incomingSignal) return;
    const caller = incomingSignal.from;
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
        roomId,
        sdp:      JSON.stringify(answer),
        accepted: true,
      });

      setIncomingSignal(null);
    } catch (e) {
      console.error('Failed to accept call:', e);
      declineCall();
    }
  };

  // ── Decline call ──────────────────────────────────────────────────────────

  const declineCall = () => {
    if (incomingSignal) {
      sendSignal({
        type:     'CALL_ANSWER',
        from:     currentUser,
        to:       incomingSignal.from,
        roomId,
        accepted: false,
      });
    }
    setIncomingSignal(null);
    cleanupCall();
  };

  // ── End call ──────────────────────────────────────────────────────────────

  const endCall = () => {
    if (remoteUser) {
      sendSignal({
        type: 'CALL_END',
        from: currentUser,
        to:   remoteUser,
        roomId,
      });
    }
    cleanupCall();
  };

  // ── Toggle mute ───────────────────────────────────────────────────────────

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsMuted((prev) => !prev);
  };

  // ── Toggle camera ─────────────────────────────────────────────────────────

  const toggleCamera = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsCamOff((prev) => !prev);
  };

  const callableUsers = onlineUsers.filter((u) => u !== currentUser);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Idle — call buttons */}
      {callState === 'idle' && callableUsers.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 mb-2">
            Video call
          </p>
          <div className="space-y-1">
            {callableUsers.map((u) => (
              <button
                key={u}
                onClick={() => startCall(u)}
                className="w-full flex items-center gap-2 px-2 py-1.5
                           rounded-lg hover:bg-indigo-50 transition text-left">
                <span className="text-sm">📹</span>
                <span className="text-xs text-indigo-600 font-medium truncate">
                  Call {u}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Calling — waiting */}
      {callState === 'calling' && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-60
                        flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 text-center shadow-xl
                          max-w-xs w-full mx-4">
            <div className="text-5xl mb-4 animate-pulse">📹</div>
            <p className="font-semibold text-gray-800 mb-1">
              Calling {remoteUser}...
            </p>
            <p className="text-sm text-gray-400 mb-6">
              Waiting for answer
            </p>
            <button
              onClick={endCall}
              className="w-full bg-red-500 hover:bg-red-600 text-white
                         font-medium py-2.5 rounded-xl text-sm transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Incoming — accept or decline */}
      {callState === 'incoming' && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-60
                        flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 text-center shadow-xl
                          max-w-xs w-full mx-4">
            <div className="text-5xl mb-4">📞</div>
            <p className="font-semibold text-gray-800 mb-1">
              {remoteUser} is calling you
            </p>
            <p className="text-sm text-gray-400 mb-6">
              Video call request
            </p>
            <div className="flex gap-3">
              <button
                onClick={declineCall}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700
                           font-medium py-2.5 rounded-xl text-sm transition">
                Decline
              </button>
              <button
                onClick={acceptCall}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600
                           text-white font-medium py-2.5 rounded-xl
                           text-sm transition">
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-call — full screen video */}
      {callState === 'in-call' && (
        <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3
                          bg-gray-800 shrink-0">
            <span className="text-white font-medium text-sm">
              In call with {remoteUser}
            </span>
            <span className="text-xs text-gray-400">{roomId}</span>
          </div>

          {/* Videos */}
          <div className="flex-1 relative overflow-hidden bg-gray-900">

            {/* Remote — full screen */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />

            {/* Local — picture in picture */}
            <div className="absolute bottom-4 right-4 w-36 h-24 md:w-48
                            md:h-32 rounded-xl overflow-hidden border-2
                            border-gray-600 bg-gray-800 shadow-lg">
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
                  <span className="text-2xl">🚫</span>
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="bg-gray-800 px-6 py-4 flex items-center
                          justify-center gap-4 shrink-0">
            <button
              onClick={toggleMute}
              className={`w-12 h-12 rounded-full flex items-center
                          justify-center text-xl transition
                ${isMuted
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-gray-600 hover:bg-gray-500'}`}>
              {isMuted ? '🔇' : '🎤'}
            </button>
            <button
              onClick={toggleCamera}
              className={`w-12 h-12 rounded-full flex items-center
                          justify-center text-xl transition
                ${isCamOff
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-gray-600 hover:bg-gray-500'}`}>
              {isCamOff ? '📵' : '📹'}
            </button>
            <button
              onClick={endCall}
              className="w-16 h-12 rounded-full bg-red-500
                         hover:bg-red-600 flex items-center
                         justify-center text-xl transition">
              📵
            </button>
          </div>
        </div>
      )}
    </>
  );
}