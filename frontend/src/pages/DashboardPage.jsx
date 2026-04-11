import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [rooms, setRooms]           = useState([]);
  const [roomName, setRoomName]     = useState('');
  const [joinId, setJoinId]         = useState('');
  const [creating, setCreating]     = useState(false);
  const [joining, setJoining]       = useState(false);
  const [error, setError]           = useState('');
  const [loadingRooms, setLoadingRooms] = useState(true);

  // Load the user's rooms when the dashboard mounts
  useEffect(() => {
    fetchMyRooms();
  }, []);

  const fetchMyRooms = async () => {
    try {
      const res = await api.get('/api/rooms/my');
      setRooms(res.data);
    } catch (err) {
      console.error('Failed to load rooms', err);
    } finally {
      setLoadingRooms(false);
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!roomName.trim()) return;
    setError('');
    setCreating(true);
    try {
      const res = await api.post('/api/rooms', { roomName: roomName.trim() });
      // Navigate immediately into the new room
      navigate(`/room/${res.data.roomId}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!joinId.trim()) return;
    setError('');
    setJoining(true);
    try {
      // Validate the room exists before navigating
      const res = await api.get(`/api/rooms/${joinId.trim()}/exists`);
      if (res.data.exists) {
        navigate(`/room/${joinId.trim()}`);
      } else {
        setError('Room not found. Check the room ID and try again.');
      }
    } catch {
      setError('Room not found. Check the room ID and try again.');
    } finally {
      setJoining(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const copyToClipboard = (roomId) => {
    navigator.clipboard.writeText(`${window.location.origin}/room/${roomId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
        <span className="text-lg font-bold text-indigo-600">CollabApp</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            Hi, <strong>{user?.username}</strong>
          </span>
          <button
            onClick={handleLogout}
            className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700
                       px-4 py-2 rounded-lg transition">
            Logout
          </button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto mt-10 px-4 pb-16">
        <h2 className="text-2xl font-bold text-gray-800 mb-8">Dashboard</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm
                          rounded-lg px-4 py-3 mb-6">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">

          {/* Create Room Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-1">
              Create a Room
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Start a new collaboration space and invite others.
            </p>
            <form onSubmit={handleCreateRoom} className="space-y-3">
             <input
                 type="text"
                 id="roomName"
                 name="roomName"
                 value={roomName}
                 onChange={(e) => setRoomName(e.target.value)}
                 placeholder="e.g. Design Review, Sprint Planning..."
                 className="w-full border border-gray-300 rounded-lg px-4 py-2.5
             text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
/>
              <button
                type="submit"
                disabled={creating || !roomName.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white
                           font-medium py-2.5 rounded-lg text-sm transition
                           disabled:opacity-60">
                {creating ? 'Creating...' : '+ Create Room'}
              </button>
            </form>
          </div>

          {/* Join Room Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-1">
              Join a Room
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Enter a room ID or paste a shared link.
            </p>
            <form onSubmit={handleJoinRoom} className="space-y-3">
              <input
                type="text"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                placeholder="Paste room ID here..."
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5
                           text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={joining || !joinId.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white
                           font-medium py-2.5 rounded-lg text-sm transition
                           disabled:opacity-60">
                {joining ? 'Joining...' : '→ Join Room'}
              </button>
            </form>
          </div>
        </div>

        {/* My Rooms List */}
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-4">My Rooms</h3>

          {loadingRooms ? (
            <div className="text-center text-gray-400 py-10 text-sm">
              Loading rooms...
            </div>
          ) : rooms.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm
                            text-center py-12 text-gray-400 text-sm">
              You haven't created any rooms yet.
            </div>
          ) : (
            <div className="space-y-3">
              {rooms.map((room) => (
                <div
                  key={room.roomId}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm
                             px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-800">{room.roomName}</p>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">
                      {room.roomId}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyToClipboard(room.roomId)}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600
                                 px-3 py-1.5 rounded-lg transition">
                      Copy Link
                    </button>
                    <button
                      onClick={() => navigate(`/room/${room.roomId}`)}
                      className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white
                                 px-3 py-1.5 rounded-lg transition">
                      Enter
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}