import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ThemeState {
  accentColor: string;
  setAccentColor: (color: string) => Promise<void>;
  loadPrefs: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  accentColor: '#3B82F6',

  setAccentColor: async (color) => {
    set({ accentColor: color });
    try { await AsyncStorage.setItem('accentColor', color); } catch {}
  },

  loadPrefs: async () => {
    try {
      const color = await AsyncStorage.getItem('accentColor');
      if (color) set({ accentColor: color });
    } catch {}
  },
}));
