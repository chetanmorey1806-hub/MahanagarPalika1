import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  port: Number(process.env.PORT || 5000),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  encryptionKey: process.env.DATA_ENCRYPTION_KEY || '',
  geofenceMode: process.env.GEOFENCE_MODE || 'warn',
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  whatsappToken: process.env.WHATSAPP_TOKEN || '',
  whatsappPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  slaCheckSeconds: Number(process.env.SLA_CHECK_SECONDS || 60),
  backupHour: Number(process.env.BACKUP_HOUR || 2),
  dbFile: path.join(root, 'data', 'mnp.db'),
  uploadsDir: path.join(root, 'uploads'),
  backupsDir: path.join(root, 'backups'),
};

if (!process.env.JWT_SECRET) console.warn('⚠️  JWT_SECRET सेट नाही — फक्त development साठी default वापरत आहे');
