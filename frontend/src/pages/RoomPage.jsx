import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client/dist/sockjs.min.js';
import api from '../api/axios';
import Chat from '../components/Chat';
import Whiteboard from '../components/Whiteboard';
import OnlineUsers from '../components/OnlineUsers';
import VideoCall from '../components/VideoCall';
import Notes from '../components/Notes';
import CodeEditor from '../components/CodeEditor';

export default function RoomPage() {
  const { roomId } = useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [access, setAccess] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [activeTab, setActiveTab] = useState('chat');
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);

  const stompClientRef = useRef(null);
  const roomSubsRef = useRef([]);
  const personalSubsRef = useRef([]);
  const accessRef = useRef(null);

  const isApproved = access?.status === 'APPROVED';
  const isOwner = access?.role === 'OWNER' || room?.createdBy === user?.username;

  useEffect(() => {
    accessRef.current = access;
  }, [access]);

  useEffect(() => {
    const fetchRoom = async () => {
      try {
        const [roomRes, accessRes] = await Promise.all([
          api.get('/api/rooms/' + roomId),
          api.get('/api/rooms/' + roomId + '/access'),
        ]);
        setRoom(roomRes.data);
        setAccess(accessRes.data);

        if (accessRes.data.status !== 'APPROVED' &&
            accessRes.data.status !== 'BLOCKED') {
          const requestRes = await api.post('/api/rooms/' + roomId + '/join-requests');
          setAccess(requestRes.data);
        }
      } catch {
        setError('Room not found or you do not have access.');
      } finally {
        setLoading(false);
      }
    };
    fetchRoom();
  }, [roomId]);

  const fetchPendingRequests = useCallback(async () => {
    try {
      const res = await api.get('/api/rooms/' + roomId + '/join-requests');
      setPendingRequests(res.data);
    } catch {
      setPendingRequests([]);
    }
  }, [roomId]);

  useEffect(() => {
    if (isOwner) fetchPendingRequests();
  }, [isOwner, fetchPendingRequests]);

  const fetchOnlineUsers = useCallback(async () => {
    try {
      const res = await api.get('/api/rooms/' + roomId + '/online');
      setOnlineUsers(Array.isArray(res.data) ? res.data : Array.from(res.data));
    } catch (e) {
      console.warn('Could not fetch online users', e);
    }
  }, [roomId]);

  const unsubscribeRoomChannels = useCallback(() => {
    roomSubsRef.current.forEach((sub) => {
      try { sub.unsubscribe(); } catch (e) { console.warn(e); }
    });
    roomSubsRef.current = [];
  }, []);

  useEffect(() => {
    if (!user?.username) return;
    const token = localStorage.getItem('token');
    const username = user.username;

    const client = new Client({
      webSocketFactory: () =>
        new SockJS((import.meta.env.VITE_WS_URL || 'http://localhost:8080') + '/ws'),
      connectHeaders: { Authorization: 'Bearer ' + token },
      reconnectDelay: 3000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,

      onConnect: () => {
        setConnected(true);

        personalSubsRef.current = [
          client.subscribe('/user/queue/room-access', (frame) => {
            const nextAccess = JSON.parse(frame.body);
            if (nextAccess.roomId === roomId) {
              setAccess(nextAccess);
            }
          }),
          client.subscribe('/user/queue/room-requests', (frame) => {
            const request = JSON.parse(frame.body);
            if (request.roomId === roomId) {
              setPendingRequests((prev) => {
                const exists = prev.some((item) => item.username === request.username);
                return exists ? prev : [...prev, request];
              });
            }
          }),
          client.subscribe('/user/queue/signal', (frame) => {
            const signal = JSON.parse(frame.body);
            window.dispatchEvent(new CustomEvent('webrtc-signal', { detail: signal }));
          }),
        ];
      },

      onDisconnect: () => setConnected(false),
      onStompError: () => setConnected(false),
    });

    client.activate();
    stompClientRef.current = client;

    return () => {
      unsubscribeRoomChannels();
      personalSubsRef.current.forEach((sub) => {
        try { sub.unsubscribe(); } catch (e) { console.warn(e); }
      });
      if (client.connected && accessRef.current?.status === 'APPROVED') {
        client.publish({
          destination: '/app/room/' + roomId + '/leave',
          body: JSON.stringify({ username }),
        });
      }
      client.deactivate();
      setOnlineUsers([]);
    };
  }, [roomId, user?.username, unsubscribeRoomChannels]);

  useEffect(() => {
    const client = stompClientRef.current;
    if (!client?.connected || !isApproved || !user?.username) return;

    unsubscribeRoomChannels();

    const presenceSub = client.subscribe('/topic/room/' + roomId + '/presence', (frame) => {
      const p = JSON.parse(frame.body);
      if (p.eventType === 'JOIN') {
        setOnlineUsers((prev) =>
          prev.includes(p.username) ? prev : [...prev, p.username]
        );
      }
      if (p.eventType === 'LEAVE') {
        setOnlineUsers((prev) => prev.filter((u) => u !== p.username));
      }
    });

    roomSubsRef.current = [presenceSub];

    fetchOnlineUsers().then(() => {
      client.publish({
        destination: '/app/room/' + roomId + '/join',
        body: JSON.stringify({ username: user.username }),
      });
    });

    return unsubscribeRoomChannels;
  }, [connected, isApproved, roomId, user?.username, fetchOnlineUsers, unsubscribeRoomChannels]);

  const decideRequest = async (username, decision) => {
    const res = await api.post(
      `/api/rooms/${roomId}/join-requests/${username}/${decision}`
    );
    setPendingRequests((prev) => prev.filter((item) => item.username !== username));
    return res.data;
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = () => { logout(); navigate('/login'); };
  const otherUsers = onlineUsers.filter((u) => u !== user?.username);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading room...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center max-w-sm">
          <p className="text-gray-800 font-semibold mb-2">Room not available</p>
          <p className="text-gray-500 text-sm mb-6">{error}</p>
          <button onClick={() => navigate('/dashboard')}
            className="bg-indigo-600 text-white text-sm px-6 py-2.5 rounded-lg hover:bg-indigo-700 transition">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!isApproved) {
    const blocked = access?.status === 'BLOCKED';
    const rejected = access?.status === 'REJECTED';
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
        <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/10 backdrop-blur p-8 shadow-2xl">
          <div className="flex items-center justify-between gap-4 mb-8">
            <div>
              <p className="text-sm text-indigo-200">Interview room</p>
              <h1 className="text-2xl font-bold mt-1">{room?.roomName}</h1>
            </div>
            <span className="rounded-full bg-amber-400/15 text-amber-200 px-3 py-1 text-xs font-semibold">
              {blocked ? 'Blocked' : rejected ? 'Rejected' : 'Waiting'}
            </span>
          </div>

          <div className="rounded-2xl bg-slate-950/50 border border-white/10 p-5">
            <p className="text-lg font-semibold">
              {blocked
                ? 'The room owner has blocked this account.'
                : rejected
                ? 'Your request was rejected.'
                : 'Your join request is waiting for approval.'}
            </p>
            <p className="text-sm text-slate-300 mt-2 leading-6">
              The room admin controls who enters this interview session. Keep this
              page open and you will enter automatically when approved.
            </p>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            {!blocked && (
              <button
                onClick={async () => {
                  const res = await api.post('/api/rooms/' + roomId + '/join-requests');
                  setAccess(res.data);
                }}
                className="flex-1 rounded-xl bg-indigo-500 hover:bg-indigo-400 px-4 py-3 text-sm font-semibold transition">
                Send request again
              </button>
            )}
            <button
              onClick={() => navigate('/dashboard')}
              className="flex-1 rounded-xl bg-white/10 hover:bg-white/15 px-4 py-3 text-sm font-semibold transition">
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      <nav className="bg-slate-950 text-white px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/dashboard')}
            className="text-slate-300 hover:text-white text-sm transition">
            Back
          </button>
          <span className="text-slate-600">|</span>
          <span className="font-bold truncate">{room?.roomName}</span>
          <span className={
            'text-xs px-2 py-0.5 rounded-full font-medium ' +
            (connected ? 'bg-emerald-400/15 text-emerald-200' : 'bg-yellow-400/15 text-yellow-200')
          }>
            {connected ? 'Live' : 'Connecting'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-300 hidden md:block">
            <strong>{user?.username}</strong>
          </span>
          <button onClick={copyRoomId}
            className="text-xs bg-white/10 hover:bg-white/15 text-white px-3 py-1.5 rounded-lg transition">
            {copied ? 'Copied!' : 'Copy Room ID'}
          </button>
          <button onClick={handleLogout}
            className="text-xs bg-white/10 hover:bg-white/15 text-white px-3 py-1.5 rounded-lg transition">
            Logout
          </button>
        </div>
      </nav>

      {isOwner && pendingRequests.length > 0 && (
        <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-3 shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-indigo-900">
              Pending join requests
            </span>
            {pendingRequests.map((request) => (
              <div key={request.username}
                className="flex items-center gap-2 bg-white rounded-full border border-indigo-100 px-3 py-1.5 shadow-sm">
                <span className="text-sm text-slate-700">{request.username}</span>
                <button onClick={() => decideRequest(request.username, 'approve')}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                  Accept
                </button>
                <button onClick={() => decideRequest(request.username, 'reject')}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700">
                  Reject
                </button>
                <button onClick={() => decideRequest(request.username, 'block')}
                  className="text-xs font-semibold text-red-600 hover:text-red-700">
                  Block
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border-b border-gray-100 px-3 sm:px-6 flex gap-1 shrink-0 overflow-x-auto">
        {['chat', 'video', 'whiteboard', 'notes', 'code'].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={
              'px-4 py-2.5 text-sm font-medium border-b-2 transition capitalize whitespace-nowrap ' +
              (activeTab === tab
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700')
            }>
            {tab}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden gap-4 p-2 sm:p-4">
        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
          <div className={'flex-1 overflow-hidden flex flex-col ' + (activeTab === 'chat' ? 'flex' : 'hidden')}>
            <Chat roomId={roomId} currentUser={user?.username}
              stompClient={stompClientRef.current} connected={connected} />
          </div>
          <div className={'flex-1 overflow-hidden flex flex-col bg-slate-950 ' + (activeTab === 'video' ? 'flex' : 'hidden')}>
            <VideoCall roomId={roomId} currentUser={user?.username}
              stompClient={stompClientRef.current} connected={connected}
              otherUsers={otherUsers} />
          </div>
          <div className={'flex-1 overflow-hidden flex flex-col ' + (activeTab === 'whiteboard' ? 'flex' : 'hidden')}>
            <Whiteboard roomId={roomId} currentUser={user?.username}
              stompClient={stompClientRef.current} connected={connected} />
          </div>
          <div className={'flex-1 overflow-hidden flex flex-col ' + (activeTab === 'notes' ? 'flex' : 'hidden')}>
            <Notes roomId={roomId} currentUser={user?.username}
              stompClient={stompClientRef.current} connected={connected} />
          </div>
          <div className={'flex-1 overflow-hidden flex flex-col ' + (activeTab === 'code' ? 'flex' : 'hidden')}>
            <CodeEditor roomId={roomId} currentUser={user?.username}
              stompClient={stompClientRef.current} connected={connected} />
          </div>
        </div>

        <div className="w-64 bg-white rounded-xl border border-gray-200 shadow-sm p-4 shrink-0 hidden md:flex flex-col overflow-y-auto gap-4">
          <OnlineUsers users={onlineUsers} currentUser={user?.username} />
          <button
            onClick={() => setActiveTab('video')}
            className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-blue-600">
            Open video meeting
          </button>
        </div>
      </div>
    </div>
  );
}
