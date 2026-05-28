import { useCallback, useEffect, useRef, useState } from 'react';

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

function VideoTile({ username, stream, muted, local, camOff, isScreenShare, onSelect }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative aspect-video w-full overflow-hidden rounded-2xl bg-slate-900 text-left outline-none ring-1 ring-white/10 transition hover:ring-blue-400 focus:ring-2 focus:ring-blue-400">
      {stream && !camOff ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={'h-full w-full ' + (isScreenShare ? 'object-contain bg-black' : 'object-cover')}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-700 text-2xl font-black text-slate-300">
            {username?.charAt(0)?.toUpperCase() || '?'}
          </div>
        </div>
      )}
      <div className="absolute bottom-2 left-2 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white">
        {isScreenShare ? `${local ? 'Your' : username + "'s"} screen` : local ? 'You' : username}
      </div>
      <div className="absolute right-2 top-2 hidden rounded-full bg-white/90 px-2 py-1 text-[10px] font-black text-slate-900 group-hover:block">
        Enlarge
      </div>
    </button>
  );
}

export default function VideoCall({
  roomId,
  currentUser,
  stompClient,
  connected,
  otherUsers,
}) {
  const [inCall, setInCall] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [incomingFrom, setIncomingFrom] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [status, setStatus] = useState('');
  const [screenSharingUsers, setScreenSharingUsers] = useState({});
  const [spotlightUser, setSpotlightUser] = useState(null);

  const inCallRef = useRef(false);
  const localStreamRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const screenTrackRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const pendingCandidatesRef = useRef(new Map());
  const makingOfferRef = useRef(new Set());

  useEffect(() => {
    inCallRef.current = inCall;
  }, [inCall]);

  const sendSignal = useCallback((signal) => {
    if (!stompClient?.connected) return;
    stompClient.publish({
      destination: '/app/signal/' + roomId,
      body: JSON.stringify(signal),
    });
  }, [stompClient, roomId]);

  const setRemoteStreamForUser = (username, stream) => {
    setRemoteStreams((prev) => ({ ...prev, [username]: stream }));
  };

  const removeRemoteUser = (username) => {
    setRemoteStreams((prev) => {
      const next = { ...prev };
      delete next[username];
      return next;
    });
    const pc = peerConnectionsRef.current.get(username);
    if (pc) pc.close();
    peerConnectionsRef.current.delete(username);
    pendingCandidatesRef.current.delete(username);
  };

  const flushPendingCandidates = useCallback(async (username) => {
    const pc = peerConnectionsRef.current.get(username);
    if (!pc?.remoteDescription) return;
    const queued = pendingCandidatesRef.current.get(username) || [];
    pendingCandidatesRef.current.set(username, []);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (e) {
        console.warn('Queued ICE error ignored:', e.message);
      }
    }
  }, []);

  const createPeerConnection = useCallback((username) => {
    const existing = peerConnectionsRef.current.get(username);
    if (existing && existing.signalingState !== 'closed') return existing;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current.set(username, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({
          type: 'ICE_CANDIDATE',
          from: currentUser,
          to: username,
          roomId,
          candidate: JSON.stringify(event.candidate),
        });
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) setRemoteStreamForUser(username, stream);
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected'].includes(pc.connectionState)) {
        try {
          pc.restartIce();
        } catch (e) {
          console.warn('ICE restart failed:', e.message);
        }
      }
      if (['closed', 'failed'].includes(pc.connectionState)) {
        removeRemoteUser(username);
      }
    };

    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    }

    return pc;
  }, [currentUser, roomId, sendSignal]);

  const ensureLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localStreamRef.current = stream;
    cameraTrackRef.current = stream.getVideoTracks()[0] || null;
    setLocalStream(stream);
    return stream;
  }, []);

  const createOfferForUser = useCallback(async (username) => {
    if (!username || username === currentUser || makingOfferRef.current.has(username)) return;
    makingOfferRef.current.add(username);
    try {
      await ensureLocalStream();
      const pc = createPeerConnection(username);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);
      sendSignal({
        type: 'CALL_OFFER',
        from: currentUser,
        to: username,
        roomId,
        sdp: JSON.stringify(offer),
      });
    } catch (e) {
      console.error('Could not create offer:', e);
      setStatus('Could not start video. Check camera/mic permission.');
    } finally {
      makingOfferRef.current.delete(username);
    }
  }, [createPeerConnection, currentUser, ensureLocalStream, roomId, sendSignal]);

  const joinVideo = useCallback(async () => {
    try {
      await ensureLocalStream();
      setInCall(true);
      inCallRef.current = true;
      setIncomingFrom(null);
      setStatus('Video joined');
      otherUsers.forEach((username) => createOfferForUser(username));
    } catch (e) {
      console.error('getUserMedia failed:', e);
      setStatus('Camera or microphone permission was denied.');
    }
  }, [createOfferForUser, ensureLocalStream, otherUsers]);

  const leaveVideo = useCallback(() => {
    otherUsers.forEach((username) => {
      sendSignal({
        type: 'CALL_END',
        from: currentUser,
        to: username,
        roomId,
      });
    });

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    localStreamRef.current = null;
    cameraTrackRef.current = null;
    screenTrackRef.current = null;
    setLocalStream(null);
    setRemoteStreams({});
    setInCall(false);
    inCallRef.current = false;
    setIncomingFrom(null);
    setIsMuted(false);
    setIsCamOff(false);
    setIsSharingScreen(false);
    setStatus('');
  }, [currentUser, otherUsers, roomId, sendSignal]);

  useEffect(() => {
    const peerConnections = peerConnectionsRef.current;
    return () => {
      peerConnections.forEach((pc) => pc.close());
      peerConnections.clear();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!inCall || !connected) return;
    otherUsers.forEach((username) => {
      if (!peerConnectionsRef.current.has(username)) {
        createOfferForUser(username);
      }
    });
  }, [connected, createOfferForUser, inCall, otherUsers]);

  const answerOffer = useCallback(async (signal) => {
    try {
      await ensureLocalStream();
      setInCall(true);
      inCallRef.current = true;
      const pc = createPeerConnection(signal.from);
      await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(signal.sdp)));
      await flushPendingCandidates(signal.from);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal({
        type: 'CALL_ANSWER',
        from: currentUser,
        to: signal.from,
        roomId,
        sdp: JSON.stringify(answer),
        accepted: true,
      });
      setIncomingFrom(null);
      setStatus('Video connected');
    } catch (e) {
      console.error('Could not answer offer:', e);
      sendSignal({
        type: 'CALL_ANSWER',
        from: currentUser,
        to: signal.from,
        roomId,
        accepted: false,
      });
      setStatus('Could not answer call. Check camera/mic permission.');
    }
  }, [createPeerConnection, currentUser, ensureLocalStream, flushPendingCandidates, roomId, sendSignal]);

  const handleSignal = useCallback(async (signal) => {
    if (!signal || signal.from === currentUser) return;

    if (signal.type === 'CALL_OFFER') {
      if (inCallRef.current) {
        await answerOffer(signal);
      } else {
        setIncomingFrom(signal.from);
        window.__pendingVideoOffer = signal;
      }
      return;
    }

    if (signal.type === 'CALL_ANSWER') {
      const pc = peerConnectionsRef.current.get(signal.from);
      if (!pc) return;
      if (signal.accepted === true && signal.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(signal.sdp)));
        await flushPendingCandidates(signal.from);
        setStatus('Video connected');
      } else {
        removeRemoteUser(signal.from);
        setStatus(signal.from + ' could not join video.');
      }
      return;
    }

    if (signal.type === 'ICE_CANDIDATE' && signal.candidate) {
      const candidate = new RTCIceCandidate(JSON.parse(signal.candidate));
      const pc = peerConnectionsRef.current.get(signal.from);
      if (pc?.remoteDescription) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (e) {
          console.warn('ICE candidate ignored:', e.message);
        }
      } else {
        const queued = pendingCandidatesRef.current.get(signal.from) || [];
        queued.push(candidate);
        pendingCandidatesRef.current.set(signal.from, queued);
      }
      return;
    }

    if (signal.type === 'CALL_END') {
      removeRemoteUser(signal.from);
      setScreenSharingUsers((prev) => {
        const next = { ...prev };
        delete next[signal.from];
        return next;
      });
      return;
    }

    if (signal.type === 'SCREEN_SHARE_START') {
      setScreenSharingUsers((prev) => ({ ...prev, [signal.from]: true }));
      return;
    }

    if (signal.type === 'SCREEN_SHARE_STOP') {
      setScreenSharingUsers((prev) => {
        const next = { ...prev };
        delete next[signal.from];
        return next;
      });
    }
  }, [answerOffer, currentUser, flushPendingCandidates]);

  useEffect(() => {
    const handler = (event) => handleSignal(event.detail);
    window.addEventListener('webrtc-signal', handler);
    return () => window.removeEventListener('webrtc-signal', handler);
  }, [handleSignal]);

  const acceptIncoming = async () => {
    if (window.__pendingVideoOffer) {
      await answerOffer(window.__pendingVideoOffer);
      window.__pendingVideoOffer = null;
    } else {
      await joinVideo();
    }
  };

  const declineIncoming = () => {
    const signal = window.__pendingVideoOffer;
    if (signal) {
      sendSignal({
        type: 'CALL_ANSWER',
        from: currentUser,
        to: signal.from,
        roomId,
        accepted: false,
      });
    }
    window.__pendingVideoOffer = null;
    setIncomingFrom(null);
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setIsMuted((prev) => !prev);
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((track) => {
      if (track === screenTrackRef.current) return;
      track.enabled = !track.enabled;
    });
    setIsCamOff((prev) => !prev);
  };

  const replaceVideoTrack = async (track) => {
    const replacements = [];
    peerConnectionsRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((item) => item.track?.kind === 'video');
      if (sender) replacements.push(sender.replaceTrack(track));
    });
    await Promise.all(replacements);
  };

  const notifyScreenShare = (type) => {
    otherUsers.forEach((username) => {
      sendSignal({
        type,
        from: currentUser,
        to: username,
        roomId,
      });
    });
  };

  const toggleScreenShare = async () => {
    if (!inCallRef.current) return;

    if (isSharingScreen) {
      const cameraTrack = cameraTrackRef.current;
      if (cameraTrack) {
        await replaceVideoTrack(cameraTrack);
        if (screenTrackRef.current) screenTrackRef.current.stop();
        screenTrackRef.current = null;
        setLocalStream(localStreamRef.current);
        notifyScreenShare('SCREEN_SHARE_STOP');
      }
      setIsSharingScreen(false);
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
        },
        audio: false,
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      screenTrackRef.current = screenTrack;
      await replaceVideoTrack(screenTrack);
      setLocalStream(displayStream);
      setIsSharingScreen(true);
      notifyScreenShare('SCREEN_SHARE_START');

      screenTrack.onended = async () => {
        const cameraTrack = cameraTrackRef.current;
        if (cameraTrack) await replaceVideoTrack(cameraTrack);
        setLocalStream(localStreamRef.current);
        screenTrackRef.current = null;
        setIsSharingScreen(false);
        notifyScreenShare('SCREEN_SHARE_STOP');
      };
    } catch (e) {
      console.warn('Screen share cancelled or failed:', e.message);
      setStatus('Screen share was cancelled or blocked by the browser.');
    }
  };

  const remoteEntries = Object.entries(remoteStreams);
  const participantCount = (inCall ? 1 : 0) + remoteEntries.length;
  const allTiles = [
    ...(inCall ? [{
      username: currentUser,
      stream: localStream,
      muted: true,
      local: true,
      camOff: isCamOff && !isSharingScreen,
      isScreenShare: isSharingScreen,
    }] : []),
    ...remoteEntries.map(([username, stream]) => ({
      username,
      stream,
      muted: false,
      local: false,
      camOff: false,
      isScreenShare: Boolean(screenSharingUsers[username]),
    })),
  ];
  const spotlightTile = allTiles.find((tile) => tile.username === spotlightUser);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-white">
      {spotlightTile && (
        <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-black">
                {spotlightTile.isScreenShare
                  ? `${spotlightTile.local ? 'Your' : spotlightTile.username + "'s"} screen`
                  : spotlightTile.local ? 'You' : spotlightTile.username}
              </p>
              <p className="text-xs text-slate-400">Spotlight view</p>
            </div>
            <button
              onClick={() => setSpotlightUser(null)}
              className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-black text-white hover:bg-white/20">
              Minimize
            </button>
          </div>
          <div className="min-h-0 flex-1 p-2 sm:p-4">
            <VideoTile
              {...spotlightTile}
              onSelect={() => {}}
            />
          </div>
        </div>
      )}

      <div className="shrink-0 border-b border-white/10 bg-slate-900 px-3 py-3 sm:px-4">
      {incomingFrom && (
        <div className="mb-3 rounded-2xl border border-emerald-300/40 bg-emerald-400/10 p-3">
          <p className="text-xs font-black text-emerald-800">{incomingFrom} started video</p>
          <div className="mt-2 flex gap-2">
            <button onClick={acceptIncoming}
              className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">
              Join
            </button>
            <button onClick={declineIncoming}
              className="flex-1 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-600">
              Ignore
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!inCall ? (
          <button
            onClick={joinVideo}
            disabled={!connected}
            className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-50">
            Join video room
          </button>
        ) : (
          <>
            <button onClick={toggleMute}
              className={'rounded-xl px-3 py-2 text-xs font-black text-white ' + (isMuted ? 'bg-red-600' : 'bg-slate-700')}>
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button onClick={toggleCamera}
              className={'rounded-xl px-3 py-2 text-xs font-black text-white ' + (isCamOff ? 'bg-red-600' : 'bg-slate-700')}>
              {isCamOff ? 'Camera on' : 'Camera off'}
            </button>
            <button onClick={toggleScreenShare}
              className={'rounded-xl px-3 py-2 text-xs font-black text-white ' + (isSharingScreen ? 'bg-indigo-600' : 'bg-slate-700')}>
              {isSharingScreen ? 'Stop share' : 'Share screen'}
            </button>
            <button onClick={leaveVideo}
              className="rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white">
              Leave
            </button>
          </>
        )}
      </div>

      {status && <p className="mt-2 text-xs font-semibold text-slate-400">{status}</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {allTiles.length === 0 ? (
          <div className="flex h-full min-h-[20rem] items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <div>
              <p className="text-lg font-black">Video meeting is ready</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                Join the video room to start camera, audio, and screen sharing. On mobile, use this Video tab.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {allTiles.map((tile) => (
          <VideoTile
            key={tile.username}
            {...tile}
            onSelect={() => setSpotlightUser(tile.username)}
          />
            ))}
          </div>
        )}
      </div>

      <p className="shrink-0 border-t border-white/10 px-4 py-2 text-xs leading-5 text-slate-400">
        Participants on video: {participantCount}. Click any video or shared screen to enlarge it. For 100-user production video, connect this UI to an SFU service like LiveKit, mediasoup, or Twilio.
      </p>
    </div>
  );
}
