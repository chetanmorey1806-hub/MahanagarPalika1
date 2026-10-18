import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useT } from '../../i18n/index.jsx';
import { fmtDate, fmtDay, useFetch } from '../../utils.js';
import PhotoCapture from '../../components/PhotoCapture.jsx';
import VoiceInput from '../../components/VoiceInput.jsx';
import { WO_STATUS } from './WorkOrders.jsx';

export default function WorkOrderDetail() {
  const t = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { data: o, loading, error, reload } = useFetch(() => api.getCached(`/ops/work-orders/${id}`), [id]);
  const [shot, setShot] = useState(null);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  if (loading) return <p className="muted">{t('लोड होत आहे…')}</p>;
  if (error) return <div className="alert alert-error">{error.message}</div>;

  const mine = o.assigned_to === user.id;
  const step = o.status === 'assigned' ? 'start' : o.status === 'in_progress' ? 'complete' : null;
  const act = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await api.postOffline(`/ops/work-orders/${id}/${step}`, { photo: shot?.dataUrl, meta: shot?.meta, note }, `${o.order_no} ${step === 'start' ? t('सुरू') : t('पूर्ण')}`);
      setShot(null);
      if (res.queued) setMsg({ ok: true, text: t('📴 फोनमध्ये सेव्ह — नेटवर्क आल्यावर पाठवले जाईल') });
      else reload();
    } catch (x) { setMsg({ ok: false, text: x.message }); } finally { setBusy(false); }
  };
  const verify = async (action) => {
    try { await api.post(`/ops/work-orders/${id}/verify`, { action, note }); reload(); } catch (x) { setMsg({ ok: false, text: x.message }); }
  };

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => nav(-1)}>‹ {t('मागे')}</button>
      <div className="card">
        <h2>🛠️ {o.title}</h2>
        <p><span className={`badge ${WO_STATUS[o.status][1]}`}>{t(WO_STATUS[o.status][0])}</span> <small className="muted">{o.order_no}</small></p>
        <dl className="dl">
          <dt>{t('ठिकाण')}</dt><dd>{o.location || '—'}</dd>
          <dt>{t('अंतिम तारीख')}</dt><dd className={o.overdue ? 'text-danger' : ''}>{fmtDay(o.due_date)}</dd>
          <dt>{t('सूचना')}</dt><dd>{o.description || '—'}</dd>
          <dt>{t('आदेश देणारे')}</dt><dd>{o.assigned_by_name}</dd>
          <dt>{t('कर्मचारी')}</dt><dd>{o.assigned_name} {o.assigned_mobile && <a href={`tel:${o.assigned_mobile}`}>📞</a>}</dd>
          {o.completed_at && <><dt>{t('पूर्ण')}</dt><dd>{fmtDate(o.completed_at)}</dd></>}
          {o.completion_note && <><dt>{t('शेरा')}</dt><dd>{o.completion_note}</dd></>}
        </dl>
      </div>

      {mine && step && (
        <div className="card center-card">
          <h3>{step === 'start' ? t('▶ काम सुरू करा') : t('✔ काम पूर्ण करा')}</h3>
          {o.needs_photo ? <PhotoCapture big label={`${o.order_no} · ${step === 'start' ? 'BEFORE' : 'AFTER'}`} onCapture={setShot} /> : null}
          {step === 'complete' && <VoiceInput rows={2} value={note} onChange={setNote} placeholder={t('🎤 काय काम केले ते सांगा')} />}
          <button className="btn btn-success btn-xl btn-block" disabled={busy || (o.needs_photo && !shot)} onClick={act}>
            {busy ? t('पाठवत आहे…') : step === 'start' ? t('▶ काम सुरू') : t('✔ काम पूर्ण झाले')}
          </button>
        </div>
      )}

      {!mine && o.status === 'done' && (
        <div className="card">
          <h3 className="card-title">🔍 {t('काम तपासणी')}</h3>
          <textarea rows={2} placeholder={t('शेरा')} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="row-gap">
            <button className="btn btn-success" onClick={() => verify('verify')}>✔ {t('काम योग्य')}</button>
            <button className="btn btn-warn" onClick={() => verify('redo')}>🔁 {t('पुन्हा करा')}</button>
          </div>
        </div>
      )}
      {!mine && ['assigned', 'in_progress'].includes(o.status) && <button className="btn btn-light" onClick={() => confirm(t('आदेश रद्द करायचा?')) && verify('cancel')}>✖ {t('आदेश रद्द करा')}</button>}
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-error'}`}>{msg.text}</div>}

      {(o.before_photo || o.after_photo) && (
        <div className="grid-2">
          {o.before_photo && <figure className="card"><figcaption>Before</figcaption><img className="photo-preview" src={o.before_photo} alt="" /></figure>}
          {o.after_photo && <figure className="card"><figcaption>After</figcaption><img className="photo-preview" src={o.after_photo} alt="" /></figure>}
        </div>
      )}
    </div>
  );
}
