// Real-time updates (WebSocket / socket.io): नवीन तक्रार, अलर्ट, सूचना आल्यावर पान refresh न करता अपडेट
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

let socket = null;

function getSocket() {
  const token = localStorage.getItem('mnp_token');
  if (!token) return null;
  if (!socket) {
    socket = io({ path: '/socket.io', auth: { token }, transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function closeLive() {
  socket?.disconnect();
  socket = null;
}

// event: 'grievance' | 'alert' | 'notification' | 'dashboard' | 'emergency' | 'attendance'
export function useLive(event, callback) {
  const cb = useRef(callback);
  cb.current = callback;
  useEffect(() => {
    const s = getSocket();
    if (!s) return undefined;
    const h = (payload) => cb.current(payload);
    const events = Array.isArray(event) ? event : [event];
    events.forEach((e) => s.on(e, h));
    return () => events.forEach((e) => s.off(e, h));
  }, [Array.isArray(event) ? event.join(',') : event]); // eslint-disable-line react-hooks/exhaustive-deps
}
