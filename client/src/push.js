// Web Push Notifications — अ‍ॅप बंद असतानाही नवीन काम / मंजुरीची सूचना
import { api } from './api.js';
import { tr } from './i18n/index.jsx';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const toKey = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export async function enablePush() {
  if (!pushSupported()) throw new Error(tr('या ब्राउझरमध्ये Push सूचना उपलब्ध नाहीत'));
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(tr('सूचनांसाठी परवानगी दिली नाही'));
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api.get('/notifications/push-key');
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
  await api.post('/notifications/subscribe', sub.toJSON());
}

// आधीच परवानगी असल्यास लॉगिननंतर subscription server ला पुन्हा कळवा
export async function refreshPush() {
  if (pushSupported() && Notification.permission === 'granted') {
    try { await enablePush(); } catch { /* दुर्लक्ष */ }
  }
}
