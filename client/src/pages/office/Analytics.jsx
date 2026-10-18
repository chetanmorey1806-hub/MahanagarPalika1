// Integrated Command & Control Dashboard — Live MIS
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useEffect } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { currentLocale, useT } from '../../i18n/index.jsx';
import { fmtMoney, num, useFetch } from '../../utils.js';

function Stat({ icon, label, value, sub, tone, to }) {
  const t = useT();
  const body = (
    <div className={`stat ${tone || ''}`}>
      <span className="stat-icon">{icon}</span>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{t(label)}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="stat-link">{body}</Link> : body;
}

// विभाग / प्रभागाची आकडेवारी (KPI + charts) — Officer डॅशबोर्डमध्ये वापरली जाते
export default function Analytics() {
  const t = useT();
  const { user } = useAuth();
  const { data: d, loading, error, reload } = useFetch(() => api.get('/dashboard'));
  useEffect(() => { const i = setInterval(reload, 60000); return () => clearInterval(i); }, [reload]);

  if (loading && !d) return <p className="muted">{t('लोड होत आहे…')}</p>;
  if (error) return <div className="alert alert-error">{error.message}</div>;
  const g = d.grievance;
  const shortWard = d.byWard.map((w) => ({ ...w, ward: t(w.ward).split(' - ')[1] || t(w.ward) }));
  const trend = d.trend.map((x) => ({ ...x, day: new Date(x.day).toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short' }) }));

  return (
    <div>
      <div className="stats">
        <Stat icon="📢" label="प्रलंबित तक्रारी" value={num(g.open)} sub={t('आज नवीन: {n}', { n: num(g.new_today) })} to="/grievances?status=open" />
        <Stat icon="⏰" label="SLA ओलांडलेल्या" value={num(g.overdue)} sub={t('Escalated: {n}', { n: num(g.escalated) })} tone="danger" to="/grievances?overdue=1" />
        <Stat icon="✅" label="आज निकाली" value={num(g.resolved_today)} sub={t('SLA पालन: {n}%', { n: g.sla_compliance ?? 0 })} tone="ok" />
        <Stat icon="🧑‍🤝‍🧑" label="आज हजर कर्मचारी" value={`${num(d.attendance.present)} / ${num(d.attendance.total)}`}
          sub={d.attendance.outside_fence ? t('⚠️ {n} वॉर्डबाहेर', { n: d.attendance.outside_fence }) : t('सर्व वॉर्डमध्ये')} to="/attendance-report" />
        <Stat icon="🚛" label="आज उचललेला कचरा" value={t('{n} टन', { n: d.waste.today })} sub={t('या महिन्यात: {n} टन', { n: num(d.waste.month) })} />
        <Stat icon="💰" label="आज कर संकलन" value={fmtMoney(d.tax.today)} sub={t('या महिन्यात: {n}', { n: fmtMoney(d.tax.month) })} tone="ok" to="/tax" />
        <Stat icon="🛻" label="वाहने चालू" value={`${num(d.vehicles.running)} / ${num(d.vehicles.total)}`} sub={t('दुरुस्ती: {n}', { n: num(d.vehicles.maintenance) })} to="/fleet" />
        <Stat icon="✍️" label="मंजुरीसाठी अर्ज" value={num(d.pendingApprovals)} sub={t('माझ्याकडे फाईल्स: {n}', { n: num(d.filesInbox.c) })} to="/approvals" />
        <Stat icon="🚨" label="आजचे वाहन अलर्ट" value={num(d.alerts)} sub={t('मार्गाबाहेर / गल्ली चुकवली')} tone={d.alerts ? 'danger' : 'ok'} to="/fleet" />
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 className="card-title">{t('प्रभागनिहाय तक्रारी')}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={shortWard}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ward" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Legend />
              <Bar dataKey="open" name={t('प्रलंबित')} fill="#f0a020" radius={[4, 4, 0, 0]} />
              <Bar dataKey="overdue" name={t('उशीर')} fill="#d64545" radius={[4, 4, 0, 0]} />
              <Bar dataKey="resolved" name={t('निकाली')} fill="#2e9e5b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 className="card-title">{t('गेल्या १४ दिवसांचा कल')}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="received" name={t('प्राप्त')} stroke="#0b5394" strokeWidth={2} />
              <Line type="monotone" dataKey="resolved" name={t('निकाली')} stroke="#2e9e5b" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 className="card-title">{t('प्रकारानुसार तक्रारी')}</h3>
          <table className="table">
            <thead><tr><th>{t('प्रकार')}</th><th>{t('एकूण')}</th><th>{t('प्रलंबित')}</th></tr></thead>
            <tbody>{d.byCategory.map((c) => <tr key={c.category}><td>{c.icon} {t(c.category)}</td><td>{c.total}</td><td>{c.open}</td></tr>)}</tbody>
          </table>
        </div>
        {d.filesStuck.length > 0 && (
          <div className="card">
            <h3 className="card-title">📁 {t('सर्वात जास्त काळ अडकलेल्या फाईल्स')}</h3>
            <table className="table">
              <thead><tr><th>{t('फाईल')}</th><th>{t('कोणाकडे')}</th><th>{t('दिवस')}</th></tr></thead>
              <tbody>{d.filesStuck.map((f) => (
                <tr key={f.id}><td><Link to={`/efiles/${f.id}`}>{f.subject}</Link><br /><small className="muted">{f.file_no}</small></td>
                  <td>{f.holder_name}</td><td className={f.days > 7 ? 'text-danger' : ''}><b>{f.days}</b></td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
