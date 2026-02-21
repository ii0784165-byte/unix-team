import { create } from 'zustand';
import { authApi } from '../services/api';

export const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  loading: true,
  
  initialize: async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      set({ loading: false, isAuthenticated: false });
      return;
    }
    
    try {
      const response = await authApi.getProfile();
      set({ 
        user: response.data.data.user, 
        isAuthenticated: true, 
        loading: false 
      });
    } catch (error) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      set({ loading: false, isAuthenticated: false });
    }
  },
  
  login: async (email, password) => {
    const response = await authApi.login({ email, password });
    const { accessToken, refreshToken, user, requiresMfa } = response.data.data;
    
    if (requiresMfa) {
      return { requiresMfa: true };
    }
    
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    set({ user, isAuthenticated: true });
    return { success: true };
  },
  
  loginWithMfa: async (email, password, mfaToken) => {
    const response = await authApi.login({ email, password, mfaToken });
    const { accessToken, refreshToken, user } = response.data.data;
    
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    set({ user, isAuthenticated: true });
  },
  
  register: async (data) => {
    const response = await authApi.register(data);
    const { accessToken, refreshToken, user } = response.data.data;
    
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    set({ user, isAuthenticated: true });
  },
  
  logout: async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
    
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null, isAuthenticated: false });
  },
  
  updateUser: (userData) => {
    set({ user: { ...get().user, ...userData } });
  }
}));

// Initialize auth on app load
useAuthStore.getState().initialize();
