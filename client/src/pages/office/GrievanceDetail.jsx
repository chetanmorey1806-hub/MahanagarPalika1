import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { STATUS, fmtDate, timeLeft, useFetch } from '../../utils.js';
import Stars from '../../components/Stars.jsx';
import { useAuth } from '../../auth.jsx';
import { useT } from '../../i18n/index.jsx';

const ACTION = { created: '📝 नोंद', auto_assigned: '🤖 आपोआप नेमणूक', assigned: '👷 नेमणूक', started: '▶ काम सुरू', resolved: '✅ काम पूर्ण',
  close: '🔒 बंद', rated: '⭐ नागरिक रेटिंग', reopen: '🔁 पुन्हा उघडली', reject: '✖ नाकारली', escalated: '⬆ Escalation' };

function Photo({ title, src, meta }) {
  const t = useT();
  const m = meta ? JSON.parse(meta) : null;
  return (
    <figure className="card">
      <figcaption>{title}</figcaption>
      {src ? <a href={src} target="_blank" rel="noreferrer"><img className="photo-preview" src={src} alt={title} /></a> : <div className="empty">{t('फोटो नाही')}</div>}
      {m?.lat && <small className="muted">📍 {m.lat.toFixed(5)}, {m.lng.toFixed(5)} · {fmtDate(m.capturedAt)}</small>}
    </figure>
  );
}

export default function GrievanceDetail() {
  const t = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const canManage = ['officer', 'admin'].includes(user.role);
  const { data: g, loading, error, reload } = useFetch(() => api.get(`/grievances/${id}`), [id]);
  const workers = useFetch(() => (g ? api.get('/masters/users?role=worker') : null), [g?.id]);
  const [workerId, setWorkerId] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');

  if (loading && !g) return <p className="muted">{t('लोड होत आहे…')}</p>;
  if (error) return <div className="alert alert-error">{error.message}</div>;

  const run = async (fn) => {
    setMsg('');
    try { await fn(); setNote(''); reload(); } catch (e) { setMsg(e.message); }
  };
  const open = ['new', 'assigned', 'in_progress'].includes(g.status);
  const tl = timeLeft(g.sla_due_at);
  const eligible = (workers.data || []).filter((w) => w.department_id === g.department_id && w.ward_id === g.ward_id && w.active);

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => nav(-1)}>{t('‹ मागे')}</button>
      <div className="page-head">
        <h2 className="page-title">{g.icon} {t(g.category)} <small className="muted">{g.ticket_no}</small></h2>
        <div>
          <span className={`badge ${STATUS[g.status].cls}`}>{t(STATUS[g.status].label)}</span>
          {g.escalation_level > 0 && <span className="badge b-rejected">{t('⬆ Escalation स्तर {n}', { n: g.escalation_level })}</span>}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <dl className="dl">
            <dt>{t('विभाग')}</dt><dd>{t(g.department_name)}</dd>
            <dt>{t('प्रभाग')}</dt><dd>{t(g.ward_name)}</dd>
            <dt>{t('पत्ता')}</dt><dd>{g.address || '—'} {g.lat && <a href={`https://www.google.com/maps?q=${g.lat},${g.lng}`} target="_blank" rel="noreferrer">🗺️</a>}</dd>
            <dt>{t('वर्णन')}</dt><dd>{g.description || '—'}</dd>
            <dt>{t('नागरिक')}</dt><dd>{g.citizen_name || '—'} {g.citizen_mobile && <a href={`tel:${g.citizen_mobile}`}>📞 {g.citizen_mobile}</a>}</dd>
            <dt>{t('स्रोत')}</dt><dd>{t(g.source)}</dd>
            <dt>{t('नोंद')}</dt><dd>{fmtDate(g.created_at)}</dd>
            <dt>{t('SLA मुदत')}</dt><dd className={open && tl.late ? 'text-danger' : ''}>{fmtDate(g.sla_due_at)} {open && `(${tl.text})`}</dd>
            <dt>{t('अधिकारी')}</dt><dd>{g.officer_name || '—'}</dd>
            <dt>{t('कर्मचारी')}</dt><dd>{g.assigned_name || <span className="text-danger">{t('नेमणूक नाही')}</span>}</dd>
            {g.citizen_rating && <><dt>{t('नागरिक रेटिंग')}</dt><dd><Stars value={g.citizen_rating} size={16} /> {g.citizen_feedback}</dd></>}
            {g.reopen_count > 0 && <><dt>{t('पुन्हा उघडली')}</dt><dd className="text-danger">{t('{n} वेळा', { n: g.reopen_count })}</dd></>}
          </dl>
        </div>

        <div className="card">
          {!canManage && <p className="muted">{t('ℹ️ नेमणूक व तपासणी संबंधित अधिकारी करतात. नागरिकाला स्थिती सांगण्यासाठी तिकीट:')} <b>{g.ticket_no}</b></p>}
          {canManage && open && (
            <>
              <h3 className="card-title">{t('👷 कर्मचारी नेमणूक')}</h3>
              <div className="row-gap">
                <select value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
                  <option value="">{t('— कर्मचारी निवडा —')}</option>
                  {eligible.map((w) => <option key={w.id} value={w.id}>{w.name} ({t(w.designation)})</option>)}
                </select>
                <button className="btn btn-primary" disabled={!workerId} onClick={() => run(() => api.post(`/grievances/${id}/assign`, { worker_id: Number(workerId) }))}>{t('नेमणूक करा')}</button>
              </div>
            </>
          )}
          {canManage && g.status === 'resolved' && <h3 className="card-title">{t('🔍 काम तपासणी')}</h3>}
          {canManage && g.status !== 'closed' && g.status !== 'rejected' && (
            <>
              <textarea rows={2} placeholder={t('शेरा')} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="row-gap">
                {g.status === 'resolved' && <button className="btn btn-success" onClick={() => run(() => api.post(`/grievances/${id}/review`, { action: 'close', note }))}>{t('✔ मान्य करून बंद करा')}</button>}
                {g.status === 'resolved' && <button className="btn btn-warn" onClick={() => run(() => api.post(`/grievances/${id}/review`, { action: 'reopen', note }))}>{t('🔁 पुन्हा करायला सांगा')}</button>}
                {open && <button className="btn btn-danger" onClick={() => note ? run(() => api.post(`/grievances/${id}/review`, { action: 'reject', note })) : setMsg(t('नाकारण्याचे कारण शेऱ्यात लिहा'))}>{t('✖ तक्रार नाकारा')}</button>}
              </div>
            </>
          )}
          {msg && <div className="alert alert-error">{msg}</div>}

          <h3 className="card-title">{t('🕑 इतिहास')}</h3>
          <ul className="timeline">
            {g.logs.map((l) => (
              <li key={l.id}><b>{ACTION[l.action] ? t(ACTION[l.action]) : l.action}</b> {l.note && `— ${t(l.note)}`}<br /><small className="muted">{l.user_name || t('सिस्टीम')} · {fmtDate(l.created_at)}</small></li>
            ))}
          </ul>
        </div>
      </div>

      <h3 className="section-title">{t('📸 फोटो पुरावा')}</h3>
      <div className="grid-3">
        <Photo title={t('नागरिकाचा फोटो')} src={g.complaint_photo} />
        <Photo title={t('Before (काम सुरू करण्यापूर्वी)')} src={g.before_photo} meta={g.before_meta} />
        <Photo title={t('After (काम झाल्यानंतर)')} src={g.after_photo} meta={g.after_meta} />
      </div>
    </div>
  );
}
