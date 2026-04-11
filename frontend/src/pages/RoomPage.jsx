import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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

  const stompClientRef = useRef(null);
  const [stompReady, setStompReady] = useState(false);

  // ── Fetch room ─────────────────────────────────────────────────────────────
  useEffect(() => {
    api.get(`/api/rooms/${roomId}`)
      .then((res) => setRoom(res.data))
      .catch(() => setError('Room not found or you do not have access.'))
      .finally(() => setLoading(false));
  }, [roomId]);

  // ── Shared WebSocket connection ────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');

    const client = new Client({
      webSocketFactory: () =>
        new SockJS('http://localhost:8080/ws'),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,

      onConnect: () => {
        setConnected(true);
        setStompReady(true);

        client.publish({
          destination: `/app/room/${roomId}/join`,
          body: JSON.stringify({}),
        });

        client.subscribe(
          `/topic/room/${roomId}/presence`,
          (frame) => {
            const presence = JSON.parse(frame.body);
            handlePresenceUpdate(presence);
          }
        );
      },

      onDisconnect: () => {
        setConnected(false);
        setStompReady(false);
      },
      onStompError: () => {
        setConnected(false);
        setStompReady(false);
      },
    });

    client.activate();
    stompClientRef.current = client;

    return () => {
      if (client.connected) {
        client.publish({
          destination: `/app/room/${roomId}/leave`,
          body: JSON.stringify({}),
        });
      }
      client.deactivate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const handlePresenceUpdate = useCallback((presence) => {
    const { eventType, username } = presence;
    if (eventType === 'JOIN') {
      setOnlineUsers((prev) =>
        prev.includes(username) ? prev : [...prev, username]
      );
    }
    if (eventType === 'LEAVE') {
      setOnlineUsers((prev) => prev.filter((u) => u !== username));
    }
  }, []);

  const copyLink     = () => navigator.clipboard.writeText(window.location.href);
  const handleLogout = () => { logout(); navigate('/login'); };

  // ── Loading / error ────────────────────────────────────────────────────────
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
          <div className="text-4xl mb-4">🚫</div>
          <p className="text-gray-700 font-medium mb-2">Room Not Found</p>
          <p className="text-gray-400 text-sm mb-6">{error}</p>
          <button
            onClick={() => navigate('/dashboard')}
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
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gray-400 hover:text-gray-600 text-sm transition">
            ← Dashboard
          </button>
          <span className="text-gray-300">|</span>
          <span className="font-bold text-indigo-600">{room.roomName}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium
            ${connected
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-yellow-100 text-yellow-700'}`}>
            {connected ? '● Live' : '○ Connecting'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 hidden md:block">
            <strong>{user?.username}</strong>
          </span>

          {/* Video Call button — only render when STOMP is ready */}
          {stompReady && (
            <VideoCall
              roomId={roomId}
              currentUser={user?.username}
              onlineUsers={onlineUsers}
              stompClient={stompClientRef.current}
              connected={connected}
            />
          )}

          <button
            onClick={copyLink}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600
                       px-3 py-1.5 rounded-lg transition">
            Copy Invite Link
          </button>
          <button
            onClick={handleLogout}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700
                       px-3 py-1.5 rounded-lg transition">
            Logout
          </button>
        </div>
      </nav>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-100 px-6
                      flex gap-1 shrink-0">
        <button
          onClick={() => setActiveTab('chat')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition
            ${activeTab === 'chat'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          💬 Chat
        </button>
        <button
          onClick={() => setActiveTab('whiteboard')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition
            ${activeTab === 'whiteboard'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          🎨 Whiteboard
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden gap-4 p-4">

        <div className="flex-1 bg-white rounded-2xl border border-gray-100
                        shadow-sm flex flex-col overflow-hidden">

          {/* Chat tab */}
          <div className={`flex-1 overflow-hidden flex flex-col
            ${activeTab === 'chat' ? 'flex' : 'hidden'}`}>
            <Chat
              roomId={roomId}
              currentUser={user?.username}
              stompClient={stompClientRef.current}
              connected={connected}
              onPresenceUpdate={handlePresenceUpdate}
            />
          </div>

          {/* Whiteboard tab */}
          <div className={`flex-1 overflow-hidden flex flex-col
            ${activeTab === 'whiteboard' ? 'flex' : 'hidden'}`}>
            <Whiteboard
              roomId={roomId}
              currentUser={user?.username}
              stompClient={stompClientRef.current}
              connected={connected}
            />
          </div>
        </div>

        {/* Online users sidebar */}
        <div className="w-56 bg-white rounded-2xl border border-gray-100
                        shadow-sm p-4 shrink-0 hidden md:flex flex-col">
          <OnlineUsers
            users={onlineUsers}
            currentUser={user?.username}
          />
        </div>
      </div>
    </div>
  );
}