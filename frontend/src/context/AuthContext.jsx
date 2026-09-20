import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('tiss_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tiss_token');
    if (token) {
      api.get('/auth/me')
        .then(res => {
          setUser(res.data.user);
          localStorage.setItem('tiss_user', JSON.stringify(res.data.user));
        })
        .catch(() => {
          logout();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const loginTeacher = async (username, password, section_code) => {
    const res = await api.post('/auth/login/teacher', { username, password, section_code });
    const { token, user: userData } = res.data;
    localStorage.setItem('tiss_token', token);
    localStorage.setItem('tiss_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const loginStudent = async (roll_number, password) => {
    const res = await api.post('/auth/login/student', { roll_number, password });
    const { token, user: userData } = res.data;
    localStorage.setItem('tiss_token', token);
    localStorage.setItem('tiss_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('tiss_token');
    localStorage.removeItem('tiss_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, loginTeacher, loginStudent, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
