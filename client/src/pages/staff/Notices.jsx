// परिपत्रके / सूचना फलक — वाचल्याची नोंद; अधिकारी नवीन परिपत्रक काढू शकतात
import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useT } from '../../i18n/index.jsx';
import { ROLE, fmtDate, useFetch } from '../../utils.js';

function NewNotice({ onDone }) {
  const t = useT();
  const { user } = useAuth();
  const masters = useFetch(() => api.get('/masters'));
  const [f, setF] = useState({ title: '', body: '', priority: 'normal', audience_role: '', department_id: '', ward_id: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = await api.post('/hr/notices', { ...f, department_id: f.department_id ? +f.department_id : null, ward_id: f.ward_id ? +f.ward_id : null });
      onDone(r.recipients);
    } catch (x) { setErr(x.message); }
  };
  return (
    <form className="card" onSubmit={submit}>
      <h3 className="card-title">{t('नवीन परिपत्रक')}</h3>
      <label>{t('विषय')}<input required value={f.title} onChange={set('title')} /></label>
      <label>{t('मजकूर')}<textarea required rows={4} value={f.body} onChange={set('body')} /></label>
      <div className="grid-3">
        <label>{t('कोणासाठी')}
          <select value={f.audience_role} onChange={set('audience_role')}>
            <option value="">{t('सर्व कर्मचारी')}</option>
            {['worker', 'clerk', 'officer'].map((r) => <option key={r} value={r}>{t(ROLE[r])}</option>)}
          </select>
        </label>
        {user.role === 'admin' && (
          <>
            <label>{t('विभाग')}<select value={f.department_id} onChange={set('department_id')}><option value="">{t('सर्व')}</option>{masters.data?.departments.map((d) => <option key={d.id} value={d.id}>{t(d.name)}</option>)}</select></label>
            <label>{t('प्रभाग')}<select value={f.ward_id} onChange={set('ward_id')}><option value="">{t('सर्व')}</option>{masters.data?.wards.map((w) => <option key={w.id} value={w.id}>{t(w.name)}</option>)}</select></label>
          </>
        )}
        <label>{t('महत्त्व')}<select value={f.priority} onChange={set('priority')}><option value="normal">{t('साधारण')}</option><option value="urgent">🔴 {t('तातडीचे')}</option></select></label>
      </div>
      {user.role !== 'admin' && <p className="muted small">{user.ward_name ? t('हे परिपत्रक तुमच्या विभाग व {ward} मधील कर्मचाऱ्यांना App + WhatsApp वर जाईल.', { ward: t(user.ward_name) }) : t('हे परिपत्रक तुमच्या विभाग मधील कर्मचाऱ्यांना App + WhatsApp वर जाईल.')}</p>}
      {err && <div className="alert alert-error">{err}</div>}
      <button className="btn btn-primary">📢 {t('प्रसिद्ध करा')}</button>
    </form>
  );
}

export default function Notices() {
  const t = useT();
  const { user } = useAuth();
  const { data, reload } = useFetch(() => api.getCached('/hr/notices'));
  const [adding, setAdding] = useState(false);
  const [readers, setReaders] = useState({});
  const [msg, setMsg] = useState('');
  const canPost = ['officer', 'admin'].includes(user.role);

  const markRead = async (n) => { await api.post(`/hr/notices/${n.id}/read`); reload(); };
  const showReaders = async (n) => setReaders({ ...readers, [n.id]: readers[n.id] ? null : await api.get(`/hr/notices/${n.id}/readers`) });

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">📢 {t('परिपत्रके')}</h2>
        {canPost && <button className="btn btn-primary" onClick={() => setAdding(!adding)}>{adding ? t('रद्द') : t('+ नवीन परिपत्रक')}</button>}
      </div>
      {msg && <div className="alert alert-ok">{msg}</div>}
      {adding && <NewNotice onDone={(n) => { setAdding(false); setMsg(t('✔ {n} कर्मचाऱ्यांना पाठवले', { n })); reload(); }} />}
      <div className="list">
        {data?.length === 0 && <div className="card empty">{t('परिपत्रक नाही')}</div>}
        {data?.map((n) => (
          <div key={n.id} className={`card notice ${n.priority === 'urgent' ? 'urgent' : ''} ${!n.read_at && n.created_by !== user.id ? 'unread' : ''}`}>
            <div className="page-head">
              <strong>{n.priority === 'urgent' && '🔴 '}{n.title}</strong>
              <small className="muted">{fmtDate(n.created_at)}</small>
            </div>
            <p className="notice-body">{n.body}</p>
            <small className="muted">— {n.created_by_name}, {t(n.created_by_designation)}{n.department_name ? ` · ${t(n.department_name)}` : ''}{n.ward_name ? ` · ${t(n.ward_name)}` : ''}</small>
            <div className="row-gap" style={{ marginTop: 8, marginBottom: 0 }}>
              {n.created_by !== user.id && (n.read_at ? <span className="badge b-resolved">✔ {t('वाचले')}</span>
                : <button className="btn btn-sm btn-success" onClick={() => markRead(n)}>✔ {t('वाचले — समजले')}</button>)}
              {canPost && n.created_by === user.id && <button className="btn btn-sm btn-light" onClick={() => showReaders(n)}>👁️ {t('{n} जणांनी वाचले', { n: n.read_count })}</button>}
            </div>
            {readers[n.id] && <small className="muted">{readers[n.id].map((x) => x.name).join(', ') || t('अजून कोणी वाचले नाही')}</small>}
          </div>
        ))}
      </div>
    </div>
  );
}
