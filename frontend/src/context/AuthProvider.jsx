import { useState, useEffect, useRef } from 'react';
import { AuthContext } from './AuthContext';
import api from '../api/axios';

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
      if (stored) {
        parsed = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to parse stored user', e);
    }

    setTimeout(() => {
      setUser(parsed);
      setLoading(false);
    }, 0);
  }, []);

  const login = async (username, password) => {
    const res = await api.post('/api/auth/login', {
      username: username,
      password: password,
    });
    const token  = res.data.token;
    const uname  = res.data.username;
    const email  = res.data.email;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({
      username: uname,
      email: email,
    }));
    setUser({ username: uname, email: email });
  };

  const register = async (username, email, password) => {
    const res = await api.post('/api/auth/register', {
      username: username,
      email: email,
      password: password,
    });
    const token = res.data.token;
    const uname = res.data.username;
    const em    = res.data.email;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify({
      username: uname,
      email: em,
    }));
    setUser({ username: uname, email: em });
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user: user,
      login: login,
      register: register,
      logout: logout,
      loading: loading,
    }}>
      {children}
    </AuthContext.Provider>
  );
}