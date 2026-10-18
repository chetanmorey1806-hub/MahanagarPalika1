// दररोज आपोआप DB backup (backups/ फोल्डरमध्ये, १४ दिवस ठेवले जातात).
// Cloud backup साठी backups/ फोल्डर S3/Google Drive वर sync करा (उदा. rclone cron).
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db.js';
import { config } from '../config.js';

const KEEP_DAYS = 14;

export function runBackup() {
  fs.mkdirSync(config.backupsDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const target = path.join(config.backupsDir, `mnp-${stamp}.db`);
  if (fs.existsSync(target)) fs.unlinkSync(target);
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  for (const f of fs.readdirSync(config.backupsDir)) {
    const full = path.join(config.backupsDir, f);
    if (Date.now() - fs.statSync(full).mtimeMs > KEEP_DAYS * 864e5) fs.unlinkSync(full);
  }
  console.log(`💾 Backup तयार: ${target}`);
}

export function scheduleDailyBackup() {
  let lastDay = null;
  setInterval(() => {
    const d = new Date();
    const day = d.toISOString().slice(0, 10);
    if (d.getHours() === config.backupHour && lastDay !== day) {
      lastDay = day;
      try { runBackup(); } catch (e) { console.error('Backup त्रुटी:', e.message); }
    }
  }, 60e3).unref();
}
