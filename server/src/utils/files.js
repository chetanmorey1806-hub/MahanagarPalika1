// base64 dataURL फोटो uploads/ फोल्डरमध्ये सेव्ह करा.
// (Offline queue मधून येणारे फोटो JSON मध्येच येतात, म्हणून multipart ऐवजी dataURL.)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function saveDataUrl(dataUrl, folder) {
  if (!dataUrl) return null;
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl);
  if (!m || !ALLOWED[m[1]]) throw Object.assign(new Error('फोटो फॉरमॅट चुकीचा आहे'), { status: 400 });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 5 * 1024 * 1024) throw Object.assign(new Error('फोटो 5MB पेक्षा मोठा आहे'), { status: 400 });
  const dir = path.join(config.uploadsDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ALLOWED[m[1]]}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return `/uploads/${folder}/${name}`;
}
