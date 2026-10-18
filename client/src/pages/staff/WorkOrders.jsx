// कामाचे आदेश — अधिकारी काम देतात, कर्मचारी फोटो पुराव्यासह पूर्ण करतात
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useT } from '../../i18n/index.jsx';
import { fmtDay, useFetch } from '../../utils.js';

export const WO_STATUS = { assigned: ['नवीन', 'b-new'], in_progress: ['काम सुरू', 'b-progress'], done: ['पूर्ण — तपासणी बाकी', 'b-assigned'], verified: ['✔ तपासले', 'b-resolved'], cancelled: ['रद्द', 'b-closed'] };
const plusDays = (n) => new Date(Date.now() + 5.5 * 3600e3 + n * 864e5).toISOString().slice(0, 10);

function NewOrder({ onDone }) {
  const t = useT();
  const staff = useFetch(() => api.get('/masters/users'));
  const [f, setF] = useState({ title: '', description: '', location: '', assigned_to: '', due_date: plusDays(1), needs_photo: true });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try { await api.post('/ops/work-orders', { ...f, assigned_to: +f.assigned_to }); onDone(); } catch (x) { setErr(x.message); }
  };
  return (
    <form className="card" onSubmit={submit}>
      <h3 className="card-title">{t('नवीन कामाचा आदेश')}</h3>
      <div className="grid-3">
        <label>{t('काम')}<input required value={f.title} onChange={set('title')} placeholder={t('उदा. नालेसफाई मोहीम')} /></label>
        <label>{t('ठिकाण')}<input value={f.location} onChange={set('location')} /></label>
        <label>{t('कर्मचारी')}
          <select required value={f.assigned_to} onChange={set('assigned_to')}>
            <option value="">{t('— निवडा —')}</option>
            {staff.data?.filter((u) => ['worker', 'clerk'].includes(u.role) && u.active).map((u) => <option key={u.id} value={u.id}>{u.name} — {t(u.designation)} ({t(u.ward_name) || t('मुख्यालय')})</option>)}
          </select>
        </label>
        <label>{t('अंतिम तारीख')}<input type="date" min={plusDays(0)} value={f.due_date} onChange={set('due_date')} /></label>
      </div>
      <label>{t('सूचना')}<textarea rows={2} value={f.description} onChange={set('description')} /></label>
      <label className="check"><input type="checkbox" checked={f.needs_photo} onChange={(e) => setF({ ...f, needs_photo: e.target.checked })} /> {t('Before / After फोटो पुरावा आवश्यक')}</label>
      {err && <div className="alert alert-error">{err}</div>}
      <button className="btn btn-primary" style={{ marginTop: 10 }}>📤 {t('आदेश द्या')}</button>
    </form>
  );
}

export default function WorkOrders() {
  const t = useT();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const isBoss = ['officer', 'admin'].includes(user.role);
  const [tab, setTab] = useState(isBoss ? 'given' : 'mine');
  const [done, setDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const status = params.get('status') || '';
  const { data, reload } = useFetch(() => (tab === 'given'
    ? api.get(`/ops/work-orders${status ? `?status=${status}` : ''}`)
    : api.getCached(`/ops/work-orders/my${done ? '?done=1' : ''}`)), [tab, done, status]);

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">🛠️ {t('कामाचे आदेश')}</h2>
        {isBoss && <button className="btn btn-primary" onClick={() => setAdding(!adding)}>{adding ? t('रद्द') : t('+ नवीन आदेश')}</button>}
      </div>
      {adding && <NewOrder onDone={() => { setAdding(false); setTab('given'); reload(); }} />}
      <div className="tabs">
        {isBoss && <button className={tab === 'given' ? 'active' : ''} onClick={() => setTab('given')}>📤 {t('मी दिलेले')}</button>}
        <button className={tab === 'mine' && !done ? 'active' : ''} onClick={() => { setTab('mine'); setDone(false); }}>⏳ {t('मला दिलेले')}</button>
        <button className={tab === 'mine' && done ? 'active' : ''} onClick={() => { setTab('mine'); setDone(true); }}>✅ {t('पूर्ण')}</button>
      </div>
      {data?.length === 0 && <div className="card empty">{t('कोणताही आदेश नाही')}</div>}
      {data?.map((o) => (
        <Link key={o.id} to={`/work-orders/${o.id}`} className={`card task-card ${o.overdue ? 'late' : ''}`}>
          <span className="task-icon">🛠️</span>
          <div>
            <b>{o.title}</b>
            <small>{o.location || '—'} · {t('अंतिम:')} {fmtDay(o.due_date)}{o.overdue ? ` · ⚠️ ${t('उशीर')}` : ''}</small>
            <small>{tab === 'given' ? `👷 ${o.assigned_name}` : `${t('आदेश:')} ${o.assigned_by_name}`} · <span className={`badge ${WO_STATUS[o.status][1]}`}>{t(WO_STATUS[o.status][0])}</span></small>
          </div>
          <span className="chev">›</span>
        </Link>
      ))}
    </div>
  );
}
