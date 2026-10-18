// Offline Queue: नेटवर्क नसताना केलेली कामे (हजेरी, फोटो पुरावा) IndexedDB मध्ये साठवली जातात
// आणि नेटवर्क आल्यावर आपोआप Sync होतात.
import { tr } from './i18n/index.jsx';

const DB_NAME = 'mnp-offline';
const STORE = 'queue';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
  });
}

const listeners = new Set();
export const onQueueChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = async () => { const n = await queueCount(); listeners.forEach((fn) => fn(n)); };

export async function enqueue(item) {
  await withStore('readwrite', (s) => s.add({ ...item, queuedAt: new Date().toISOString() }));
  emit();
}

export const queueCount = () => withStore('readonly', (s) => s.count());
const allItems = () => withStore('readonly', (s) => s.getAll());
const remove = (id) => withStore('readwrite', (s) => s.delete(id));

let syncing = false;
export async function syncQueue() {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  const failed = [];
  try {
    for (const item of await allItems()) {
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('mnp_token')}` },
          body: JSON.stringify(item.body),
        });
        if (res.ok) await remove(item.id);
        else if (res.status >= 400 && res.status < 500 && res.status !== 401) {
          // सर्व्हरने नाकारले (उदा. वॉर्डबाहेर हजेरी) — पुन्हा प्रयत्न निरुपयोगी
          const data = await res.json().catch(() => ({}));
          failed.push(`${item.label || item.url}: ${data.message || res.status}`);
          await remove(item.id);
        } else break; // सर्व्हर/नेटवर्क अडचण — नंतर पुन्हा
      } catch {
        break;
      }
    }
  } finally {
    syncing = false;
    emit();
  }
  if (failed.length) alert(tr('काही ऑफलाईन नोंदी नाकारल्या गेल्या:') + '\n' + failed.join('\n'));
}

window.addEventListener('online', syncQueue);
setInterval(syncQueue, 30000);
