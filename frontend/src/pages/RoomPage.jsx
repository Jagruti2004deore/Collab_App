import { useEffect, useState, useRef } from 'react';
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

  const stompClientRef  = useRef(null);
  const currentUserRef  = useRef(null);

  // Keep currentUserRef in sync so callbacks always see latest value
  useEffect(() => {
    currentUserRef.current = user?.username;
  }, [user]);

  // Fetch room info
  useEffect(() => {
    const fetchRoom = async () => {
      try {
        const res = await api.get(`/api/rooms/${roomId}`);
        setRoom(res.data);
      } catch {
        setError('Room not found or you do not have access.');
      } finally {
        setLoading(false);
      }
    };
    fetchRoom();
  }, [roomId]);

  // WebSocket connection
  useEffect(() => {
    if (!user?.username) return;

    const token    = localStorage.getItem('token');
    const username = user.username;

    const client = new Client({
      webSocketFactory: () =>
        new SockJS(
          `${import.meta.env.VITE_WS_URL || 'http://localhost:8080'}/ws`
        ),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,

      onConnect: () => {
        console.log('WebSocket connected as:', username);
        setConnected(true);

        // Add yourself immediately
        setOnlineUsers([username]);

        // Subscribe to presence BEFORE announcing join
        client.subscribe(
          `/topic/room/${roomId}/presence`,
          (frame) => {
            const p = JSON.parse(frame.body);
            console.log('Presence event:', p);

            if (p.eventType === 'JOIN') {
              setOnlineUsers((prev) => {
                if (prev.includes(p.username)) return prev;
                return [...prev, p.username];
              });
            }

            if (p.eventType === 'LEAVE') {
              setOnlineUsers((prev) =>
                prev.filter((u) => u !== p.username)
              );
            }
          }
        );

        // Small delay then announce join — ensures subscription is active
        setTimeout(() => {
          client.publish({
            destination: `/app/room/${roomId}/join`,
            body: JSON.stringify({ username }),
          });
        }, 300);
      },

      onDisconnect: () => {
        console.log('WebSocket disconnected');
        setConnected(false);
        setOnlineUsers([]);
      },

      onStompError: (frame) => {
        console.error('STOMP error:', frame);
        setConnected(false);
      },
    });

    client.activate();
    stompClientRef.current = client;

    // Cleanup
    return () => {
      if (client.connected) {
        client.publish({
          destination: `/app/room/${roomId}/leave`,
          body: JSON.stringify({ username }),
        });
      }
      client.deactivate();
    };
  }, [roomId, user?.username]);

  const copyLink = () => {
    navigator.clipboard.writeText(roomId);
    alert('Room ID copied! Share this with others to join.');
  };

  const handleLogout = () => { logout(); navigate('/login'); };

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
            ← Dashboard
          </button>
          <span className="text-gray-300">|</span>
          <span className="font-bold text-indigo-600">{room?.roomName}</span>
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
          <button onClick={copyLink}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600
                       px-3 py-1.5 rounded-lg transition">
            Copy Room ID
          </button>
          <button onClick={handleLogout}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700
                       px-3 py-1.5 rounded-lg transition">
            Logout
          </button>
        </div>
      </nav>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-100 px-6 flex gap-1
                      shrink-0">
        <button onClick={() => setActiveTab('chat')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition
            ${activeTab === 'chat'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          💬 Chat
        </button>
        <button onClick={() => setActiveTab('whiteboard')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition
            ${activeTab === 'whiteboard'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          🎨 Whiteboard
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden gap-4 p-4">

        {/* Tab panels */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-100
                        shadow-sm flex flex-col overflow-hidden">
          <div className={`flex-1 overflow-hidden flex flex-col
            ${activeTab === 'chat' ? 'flex' : 'hidden'}`}>
            <Chat
              roomId={roomId}
              currentUser={user?.username}
              stompClient={stompClientRef.current}
              connected={connected}
            />
          </div>
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

        {/* Right sidebar */}
        <div className="w-56 bg-white rounded-2xl border border-gray-100
                        shadow-sm p-4 shrink-0 hidden md:flex flex-col
                        overflow-y-auto">

          {/* Online users */}
          <OnlineUsers
            users={onlineUsers}
            currentUser={user?.username}
          />

          {/* Video call — always render, shows button when others online */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2">
              Video call
            </p>
            {onlineUsers.filter(u => u !== user?.username).length === 0 ? (
              <p className="text-xs text-gray-300">
                No other users online
              </p>
            ) : (
              onlineUsers
                .filter(u => u !== user?.username)
                .map(u => (
                  <div key={u} className="mb-1">
                    <VideoCall
                      roomId={roomId}
                      currentUser={user?.username}
                      onlineUsers={onlineUsers}
                      stompClient={stompClientRef.current}
                      connected={connected}
                      targetUser={u}
                    />
                  </div>
                ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
}