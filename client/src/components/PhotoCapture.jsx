// कामाचा फोटो पुरावा: कॅमेरा उघडतो, फोटोवर Live GPS + तारीख/वेळ watermark टाकतो.
import { useRef, useState } from 'react';
import { getLocation } from '../utils.js';
import { tr, useT } from '../i18n/index.jsx';

const MAX = 1280;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function watermark(file, loc, label) {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const raw = canvas.toDataURL('image/jpeg', 0.85); // watermark नसलेला (OCR / चेहरा ओळखीसाठी)

  const capturedAt = new Date();
  const lines = [
    label,
    tr('📍 {lat}, {lng} (±{acc} मी.)', { lat: loc.lat.toFixed(6), lng: loc.lng.toFixed(6), acc: loc.accuracy }),
    `🕒 ${capturedAt.toLocaleString('mr-IN', { dateStyle: 'medium', timeStyle: 'medium' })}`,
  ].filter(Boolean);
  const fs = Math.max(14, Math.round(canvas.width / 38));
  ctx.font = `600 ${fs}px Mukta, sans-serif`;
  const pad = fs * 0.6;
  const boxH = lines.length * fs * 1.35 + pad * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, canvas.height - boxH, canvas.width, boxH);
  ctx.fillStyle = '#fff';
  lines.forEach((t, i) => ctx.fillText(t, pad, canvas.height - boxH + pad + fs * (i + 1) * 1.25));
  URL.revokeObjectURL(img.src);
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.75), raw, meta: { ...loc, capturedAt: capturedAt.toISOString() } };
}

export default function PhotoCapture({ label, selfie = false, onCapture, buttonText = '📷 फोटो काढा', big = false }) {
  const t = useT();
  const input = useRef();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  const handle = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const loc = await getLocation();
      const result = await watermark(file, loc, label);
      setPreview(result.dataUrl);
      onCapture(result);
    } catch (err) {
      setError(err.message || t('फोटो घेता आला नाही'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="photo-capture">
      <input ref={input} type="file" accept="image/*" capture={selfie ? 'user' : 'environment'} hidden onChange={handle} />
      {preview && <img src={preview} alt="" className="photo-preview" />}
      <button type="button" className={`btn ${big ? 'btn-xl' : ''} ${preview ? 'btn-light' : 'btn-primary'}`} disabled={busy} onClick={() => input.current.click()}>
        {busy ? t('⏳ GPS घेत आहे…') : preview ? t('🔄 पुन्हा फोटो काढा') : t(buttonText)}
      </button>
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}
