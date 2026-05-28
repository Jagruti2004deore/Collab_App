import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form.username, form.email, form.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[0.95fr_1.05fr] bg-slate-950">
      <section className="min-h-screen flex items-center justify-center px-5 py-10 bg-slate-50 lg:rounded-r-[2rem]">
        <div className="w-full max-w-md surface rounded-3xl p-6 sm:p-8">
          <div className="mb-8">
            <div className="h-11 w-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black mb-5">
              IC
            </div>
            <h2 className="text-3xl font-black tracking-tight text-slate-950">Create account</h2>
            <p className="text-sm text-slate-500 mt-2">
              Already have one? <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700">Sign in</Link>
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
              <span className="text-sm font-semibold text-slate-700">Email</span>
              <input type="email" name="email" value={form.email} onChange={handleChange}
                placeholder="you@example.com" required
                className="focus-ring mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Password</span>
              <input type="password" name="password" value={form.password} onChange={handleChange}
                placeholder="Min. 6 characters" required
                className="focus-ring mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900" />
            </label>
            <button type="submit" disabled={loading}
              className="w-full rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 text-sm transition disabled:opacity-60">
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        </div>
      </section>

      <section className="hidden lg:flex flex-col justify-between p-10 text-white bg-slate-950">
        <div className="flex items-center gap-3 justify-end">
          <p className="text-sm text-slate-400">Professional rooms for serious practice</p>
        </div>
        <div className="max-w-xl ml-auto">
          <p className="text-sm font-semibold text-emerald-300 mb-4">Ready for teams</p>
          <h1 className="text-5xl font-black leading-tight tracking-tight">
            Approve participants, share files, take notes, whiteboard ideas, and run mock interviews.
          </h1>
        </div>
        <p className="text-xs text-slate-500 text-right">Secure by default with owner-controlled rooms.</p>
      </section>
    </div>
  );
}
