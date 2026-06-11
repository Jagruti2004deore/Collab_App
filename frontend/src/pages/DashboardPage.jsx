import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../api/axios';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [myRooms, setMyRooms] = useState([]);
  const [joinedRooms, setJoinedRooms] = useState([]);
  const [roomName, setRoomName] = useState('');
  const [joinId, setJoinId] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const [myRes, joinedRes] = await Promise.all([
        api.get('/api/rooms/my'),
        api.get('/api/rooms/joined'),
      ]);
      setMyRooms(myRes.data);
      setJoinedRooms(joinedRes.data);
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

    let id = joinId.trim();
    if (id.includes('/room/')) id = id.split('/room/')[1];
    id = id.split('?')[0].replace(/\/$/, '');

    try {
      const res = await api.get(`/api/rooms/${id}/exists`);
      if (res.data.exists) {
        await api.post(`/api/rooms/${id}/join-requests`);
        navigate(`/room/${id}`);
      } else {
        setError('Room not found. Check the room ID and try again.');
      }
    } catch {
      setError('Room not found or request could not be sent.');
    } finally {
      setJoining(false);
    }
  };

  const copyRoomId = (roomId) => {
    navigator.clipboard.writeText(roomId);
    setCopied(roomId);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const RoomCard = ({ room, owned }) => (
    <article className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${owned ? 'bg-blue-500' : 'bg-emerald-500'}`} />
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              {owned ? 'Owned room' : 'Joined room'}
            </p>
          </div>
          <h3 className="mt-3 truncate text-lg font-black text-slate-950">{room.roomName}</h3>
          <p className="mt-1 truncate font-mono text-xs text-slate-400">{room.roomId}</p>
        </div>
        <button
          onClick={() => navigate(`/room/${room.roomId}`)}
          className="rounded-2xl bg-slate-950 px-4 py-2 text-xs font-bold text-white transition group-hover:bg-blue-600">
          Open
        </button>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
        <button
          onClick={() => copyRoomId(room.roomId)}
          className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200">
          {copied === room.roomId ? 'Copied' : 'Copy ID'}
        </button>
        <p className="text-xs text-slate-400">
          {room.createdAt ? new Date(room.createdAt).toLocaleDateString() : 'Ready'}
        </p>
      </div>
    </article>
  );

  return (
    <div className="app-shell">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black">
              CA
            </div>
            <div>
              <p className="font-black leading-tight text-slate-950">CollabApp</p>
              <p className="hidden text-xs text-slate-500 sm:block">Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-bold text-slate-900">{user?.username}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
            <button onClick={handleLogout}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <section className="dark-surface rounded-[2rem] p-6 text-white sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_26rem] lg:items-end">
            <div>
              <p className="text-sm font-bold text-blue-300">Professional workspace</p>
              <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">
                Build sharper sessions with rooms, chat, whiteboard, notes, code, and video.
              </h1>
              <div className="mt-6 grid grid-cols-3 gap-3 max-w-xl">
                <div className="rounded-2xl bg-white/8 p-4">
                  <p className="text-2xl font-black">{myRooms.length}</p>
                  <p className="text-xs text-slate-300">Owned</p>
                </div>
                <div className="rounded-2xl bg-white/8 p-4">
                  <p className="text-2xl font-black">{joinedRooms.length}</p>
                  <p className="text-xs text-slate-300">Joined</p>
                </div>
                <div className="rounded-2xl bg-white/8 p-4">
                  <p className="text-2xl font-black">{myRooms.length + joinedRooms.length}</p>
                  <p className="text-xs text-slate-300">Total</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-4 text-slate-950 shadow-2xl">
              <form onSubmit={handleCreateRoom} className="space-y-3">
                <label className="block">
                  <span className="text-sm font-black">Create a room</span>
                  <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="Mock interview, DSA practice..."
                    className="focus-ring mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                  />
                </label>
                <button type="submit" disabled={creating || !roomName.trim()}
                  className="w-full rounded-2xl bg-blue-600 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
                  {creating ? 'Creating...' : 'Create room'}
                </button>
              </form>
            </div>
          </div>
        </section>

        {error && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        <section className="mt-6 grid gap-6 lg:grid-cols-[24rem_1fr]">
          <aside className="surface rounded-3xl p-5">
            <h2 className="text-lg font-black text-slate-950">Join room</h2>
            <p className="mt-1 text-sm text-slate-500">Paste a room ID or invite link. The owner will approve your request.</p>
            <form onSubmit={handleJoinRoom} className="mt-5 space-y-3">
              <input
                type="text"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                placeholder="Room ID or link"
                className="focus-ring w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
              />
              <button type="submit" disabled={joining || !joinId.trim()}
                className="w-full rounded-2xl bg-emerald-600 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60">
                {joining ? 'Sending request...' : 'Request access'}
              </button>
            </form>

            <div className="mt-6 rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-900">Room safety</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Direct entry is disabled. Admin approval protects sessions from unwanted joins.
              </p>
            </div>
          </aside>

          <section>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-950">Your rooms</h2>
                <p className="text-sm text-slate-500">Continue an interview, prep room, or team session.</p>
              </div>
            </div>

            {loadingRooms ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-40 animate-pulse rounded-3xl bg-white border border-slate-200" />
                ))}
              </div>
            ) : myRooms.length + joinedRooms.length === 0 ? (
              <div className="surface mt-5 rounded-3xl p-10 text-center">
                <p className="text-lg font-black text-slate-900">No rooms yet</p>
                <p className="mt-2 text-sm text-slate-500">Create a room or request access to one to get started.</p>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {myRooms.map((room) => <RoomCard key={room.roomId} room={room} owned />)}
                {joinedRooms.map((room) => <RoomCard key={room.roomId} room={room} />)}
              </div>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}
