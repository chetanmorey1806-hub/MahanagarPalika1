import express from 'express';
import http from 'node:http';
import { attachLive } from './live.js';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { q } from './db.js';
import { seedIfEmpty } from './seed.js';
import auth from './modules/auth.js';
import masters from './modules/masters.js';
import attendance from './modules/attendance.js';
import grievances from './modules/grievances.js';
import approvals from './modules/approvals.js';
import efiles from './modules/efiles.js';
import fleet from './modules/fleet.js';
import dashboard from './modules/dashboard.js';
import notifications from './modules/notifications.js';
import quick from './modules/quick.js';
import whatsapp from './modules/whatsapp.js';
import reports, { scheduleDailyReport } from './modules/reports.js';
import performance from './modules/performance.js';
import workReports from './modules/workReports.js';
import tax from './modules/tax.js';
import hr from './modules/hr.js';
import operations from './modules/operations.js';
import inbox from './modules/inbox.js';
import emergencies from './modules/emergencies.js';
import inspections from './modules/inspections.js';
import budget from './modules/budget.js';
import water from './modules/water.js';
import { runSlaCheck } from './jobs/sla.js';
import { runRouteWatch } from './jobs/routeWatch.js';
import { scheduleDailyBackup } from './jobs/backup.js';

seedIfEmpty();

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      'img-src': ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org'],
      'connect-src': ["'self'", 'ws:', 'wss:'],
      'media-src': ["'self'", 'blob:'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
    },
  },
}));
app.use(cors({ origin: [config.appUrl, /^http:\/\/localhost:\d+$/] }));
app.use(express.json({ limit: '15mb', verify: (req, res, buf) => { req.rawBody = buf; } })); // फोटो base64 मध्ये येतात; rawBody WhatsApp signature साठी
app.use(morgan('dev'));
app.use('/uploads', express.static(config.uploadsDir, { maxAge: '7d' }));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString(), users: q.get('SELECT COUNT(*) AS c FROM users').c }));

// प्रत्येक मॉड्युल स्वतंत्र — पुढे गरज पडल्यास वेगळ्या microservice मध्ये हलवता येईल
app.use('/api/auth', auth);
app.use('/api/masters', masters);
app.use('/api/attendance', attendance);
app.use('/api/grievances', grievances);
app.use('/api/approvals', approvals);
app.use('/api/efiles', efiles);
app.use('/api/fleet', fleet);
app.use('/api/dashboard', dashboard);
app.use('/api/notifications', notifications);
app.use('/api/quick', quick);
app.use('/api/whatsapp', whatsapp);
app.use('/api/reports', reports);
app.use('/api/performance', performance);
app.use('/api/work-reports', workReports);
app.use('/api/tax', tax);
app.use('/api/hr', hr);
app.use('/api/ops', operations);
app.use('/api/inbox', inbox);
app.use('/api/emergencies', emergencies);
app.use('/api/inspections', inspections);
app.use('/api/budget', budget);
app.use('/api/water', water);

// प्रशिक्षण व्हिडिओ — पाहणे (Range/streaming) व डाऊनलोड. फोल्डर: TRAINING_VIDEO_DIR (default: ../Amravati-MNP-Training-Video)
const VIDEO_DIR = process.env.TRAINING_VIDEO_DIR || path.resolve(config.uploadsDir, '../../../Amravati-MNP-Training-Video');
const VIDEOS = {
  mr: ['मराठी', 'अमरावती-मनपा-प्रशिक्षण-व्हिडिओ-मराठी'],
  hi: ['हिंदी', 'अमरावती-मनपा-प्रशिक्षण-वीडियो-हिंदी'],
  en: ['English', 'Amravati-MNP-Training-Video-English'],
};
const videoFile = (lang, ext) => VIDEOS[lang] && path.join(VIDEO_DIR, VIDEOS[lang][0], `${VIDEOS[lang][1]}.${ext}`);
app.get('/api/training', (req, res) => {
  res.json(Object.keys(VIDEOS).map((l) => {
    const f = videoFile(l, 'mp4');
    return { lang: l, available: fs.existsSync(f), size_mb: fs.existsSync(f) ? Math.round(fs.statSync(f).size / 1048576) : 0 };
  }));
});
app.get('/api/training/:lang.:ext(mp4|srt)', (req, res) => {
  const f = videoFile(req.params.lang, req.params.ext);
  if (!f || !fs.existsSync(f)) return res.status(404).json({ message: 'व्हिडिओ अजून तयार नाही' });
  if (req.query.download === '1') return res.download(f, path.basename(f));
  res.sendFile(f, { headers: { 'Content-Type': req.params.ext === 'mp4' ? 'video/mp4' : 'text/plain; charset=utf-8' } });
});

app.use('/api', (req, res) => res.status(404).json({ message: 'API सापडला नाही' }));

// Production: client/dist सर्व्ह करा
const dist = path.resolve(config.uploadsDir, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ message: err.status ? err.message : 'सर्व्हर त्रुटी, पुन्हा प्रयत्न करा' });
});

setInterval(() => {
  try { runSlaCheck(); } catch (e) { console.error('SLA job त्रुटी:', e.message); }
}, config.slaCheckSeconds * 1000).unref();
setInterval(() => {
  try { runRouteWatch(); } catch (e) { console.error('Route watch त्रुटी:', e.message); }
}, 5 * 60e3).unref();
scheduleDailyBackup();
scheduleDailyReport();

const server = http.createServer(app);
attachLive(server);
server.listen(config.port, () => console.log(`🏛️  अमरावती महानगरपालिका API चालू: http://localhost:${config.port}`));
