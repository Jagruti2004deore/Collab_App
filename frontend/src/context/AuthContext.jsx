import { createContext, useState, useEffect, useRef } from 'react';
import api from '../api/axios';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const initialized           = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    let parsed = null;
    try {
      const stored = localStorage.getItem('user');
      if (stored) parsed = JSON.parse(stored);
    } catch (e) {
      console.warn('Failed to parse stored user', e);
    }

    setTimeout(() => {
      setUser(parsed);
      setLoading(false);
    }, 0);
  }, []);

  const login = async (username, password) => {
    const res = await api.post('/api/auth/login', { username, password });
    const { token, username: uname, email } = res.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({ username: uname, email }));
    setUser({ username: uname, email });
  };

  const register = async (username, email, password) => {
    const res = await api.post('/api/auth/register', { username, email, password });
    const { token, username: uname, email: em } = res.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({ username: uname, email: em }));
    setUser({ username: uname, email: em });
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}