// Geo-fenced Face हजेरी — चेहरा ओळख + GPS; offline असताना रांगेत, नेटवर्क आल्यावर sync
import { useEffect, useState } from 'react';
import { faceDescriptor, preloadFace } from '../../face.js';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { currentLocale, useT } from '../../i18n/index.jsx';
import { fmtDay, fmtTime, useFetch } from '../../utils.js';
import PhotoCapture from '../../components/PhotoCapture.jsx';

export default function Attendance() {
  const t = useT();
  const { user } = useAuth();
  const today = useFetch(() => api.getCached('/attendance/today'));
  const history = useFetch(() => api.getCached('/attendance/my'));
  const [shot, setShot] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const a = today.data;
  const mode = !a?.check_in_at ? 'in' : !a.check_out_at ? 'out' : 'done';
  const [face, setFace] = useState(null); // { descriptor } | { error } | 'checking'
  useEffect(() => { if (mode === 'in') preloadFace().catch(() => {}); }, [mode]);

  // सेल्फी घेतल्यावर लगेच चेहरा शोधा
  const onShot = async (s) => {
    setShot(s);
    if (mode !== 'in') return;
    setFace('checking');
    setFace(await faceDescriptor(s.raw || s.dataUrl));
  };

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const body = { lat: shot.meta.lat, lng: shot.meta.lng, photo: shot.dataUrl, capturedAt: shot.meta.capturedAt, face_descriptor: face?.descriptor };
      const res = await api.postOffline(`/attendance/check-${mode}`, body, mode === 'in' ? t('हजेरी (आगमन)') : t('हजेरी (निर्गमन)'));
      if (res.queued) {
        setMsg({ ok: true, text: t('📴 नेटवर्क नाही — हजेरी फोनमध्ये सेव्ह केली. नेटवर्क आल्यावर आपोआप पाठवली जाईल.') });
      } else {
        const faceText = res.face_status === 'enrolled' ? ` ${t('🙂 तुमचा चेहरा प्रथमच नोंदवला.')}` : res.face_status === 'match' ? ` ${t('✅ चेहरा जुळला.')}` : res.face_status === 'mismatch' ? ` ${t('⚠️ चेहरा जुळला नाही — सुपरवायझर तपासतील.')}` : '';
        setMsg({ ok: res.face_status !== 'mismatch', text: (res.inside_geofence === 0 ? t('⚠️ हजेरी घेतली, पण तुम्ही वॉर्डबाहेर आहात ({m} मी.). सुपरवायझरला कळवले जाईल.', { m: res.check_in_distance_m }) : t('✅ हजेरी यशस्वी!')) + faceText });
        today.reload();
        history.reload();
      }
      setShot(null);
      setFace(null);
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">🧑 {t('हजेरी')}</h2>
      <div className="card center-card">
        <p className="muted">{t(user.ward_name)} · {new Date().toLocaleDateString(currentLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        {mode === 'done' ? (
          <>
            <div className="big-emoji">✅</div>
            <h3>{t('आजची हजेरी पूर्ण')}</h3>
            <p>{t('आले:')} <b>{fmtTime(a.check_in_at)}</b> · {t('गेले:')} <b>{fmtTime(a.check_out_at)}</b></p>
          </>
        ) : (
          <>
            <div className="big-emoji">{mode === 'in' ? '🌅' : '🌇'}</div>
            <h3>{mode === 'in' ? t('कामावर आलो (Check-in)') : t('काम संपले (Check-out)')}</h3>
            {mode === 'out' && <p>{t('आले:')} <b>{fmtTime(a.check_in_at)}</b></p>}
            <PhotoCapture selfie big label={`${user.name} · ${t('हजेरी')}`} buttonText={t('🤳 सेल्फी काढा')} onCapture={onShot} />
            {mode === 'in' && face === 'checking' && <div className="alert">{t('🙂 चेहरा ओळखत आहे…')}</div>}
            {mode === 'in' && face?.descriptor && <div className="alert alert-ok">{t('🙂 चेहरा ओळखला')}</div>}
            {mode === 'in' && face?.error === 'no_face' && <div className="alert alert-error">{t('😕 फोटोत चेहरा स्पष्ट दिसला नाही — उजेडात पुन्हा सेल्फी काढा')}</div>}
            {shot && (
              <button className="btn btn-success btn-xl btn-block" disabled={busy || face === 'checking' || (mode === 'in' && face?.error === 'no_face')} onClick={submit}>
                {busy ? t('पाठवत आहे…') : mode === 'in' ? t('✔ हजेरी द्या') : t('✔ निर्गमन नोंदवा')}
              </button>
            )}
          </>
        )}
        {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-error'}`}>{msg.text}</div>}
      </div>

      <h3 className="section-title">{t('मागील हजेरी')}</h3>
      <div className="card">
        <table className="table">
          <thead><tr><th>{t('दिनांक')}</th><th>{t('आले')}</th><th>{t('गेले')}</th><th></th></tr></thead>
          <tbody>
            {history.data?.map((h) => (
              <tr key={h.id}><td>{fmtDay(h.date)}</td><td>{fmtTime(h.check_in_at)}</td><td>{fmtTime(h.check_out_at)}</td><td>{h.inside_geofence ? '' : '⚠️'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
