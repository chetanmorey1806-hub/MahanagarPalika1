// माईक दाबा, मराठीत बोला → रिपोर्ट सबमिट (offline असल्यास रांगेत)
import { useState } from 'react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { fmtDate, getLocation, useFetch } from '../../utils.js';
import VoiceInput, { voiceSupported } from '../../components/VoiceInput.jsx';
import PhotoCapture from '../../components/PhotoCapture.jsx';
import { useAuth } from '../../auth.jsx';

export default function VoiceReport() {
  const t = useT();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [voice, setVoice] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const mine = useFetch(() => api.getCached('/work-reports/my'));

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const loc = photo?.meta || (await getLocation().catch(() => null));
      const res = await api.postOffline('/work-reports', { text, via_voice: voice, photo: photo?.dataUrl, lat: loc?.lat, lng: loc?.lng, capturedAt: new Date().toISOString() }, t('काम रिपोर्ट'));
      setMsg({ ok: true, text: res.queued ? t('📴 रिपोर्ट फोनमध्ये सेव्ह — नेटवर्क आल्यावर पाठवला जाईल') : t('✅ रिपोर्ट पाठवला!') });
      setText(''); setPhoto(null); setVoice(false);
      if (!res.queued) mine.reload();
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };

  return (
    <div>
      <h2 className="page-title">🎤 {t('कामाचा रिपोर्ट')}</h2>
      <div className="card center-card">
        <p className="muted">{voiceSupported ? t('माईक 🎤 दाबा आणि मराठीत बोला — उदा. "वॉर्ड नं. ४ मध्ये रस्ता साफ झाला आहे"') : t('या ब्राउझरमध्ये आवाज ओळख नाही — कृपया Chrome वापरा किंवा लिहा')}</p>
        <VoiceInput big value={text} onChange={setText} onVoiceUsed={() => setVoice(true)} rows={4} />
        <PhotoCapture label={`${user.name} · ${t('काम रिपोर्ट')}`} buttonText={t('📷 फोटो जोडा (ऐच्छिक)')} onCapture={setPhoto} />
        <button className="btn btn-success btn-xl btn-block" disabled={busy || !text.trim()} onClick={submit}>{busy ? t('पाठवत आहे…') : t('✔ रिपोर्ट पाठवा')}</button>
        {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-error'}`}>{msg.text}</div>}
      </div>

      <h3 className="section-title">{t('माझे रिपोर्ट')}</h3>
      <div className="list">
        {mine.data?.map((r) => (
          <div key={r.id} className="card list-item">
            <span>{r.via_voice ? '🎤 ' : '✏️ '}{r.text}</span>
            <small className="muted">{fmtDate(r.created_at)}</small>
          </div>
        ))}
        {mine.data?.length === 0 && <div className="card empty">{t('अजून रिपोर्ट नाही')}</div>}
      </div>
    </div>
  );
}
