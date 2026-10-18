// अर्थसंकल्प विरुद्ध खर्च — विभागनिहाय; खर्च नोंद
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useT } from '../../i18n/index.jsx';
import { fmtDay, fmtMoney, useFetch } from '../../utils.js';
import ExportButtons from '../../components/Export.jsx';

export default function Budget() {
  const t = useT();
  const { user } = useAuth();
  const { data: d, reload } = useFetch(() => api.get('/budget'));
  const masters = useFetch(() => api.get('/masters'));
  const [f, setF] = useState({ department_id: '', head: '', amount: '', description: '', spent_at: new Date().toISOString().slice(0, 10) });
  const [msg, setMsg] = useState('');
  if (!d) return <p className="muted">{t('लोड होत आहे…')}</p>;
  const chart = d.rows.map((r) => ({ name: t(r.name), budget: Math.round(r.budget / 1e5), spent: Math.round(r.spent / 1e5) }));
  const save = async (e) => {
    e.preventDefault();
    try { await api.post('/budget/expenditure', { ...f, amount: +f.amount, department_id: +f.department_id || undefined }); setMsg(t('✔ खर्च नोंदवला')); setF({ ...f, amount: '', head: '', description: '' }); reload(); } catch (x) { setMsg(x.message); }
  };

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">💹 {t('अर्थसंकल्प व खर्च')} <small className="muted">{d.fy}</small></h2>
        <ExportButtons rows={d.rows} filename="budget" title="अर्थसंकल्प विरुद्ध खर्च" columns={[['name', 'विभाग'], ['budget', 'अर्थसंकल्प'], ['spent', 'खर्च'], ['pct', 'खर्च %']]} />
      </div>
      <div className="stats">
        <div className="stat"><span className="stat-icon">📒</span><div><div className="stat-value">{fmtMoney(d.total.budget)}</div><div className="stat-label">{t('एकूण अर्थसंकल्प')}</div></div></div>
        <div className="stat danger"><span className="stat-icon">💸</span><div><div className="stat-value">{fmtMoney(d.total.spent)}</div><div className="stat-label">{t('प्रत्यक्ष खर्च')}</div></div></div>
        <div className="stat ok"><span className="stat-icon">🏦</span><div><div className="stat-value">{fmtMoney(d.total.budget - d.total.spent)}</div><div className="stat-label">{t('शिल्लक')}</div></div></div>
      </div>
      <div className="card">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" fontSize={11} interval={0} angle={-15} textAnchor="end" height={60} />
            <YAxis fontSize={11} />
            <Tooltip formatter={(v) => `₹${v} L`} />
            <Legend />
            <Bar dataKey="budget" name={t('अर्थसंकल्प (लाख ₹)')} fill="#f4b183" radius={[4, 4, 0, 0]} />
            <Bar dataKey="spent" name={t('खर्च (लाख ₹)')} fill="#d9480f" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        {d.rows.map((r) => (
          <div key={r.id} className="progress-row">
            <span>{r.icon} {t(r.name)}</span>
            <div className="progress"><div style={{ width: `${Math.min(100, r.pct)}%`, background: r.pct > 90 ? '#d9403f' : undefined }} /></div>
            <small>{r.pct}% · {fmtMoney(r.spent)}</small>
          </div>
        ))}
      </div>
      <div className="grid-2">
        <form className="card" onSubmit={save}>
          <h3 className="card-title">➕ {t('खर्च नोंद')}</h3>
          {user.role === 'admin' && (
            <label>{t('विभाग')}<select required value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })}>
              <option value="">—</option>{masters.data?.departments.map((x) => <option key={x.id} value={x.id}>{t(x.name)}</option>)}</select></label>
          )}
          <label>{t('खर्चाचा प्रकार')}<input required value={f.head} onChange={(e) => setF({ ...f, head: e.target.value })} placeholder={t('उदा. पाईपलाईन दुरुस्ती')} /></label>
          <div className="grid-2">
            <label>{t('रक्कम (₹)')}<input required type="number" min={1} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
            <label>{t('दिनांक')}<input type="date" value={f.spent_at} onChange={(e) => setF({ ...f, spent_at: e.target.value })} /></label>
          </div>
          <label>{t('तपशील')}<input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          {msg && <div className="alert alert-ok">{msg}</div>}
          <button className="btn btn-primary">{t('जतन करा')}</button>
        </form>
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>{t('दिनांक')}</th><th>{t('विभाग')}</th><th>{t('प्रकार')}</th><th>{t('रक्कम')}</th></tr></thead>
            <tbody>{d.recent.slice(0, 15).map((x) => <tr key={x.id}><td>{fmtDay(x.spent_at)}</td><td>{t(x.department_name)}</td><td>{t(x.head)}</td><td>{fmtMoney(x.amount)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
