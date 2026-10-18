import { enqueue } from './offline.js';
import { currentLang, tr } from './i18n/index.jsx';

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function request(method, url, body) {
  const token = localStorage.getItem('mnp_token');
  const res = await fetch(`/api${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Accept-Language': currentLang(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    localStorage.removeItem('mnp_token');
    window.location.href = '/login';
  }
  // server चे मराठी संदेश निवडलेल्या भाषेत
  if (!res.ok) throw new ApiError(tr(data.message || 'काहीतरी चुकले'), res.status);
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  patch: (url, body) => request('PATCH', url, body),

  // नेटवर्क नसल्यास रांगेत ठेवा. परत: { queued: true } किंवा server response
  async postOffline(url, body, label) {
    if (!navigator.onLine) {
      await enqueue({ method: 'POST', url: `/api${url}`, body, label });
      return { queued: true };
    }
    try {
      return await request('POST', url, body);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      await enqueue({ method: 'POST', url: `/api${url}`, body, label }); // fetch अयशस्वी = नेटवर्क अडचण
      return { queued: true };
    }
  },

  // GET + localStorage cache (offline असताना शेवटचा डेटा दाखवा)
  async getCached(url) {
    const key = `mnp_cache:${url}`;
    try {
      const data = await request('GET', url);
      localStorage.setItem(key, JSON.stringify(data));
      return data;
    } catch (e) {
      const cached = localStorage.getItem(key);
      if (!(e instanceof ApiError) && cached) return JSON.parse(cached);
      throw e;
    }
  },
};
