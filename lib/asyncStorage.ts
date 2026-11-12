const STORAGE_PREFIX = 'friendschat_';

export const AsyncLocalStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(STORAGE_PREFIX + key);
      }
    } catch {}
    return null;
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_PREFIX + key, value);
      }
    } catch {}
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(STORAGE_PREFIX + key);
      }
    } catch {}
  },
};
