import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const storage = Platform.OS === 'web'
  ? undefined
  : {
      getItem: async (key: string) => {
        const AsyncStorage = require('react-native').AsyncStorage;
        return AsyncStorage.getItem(key);
      },
      setItem: async (key: string, value: string) => {
        const AsyncStorage = require('react-native').AsyncStorage;
        await AsyncStorage.setItem(key, value);
      },
      removeItem: async (key: string) => {
        const AsyncStorage = require('react-native').AsyncStorage;
        await AsyncStorage.removeItem(key);
      },
    };

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  realtime: { params: { eventsPerSecond: 10 } },
});
