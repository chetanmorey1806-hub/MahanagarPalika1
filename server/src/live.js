// Real-time push (socket.io). Rooms: user:<id>, role:<role>, ward:<id>, staff (सर्व लॉगिन)
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { q } from './db.js';

let io = null;

export function attachLive(httpServer) {
  io = new Server(httpServer, { path: '/socket.io', cors: { origin: [config.appUrl, /^http:\/\/localhost:\d+$/] } });
  io.use((socket, next) => {
    try {
      const { id } = jwt.verify(socket.handshake.auth?.token || '', config.jwtSecret);
      const user = q.get('SELECT id, role, ward_id, department_id, active FROM users WHERE id = ?', id);
      if (!user?.active) return next(new Error('unauthorized'));
      socket.data.user = user;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });
  io.on('connection', (socket) => {
    const u = socket.data.user;
    socket.join(['staff', `user:${u.id}`, `role:${u.role}`]);
    if (u.ward_id) socket.join(`ward:${u.ward_id}`);
  });
  return io;
}

// to: undefined = सर्व कर्मचारी; किंवा 'user:5', 'role:admin', ['ward:2', 'role:admin']
export function emit(event, payload = {}, to) {
  if (!io) return;
  (to ? io.to(to) : io.to('staff')).emit(event, payload);
}
