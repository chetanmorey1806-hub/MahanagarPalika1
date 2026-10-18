import { Router } from 'express';
import { q, now } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { vapidPublicKey } from '../utils/push.js';

const r = Router();
r.use(requireAuth);

r.get('/', (req, res) => {
  res.json({
    unread: q.get('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0', req.user.id).c,
    items: q.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50', req.user.id),
  });
});

// Web Push subscription
r.get('/push-key', (req, res) => res.json({ publicKey: vapidPublicKey }));

r.post('/subscribe', (req, res) => {
  const sub = req.body;
  if (!sub?.endpoint || !sub?.keys?.p256dh) return res.status(400).json({ message: 'अवैध subscription' });
  q.run(`INSERT INTO push_subscriptions (user_id, endpoint, subscription, created_at) VALUES (?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, subscription = excluded.subscription`,
    req.user.id, sub.endpoint, JSON.stringify(sub), now());
  res.json({ ok: true });
});

r.post('/read-all', (req, res) => {
  q.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', req.user.id);
  res.json({ ok: true });
});

export default r;
