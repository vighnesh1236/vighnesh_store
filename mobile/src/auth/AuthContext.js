import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { setAuthToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const token = await AsyncStorage.getItem('shopkart_token');
        if (token) {
          setAuthToken(token);
          const response = await api.get('/auth/me');
          if (active) setUser(response.data.user);
        }
      } catch {
        await AsyncStorage.removeItem('shopkart_token');
        setAuthToken(null);
      } finally {
        if (active) setReady(true);
      }
    }
    restoreSession();
    return () => { active = false; };
  }, []);

  const value = useMemo(() => ({
    user,
    ready,
    async signIn(path, credentials) {
      const response = await api.post(path, credentials);
      await AsyncStorage.setItem('shopkart_token', response.data.token);
      setAuthToken(response.data.token);
      setUser(response.data.user);
      return response.data.user;
    },
    async signOut() {
      await AsyncStorage.removeItem('shopkart_token');
      setAuthToken(null);
      setUser(null);
    },
    setUser
  }), [user, ready]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
