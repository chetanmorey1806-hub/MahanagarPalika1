import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { closeLive } from './live.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('mnp_user') || 'null'));

  useEffect(() => {
    if (!localStorage.getItem('mnp_token')) return;
    api.get('/auth/me').then((u) => { setUser(u); localStorage.setItem('mnp_user', JSON.stringify(u)); }).catch(() => {});
  }, []);

  const login = async (mobile, password) => {
    const { token, user: u } = await api.post('/auth/login', { mobile, password });
    localStorage.setItem('mnp_token', token);
    localStorage.setItem('mnp_user', JSON.stringify(u));
    setUser(u);
    return u;
  };

  const logout = () => {
    closeLive();
    localStorage.removeItem('mnp_token');
    localStorage.removeItem('mnp_user');
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
