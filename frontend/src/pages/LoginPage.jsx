import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.username, form.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_0.95fr] bg-slate-950">
      <section className="hidden lg:flex flex-col justify-between p-10 text-white bg-slate-950">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-blue-500 flex items-center justify-center font-black">
            CA
          </div>
          <div>
            <p className="font-bold leading-tight">CollabApp</p>
            <p className="text-xs text-slate-400">Realtime workspace</p>
          </div>
        </div>

        <div className="max-w-xl">
          <p className="text-sm font-semibold text-blue-300 mb-4">Practice. Pair. Present.</p>
          <h1 className="text-5xl font-black leading-tight tracking-tight">
            Your interview room, code desk, video call, notes, and whiteboard in one place.
          </h1>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {['Live chat', 'Admin approval', 'Shared notes'].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-500">Built for mock interviews, student groups, and hiring practice.</p>
      </section>

      <section className="min-h-screen flex items-center justify-center px-5 py-10 bg-slate-50 lg:rounded-l-[2rem]">
        <div className="w-full max-w-md surface rounded-3xl p-6 sm:p-8">
          <div className="mb-8">
            <div className="lg:hidden h-11 w-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black mb-5">
              IC
            </div>
            <h2 className="text-3xl font-black tracking-tight text-slate-950">Welcome back</h2>
            <p className="text-sm text-slate-500 mt-2">
              New here? <Link to="/register" className="font-semibold text-blue-600 hover:text-blue-700">Create an account</Link>
            </p>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Username</span>
              <input type="text" name="username" value={form.username} onChange={handleChange}
                placeholder="yourname" required
                className="focus-ring mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Password</span>
              <input type="password" name="password" value={form.password} onChange={handleChange}
                placeholder="Your password" required
                className="focus-ring mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900" />
            </label>
            <button type="submit" disabled={loading}
              className="w-full rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 text-sm transition disabled:opacity-60">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
