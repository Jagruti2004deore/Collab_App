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

export default function RoomPage() {
  const { roomId }       = useParams();
  const { user, logout } = useAuth();
  const navigate         = useNavigate();

  const [room, setRoom]               = useState(null);
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(true);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [activeTab, setActiveTab]     = useState('chat');
  const [connected, setConnected]     = useState(false);
  const [copied, setCopied]           = useState(false);

  const stompClientRef = useRef(null);

  // Fetch room info
  useEffect(() => {
    const fetchRoom = async () => {
      try {
        const res = await api.get('/api/rooms/' + roomId);
        setRoom(res.data);
      } catch {
        setError('Room not found or you do not have access.');
      } finally {
        setLoading(false);
      }
    };
    fetchRoom();
  }, [roomId]);

  const fetchOnlineUsers = useCallback(async () => {
    try {
      const res   = await api.get('/api/rooms/' + roomId + '/online');
      const users = Array.isArray(res.data)
        ? res.data
        : Array.from(res.data);
      setOnlineUsers(users);
    } catch (e) {
      console.warn('Could not fetch online users', e);
    }
  }, [roomId]);

  // Single WebSocket connection
  useEffect(() => {
    if (!user?.username) return;
    const token    = localStorage.getItem('token');
    const username = user.username;

    const client = new Client({
      webSocketFactory: () =>
        new SockJS(
          (import.meta.env.VITE_WS_URL || 'http://localhost:8080') + '/ws'
        ),
      connectHeaders: { Authorization: 'Bearer ' + token },
      reconnectDelay: 5000,

      onConnect: () => {
        console.log('[WS] Connected as:', username);
        setConnected(true);

        // 1. Presence subscription
        client.subscribe(
          '/topic/room/' + roomId + '/presence',
          (frame) => {
            const p = JSON.parse(frame.body);
            if (p.eventType === 'JOIN') {
              setOnlineUsers((prev) =>
                prev.includes(p.username) ? prev : [...prev, p.username]
              );
            }
            if (p.eventType === 'LEAVE') {
              setOnlineUsers((prev) =>
                prev.filter((u) => u !== p.username)
              );
            }
          }
        );

        // 2. Signal subscription — ONE place only, dispatched via window event
        client.subscribe(
          '/user/queue/signal',
          (frame) => {
            const signal = JSON.parse(frame.body);
            console.log('[Signal] received:', signal.type, 'from:', signal.from);
            window.dispatchEvent(
              new CustomEvent('webrtc-signal', { detail: signal })
            );
          }
        );

        // 3. Fetch online users then announce join
        fetchOnlineUsers().then(() => {
          setTimeout(() => {
            client.publish({
              destination: '/app/room/' + roomId + '/join',
              body: JSON.stringify({ username }),
            });
          }, 500);
        });
      },

      onDisconnect: () => {
        console.log('[WS] Disconnected');
        setConnected(false);
      },

      onStompError: (frame) => {
        console.error('[WS] STOMP error', frame);
        setConnected(false);
      },
    });

    client.activate();
    stompClientRef.current = client;

    return () => {
      if (client.connected) {
        client.publish({
          destination: '/app/room/' + roomId + '/leave',
          body: JSON.stringify({ username }),
        });
      }
      client.deactivate();
      setOnlineUsers([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user?.username]);

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const otherUsers = onlineUsers.filter((u) => u !== user?.username);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading room...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center max-w-sm">
          <p className="text-gray-700 font-medium mb-2">Room Not Found</p>
          <p className="text-gray-400 text-sm mb-6">{error}</p>
          <button onClick={() => navigate('/dashboard')}
            className="bg-indigo-600 text-white text-sm px-6 py-2.5
                       rounded-lg hover:bg-indigo-700 transition">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">

      {/* Navbar */}
      <nav className="bg-white shadow-sm px-6 py-3 flex items-center
                      justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')}
            className="text-gray-400 hover:text-gray-600 text-sm transition">
            Back
          </button>
          <span className="text-gray-300">|</span>
          <span className="font-bold text-indigo-600">{room?.roomName}</span>
          <span className={
            'text-xs px-2 py-0.5 rounded-full font-medium ' +
            (connected
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-yellow-100 text-yellow-700')
          }>
            {connected ? 'Live' : 'Connecting'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 hidden md:block">
            <strong>{user?.username}</strong>
          </span>
          <button onClick={copyRoomId}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600
                       px-3 py-1.5 rounded-lg transition">
            {copied ? 'Copied!' : 'Copy Room ID'}
          </button>
          <button onClick={handleLogout}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700
                       px-3 py-1.5 rounded-lg transition">
            Logout
          </button>
        </div>
      </nav>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-6 flex gap-1 shrink-0">
        <button onClick={() => setActiveTab('chat')}
          className={
            'px-4 py-2.5 text-sm font-medium border-b-2 transition ' +
            (activeTab === 'chat'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700')
          }>
          Chat
        </button>
        <button onClick={() => setActiveTab('whiteboard')}
          className={
            'px-4 py-2.5 text-sm font-medium border-b-2 transition ' +
            (activeTab === 'whiteboard'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700')
          }>
          Whiteboard
        </button>
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden gap-4 p-4">

        {/* Content panel */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-100
                        shadow-sm flex flex-col overflow-hidden">
          <div className={
            'flex-1 overflow-hidden flex flex-col ' +
            (activeTab === 'chat' ? 'flex' : 'hidden')
          }>
            <Chat
              roomId={roomId}
              currentUser={user?.username}
              stompClient={stompClientRef.current}
              connected={connected}
            />
          </div>
          <div className={
            'flex-1 overflow-hidden flex flex-col ' +
            (activeTab === 'whiteboard' ? 'flex' : 'hidden')
          }>
            <Whiteboard
              roomId={roomId}
              currentUser={user?.username}
              stompClient={stompClientRef.current}
              connected={connected}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-56 bg-white rounded-2xl border border-gray-100
                        shadow-sm p-4 shrink-0 hidden md:flex flex-col
                        overflow-y-auto gap-4">

          <OnlineUsers
            users={onlineUsers}
            currentUser={user?.username}
          />

          {/* ONE VideoCall component — handles all users */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 mb-2">
              Video call
            </p>
            {otherUsers.length === 0 ? (
              <p className="text-xs text-gray-300 italic">
                No other users online
              </p>
            ) : (
              <VideoCall
                roomId={roomId}
                currentUser={user?.username}
                stompClient={stompClientRef.current}
                connected={connected}
                otherUsers={otherUsers}
              />
            )}
          </div>

        </div>
      </div>
    </div>
  );
}