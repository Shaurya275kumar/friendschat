import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { AsyncLocalStorage } from '@/lib/asyncStorage';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  primary: Record<number, string>;
  neutral: Record<number, string>;
  accent: Record<number, string>;
  success: Record<number, string>;
  warning: Record<number, string>;
  error: Record<number, string>;
  chatBg: string;
  bubbleOut: string;
  bubbleIn: string;
  blue: string;
  // Semantic
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  headerBg: string;
  inputBg: string;
  shadow: string;
}

const lightColors: ThemeColors = {
  primary: {
    50: '#e7f7ee', 100: '#c8eed4', 200: '#93ddae', 300: '#5dc585',
    400: '#2faa63', 500: '#128c4a', 600: '#0b7a3e', 700: '#0a6234',
    800: '#0a4f2c', 900: '#093f24',
  },
  neutral: {
    0: '#ffffff', 50: '#f8f9fa', 100: '#f1f3f5', 200: '#e9ecef',
    300: '#dee2e6', 400: '#ced4da', 500: '#adb5bd', 600: '#6c757d',
    700: '#495057', 800: '#343a40', 900: '#212529', 950: '#131618',
  },
  accent: {
    50: '#eef9ff', 100: '#d9f0ff', 200: '#bce5ff', 300: '#8ed5ff',
    400: '#59bdff', 500: '#33a0ff', 600: '#1a82f5', 700: '#1568e0',
    800: '#1854b5', 900: '#1a488f',
  },
  success: { 50: '#ecfdf5', 100: '#d1fae5', 500: '#16a34a', 600: '#15803d', 700: '#166534' },
  warning: { 50: '#fffbeb', 100: '#fef3c7', 500: '#f59e0b', 600: '#d97706' },
  error: { 50: '#fef2f2', 100: '#fee2e2', 500: '#dc2626', 600: '#dc2626', 700: '#b91c1c' },
  chatBg: '#e5ddd5',
  bubbleOut: '#d9fdd3',
  bubbleIn: '#ffffff',
  blue: '#34b7f1',
  background: '#f8f9fa',
  surface: '#ffffff',
  surfaceAlt: '#f1f3f5',
  text: '#212529',
  textSecondary: '#6c757d',
  textMuted: '#adb5bd',
  border: '#e9ecef',
  headerBg: '#ffffff',
  inputBg: '#f1f3f5',
  shadow: '#000000',
};

const darkColors: ThemeColors = {
  primary: {
    50: '#0a2e1e', 100: '#0e3a26', 200: '#128c4a', 300: '#1fa058',
    400: '#2fb86a', 500: '#3ccb7d', 600: '#4ddc8e', 700: '#5fe89f',
    800: '#7af0b3', 900: '#a3f7c9',
  },
  neutral: {
    0: '#0b0f14', 50: '#11161c', 100: '#1a1f26', 200: '#222831',
    300: '#2d3540', 400: '#4a5560', 500: '#6b7785', 600: '#8893a0',
    700: '#a0aab5', 800: '#c5cdd5', 900: '#e0e5ea', 950: '#f0f3f6',
  },
  accent: {
    50: '#0a1a2e', 100: '#0e2238', 200: '#1568e0', 300: '#1a82f5',
    400: '#33a0ff', 500: '#59bdff', 600: '#8ed5ff', 700: '#bce5ff',
    800: '#d9f0ff', 900: '#eef9ff',
  },
  success: { 50: '#052e1a', 100: '#063b21', 500: '#16a34a', 600: '#22c55e', 700: '#4ade80' },
  warning: { 50: '#2a1a05', 100: '#3a260a', 500: '#f59e0b', 600: '#fbbf24' },
  error: { 50: '#2a0a0a', 100: '#3a0e0e', 500: '#ef4444', 600: '#f87171', 700: '#fca5a5' },
  chatBg: '#0b141a',
  bubbleOut: '#005c4b',
  bubbleIn: '#202c33',
  blue: '#34b7f1',
  background: '#0b0f14',
  surface: '#11161c',
  surfaceAlt: '#1a1f26',
  text: '#e0e5ea',
  textSecondary: '#8893a0',
  textMuted: '#4a5560',
  border: '#222831',
  headerBg: '#11161c',
  inputBg: '#1a1f26',
  shadow: '#000000',
};

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  isDark: false,
  colors: lightColors,
  setMode: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncLocalStorage.getItem('theme-mode');
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setModeState(stored);
        }
      } catch {}
    })();
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncLocalStorage.setItem('theme-mode', m).catch(() => {});
  }, []);

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  const colors = isDark ? darkColors : lightColors;

  const toggle = useCallback(() => {
    setMode(isDark ? 'light' : 'dark');
  }, [isDark, setMode]);

  return (
    <ThemeContext.Provider value={{ mode, isDark, colors, setMode, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

// Backward-compatible exports for utility functions
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function formatLastSeen(iso: string, isOnline: boolean): string {
  if (isOnline) return 'online';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'last seen just now';
  if (diffMin < 60) return `last seen ${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `last seen ${diffHr}h ago`;
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return `last seen today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (d.toDateString() === yesterday.toDateString()) return `last seen yesterday at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return `last seen ${d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })}`;
}
