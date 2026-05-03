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
  const [copied, setCopied]           = useState(false);

  // stompClient in state so children re-render when it changes
  const [stompClient, setStompClient] = useState(null);

  const clientIdRef  = useRef(0);
  const activeIdRef  = useRef(0);

  // Fetch room info once
  useEffect(() => {
    api.get('/api/rooms/' + roomId)
      .then((res) => setRoom(res.data))
      .catch(() => setError('Room not found or you do not have access.'))
      .finally(() => setLoading(false));
  }, [roomId]);

  // WebSocket connection
  useEffect(() => {
    if (!user?.username) return;

    const token    = localStorage.getItem('token');
    const username = user.username;

    clientIdRef.current += 1;
    const myId = clientIdRef.current;
    activeIdRef.current = myId;

    const client = new Client({
      webSocketFactory: () =>
        new SockJS(
          (import.meta.env.VITE_WS_URL || 'http://localhost:8080') + '/ws'
        ),
      connectHeaders: { Authorization: 'Bearer ' + token },
      reconnectDelay: 0,

      onConnect: () => {
        if (activeIdRef.current !== myId) {
          client.deactivate();
          return;
        }

        console.log('[WS] Connected as:', username);
        setConnected(true);
        setStompClient(client);

        client.subscribe(
          '/topic/room/' + roomId + '/presence',
          (frame) => {
            if (activeIdRef.current !== myId) return;
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

        client.subscribe(
          '/user/queue/signal',
          (frame) => {
            if (activeIdRef.current !== myId) return;
            const signal = JSON.parse(frame.body);
            window.dispatchEvent(
              new CustomEvent('webrtc-signal', { detail: signal })
            );
          }
        );

        api.get('/api/rooms/' + roomId + '/online')
          .then((res) => {
            if (activeIdRef.current !== myId) return;
            const users = Array.isArray(res.data)
              ? res.data
              : Array.from(res.data);
            setOnlineUsers(users);
          })
          .catch(() => {})
          .finally(() => {
            if (activeIdRef.current !== myId) return;
            setTimeout(() => {
              if (client.connected && activeIdRef.current === myId) {
                client.publish({
                  destination: '/app/room/' + roomId + '/join',
                  body: JSON.stringify({ username }),
                });
              }
            }, 300);
          });
      },

      onDisconnect: () => {
        if (activeIdRef.current === myId) {
          setConnected(false);
          setStompClient(null);
        }
      },

      onStompError: (frame) => {
        console.error('[WS] STOMP error:', frame);
        if (activeIdRef.current === myId) {
          setConnected(false);
          setStompClient(null);
        }
      },
    });

    client.activate();

    return () => {
      if (activeIdRef.current === myId) {
        activeIdRef.current = -1;
      }
      if (client.connected) {
        try {
          client.publish({
            destination: '/app/room/' + roomId + '/leave',
            body: JSON.stringify({ username }),
          });
        } catch (e) {
          console.warn('Leave publish failed:', e);
        }
      }
      client.deactivate();
      setStompClient(null);
      setOnlineUsers([]);
      setConnected(false);
    };
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
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center
                        max-w-sm w-full mx-4">
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
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">

      {/* Navbar */}
      <nav className="bg-white shadow-sm px-4 py-3 flex items-center
                      justify-between shrink-0 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gray-400 hover:text-gray-600 text-sm
                       transition shrink-0">
            Back
          </button>
          <span className="text-gray-300 shrink-0">|</span>
          <span className="font-bold text-indigo-600 truncate">
            {room?.roomName}
          </span>
          <span className={
            'text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ' +
            (connected
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-yellow-100 text-yellow-700')
          }>
            {connected ? 'Live' : 'Connecting'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-gray-500 hidden lg:block">
            <strong>{user?.username}</strong>
          </span>
          <button
            onClick={copyRoomId}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600
                       px-3 py-1.5 rounded-lg transition whitespace-nowrap">
            {copied ? 'Copied!' : 'Copy ID'}
          </button>
          <button
            onClick={handleLogout}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700
                       px-3 py-1.5 rounded-lg transition">
            Logout
          </button>
        </div>
      </nav>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-4 flex gap-1
                      shrink-0">
        <button
          onClick={() => setActiveTab('chat')}
          className={
            'px-4 py-2.5 text-sm font-medium border-b-2 transition ' +
            (activeTab === 'chat'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700')
          }>
          Chat
        </button>
        <button
          onClick={() => setActiveTab('whiteboard')}
          className={
            'px-4 py-2.5 text-sm font-medium border-b-2 transition ' +
            (activeTab === 'whiteboard'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700')
          }>
          Whiteboard
        </button>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden p-3 gap-3">

        {/* Content panel */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-100
                        shadow-sm flex flex-col overflow-hidden min-w-0">
          <div className={
            'flex-1 overflow-hidden flex flex-col ' +
            (activeTab === 'chat' ? 'flex' : 'hidden')
          }>
            <Chat
              roomId={roomId}
              currentUser={user?.username}
              stompClient={stompClient}
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
              stompClient={stompClient}
              connected={connected}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div
          className="bg-white rounded-2xl border border-gray-100
                     shadow-sm p-3 shrink-0 hidden md:flex flex-col
                     overflow-y-auto overflow-x-hidden"
          style={{ width: '200px', minWidth: '200px', maxWidth: '200px' }}>

          <OnlineUsers
            users={onlineUsers}
            currentUser={user?.username}
          />

          <div className="border-t border-gray-100 pt-3 mt-2">
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
                stompClient={stompClient}
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