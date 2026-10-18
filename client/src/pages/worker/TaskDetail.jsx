// काम: Before फोटो → काम सुरू → After फोटो → काम पूर्ण
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { STATUS, fmtDate, timeLeft, useFetch } from '../../utils.js';
import PhotoCapture from '../../components/PhotoCapture.jsx';
import VoiceInput from '../../components/VoiceInput.jsx';

export default function TaskDetail() {
  const t = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const { data: g, loading, error, reload } = useFetch(() => api.getCached(`/grievances/${id}`), [id]);
  const [shot, setShot] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [offlineStarted, setOfflineStarted] = useState(false);

  if (loading) return <p className="muted">{t('लोड होत आहे…')}</p>;
  if (error) return <div className="alert alert-error">{error.message}</div>;

  const step = ['new', 'assigned'].includes(g.status) && !offlineStarted ? 'start'
    : offlineStarted && g.status !== 'resolved' && g.status !== 'closed' ? 'resolve' : g.status === 'in_progress' ? 'resolve' : 'done';
  const tl = timeLeft(g.sla_due_at);
  const mapUrl = g.lat ? `https://www.google.com/maps/dir/?api=1&destination=${g.lat},${g.lng}` : null;

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.postOffline(`/grievances/${id}/${step}`, { photo: shot.dataUrl, meta: shot.meta, note },
        `${g.ticket_no} ${step === 'start' ? t('काम सुरू') : t('काम पूर्ण')}`);
      setShot(null);
      if (res.queued) {
        setMsg({ ok: true, text: t('📴 फोटो फोनमध्ये सेव्ह केला — नेटवर्क आल्यावर आपोआप पाठवला जाईल.') });
        if (step === 'start') setOfflineStarted(true);
        else setTimeout(() => nav('/tasks'), 1500);
      } else if (step === 'resolve') {
        setMsg({ ok: true, text: t('🎉 काम पूर्ण नोंदवले! अधिकारी तपासणी करतील.') });
        setTimeout(() => nav('/tasks'), 1500);
      } else {
        reload();
      }
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => nav(-1)}>‹ {t('मागे')}</button>
      <div className="card">
        <div className="task-head">
          <span className="task-icon xl">{g.icon}</span>
          <div>
            <h2>{t(g.category)}</h2>
            <small className="muted">{g.ticket_no}</small>
          </div>
        </div>
        <p><span className={`badge ${STATUS[g.status].cls}`}>{t(STATUS[g.status].label)}</span>{' '}
          {step !== 'done' && <b className={tl.late ? 'text-danger' : ''}>⏱ {tl.text}</b>}</p>
        <p>📍 {g.address || '—'}</p>
        {g.description && <p>📝 {g.description}</p>}
        <p className="muted">{t('नागरिक:')} {g.citizen_name || '—'} {g.citizen_mobile && `· ${g.citizen_mobile}`} · {fmtDate(g.created_at)}</p>
        {mapUrl && <a className="btn btn-light btn-block" href={mapUrl} target="_blank" rel="noreferrer">{t('🧭 नकाशावर रस्ता दाखवा')}</a>}
        {g.complaint_photo && <img className="photo-preview" src={g.complaint_photo} alt={t('तक्रार फोटो')} />}
      </div>

      <div className="steps">
        <div className={`step ${g.before_photo ? 'done' : step === 'start' ? 'current' : ''}`}>① {t('काम सुरू करण्यापूर्वी फोटो')}</div>
        <div className={`step ${g.after_photo ? 'done' : step === 'resolve' ? 'current' : ''}`}>② {t('काम झाल्यानंतर फोटो')}</div>
      </div>

      {step !== 'done' && (
        <div className="card center-card">
          <h3>{step === 'start' ? t('📸 काम सुरू करण्यापूर्वीचा फोटो (Before)') : t('📸 काम पूर्ण झाल्याचा फोटो (After)')}</h3>
          <PhotoCapture big label={`${g.ticket_no} · ${step === 'start' ? 'BEFORE' : 'AFTER'}`} onCapture={setShot} />
          {step === 'resolve' && shot && <VoiceInput rows={2} placeholder={t('🎤 काय काम केले ते बोला (ऐच्छिक)')} value={note} onChange={setNote} />}
          {shot && (
            <button className="btn btn-success btn-xl btn-block" disabled={busy} onClick={submit}>
              {busy ? t('पाठवत आहे…') : step === 'start' ? t('▶ काम सुरू करा') : t('✔ काम पूर्ण झाले')}
            </button>
          )}
        </div>
      )}
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-error'}`}>{msg.text}</div>}

      {(g.before_photo || g.after_photo) && (
        <div className="grid-2">
          {g.before_photo && <figure className="card"><figcaption>Before</figcaption><img className="photo-preview" src={g.before_photo} alt="" /></figure>}
          {g.after_photo && <figure className="card"><figcaption>After</figcaption><img className="photo-preview" src={g.after_photo} alt="" /></figure>}
        </div>
      )}
    </div>
  );
}
