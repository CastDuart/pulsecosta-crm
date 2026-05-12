import { createContext, useContext, useState, type ReactNode } from 'react';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('crm_user');
    return stored ? (JSON.parse(stored) as User) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('crm_token'));

  const login = async (email: string, _password: string) => {
    // TODO: replace with POST /crm/auth/login when API is live
    const mockToken = 'mock_jwt_' + Date.now();
    const isCipry = email.includes('cipry');
    const mockUser: User = {
      id: isCipry ? 1 : 2,
      name: isCipry ? 'Cipriano Castro' : 'Heidi Raaterova',
      email,
      role: 'super_admin',
      initials: isCipry ? 'CC' : 'HR',
    };
    setUser(mockUser);
    setToken(mockToken);
    localStorage.setItem('crm_token', mockToken);
    localStorage.setItem('crm_user', JSON.stringify(mockUser));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
