// Light / Dark theme — <html data-theme="light|dark">; निवड localStorage मध्ये
import { useEffect, useState } from 'react';

const KEY = 'mnp_theme';
const read = () => {
  try { return localStorage.getItem(KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { return 'light'; }
};

export function applyTheme(t = read()) {
  document.documentElement.dataset.theme = t;
}

export function useTheme() {
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(KEY, theme); } catch { /* खाजगी मोड */ }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}
