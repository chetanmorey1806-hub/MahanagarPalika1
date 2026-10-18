import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { fmtDate, useFetch } from '../../utils.js';
import { tr, useT } from '../../i18n/index.jsx';

const hrs = (h) => (h >= 24 ? tr('{d} दिवस {h} तास', { d: Math.floor(h / 24), h: h % 24 }) : tr('{h} तास', { h }));

export default function EFileDetail() {
  const t = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { data: f, loading, error, reload } = useFetch(() => api.get(`/efiles/${id}`), [id]);
  const officers = useFetch(() => api.get('/masters/officers'));
  const [to, setTo] = useState('');
  const [remark, setRemark] = useState('');
  const [err, setErr] = useState('');

  if (loading && !f) return <p className="muted">{t('लोड होत आहे…')}</p>;
  if (error) return <div className="alert alert-error">{error.message}</div>;
  const mine = f.current_holder === user.id || user.role === 'admin';

  const act = async (fn) => {
    setErr('');
    try { await fn(); setRemark(''); setTo(''); reload(); } catch (e) { setErr(e.message); }
  };

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => nav(-1)}>{t('‹ मागे')}</button>
      <h2 className="page-title">{f.priority === 'urgent' && '🔴 '}{f.subject}</h2>
      <p className="muted">{f.file_no} · {t(f.department_name)} · {t('तयार:')} {f.creator_name}, {fmtDate(f.created_at)}</p>

      <div className="grid-2">
        <div className="card">
          <h3 className="card-title">{t('📍 फाईलचा प्रवास')}</h3>
          <ul className="timeline">
            {f.movements.map((m) => (
              <li key={m.id}>
                <b>{m.action === 'created' ? t('📝 तयार') : m.action === 'closed' ? t('🔒 निकाली') : `➡ ${m.to_name}`}</b>
                {m.to_designation && m.action === 'forwarded' && <small className="muted"> ({t(m.to_designation)})</small>}
                {m.remark && <div>“{t(m.remark)}”</div>}
                <small className="muted">{m.from_name && `${t('{name} कडून', { name: m.from_name })} · `}{fmtDate(m.moved_at)}{m.action !== 'closed' && ` · ${t('{time} ठेवली', { time: hrs(m.hours_held) })}`}</small>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3 className="card-title">{t('सध्या:')} {f.status === 'open' ? `${f.holder_name} (${t('{n} दिवसांपासून', { n: f.days_pending })})` : t('निकाली')}</h3>
          {f.status === 'open' && mine ? (
            <>
              <label>{t('पुढे पाठवा')}
                <select value={to} onChange={(e) => setTo(e.target.value)}>
                  <option value="">{t('— अधिकारी निवडा —')}</option>
                  {officers.data?.filter((o) => o.id !== user.id).map((o) => (
                    <option key={o.id} value={o.id}>{o.name} — {t(o.designation)}{o.department_name ? ` (${t(o.department_name)})` : ''}</option>
                  ))}
                </select>
              </label>
              <textarea rows={3} placeholder={t('टिप्पणी / शेरा')} value={remark} onChange={(e) => setRemark(e.target.value)} />
              {err && <div className="alert alert-error">{err}</div>}
              <div className="row-gap">
                <button className="btn btn-primary" disabled={!to} onClick={() => act(() => api.post(`/efiles/${id}/forward`, { to_user: Number(to), remark }))}>{t('➡ पाठवा')}</button>
                <button className="btn btn-success" onClick={() => act(() => api.post(`/efiles/${id}/close`, { remark }))}>{t('🔒 निकाली काढा')}</button>
              </div>
            </>
          ) : f.status === 'open' && <p className="muted">{t('ही फाईल सध्या तुमच्याकडे नाही.')}</p>}
        </div>
      </div>
    </div>
  );
}
