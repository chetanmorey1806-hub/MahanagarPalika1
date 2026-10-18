// आयुक्त / उपायुक्त — शहराचे संपूर्ण चित्र एका नजरेत (Bird's Eye View)
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, Tooltip as MapTip } from 'react-leaflet';
import { AlertTriangle, Siren, RefreshCw } from 'lucide-react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { useLive } from '../../live.js';
import { fmtDate, fmtMoney, num, useFetch } from '../../utils.js';
import Kpi from '../../components/Kpi.jsx';
import ExportButtons from '../../components/Export.jsx';
import InboxPanel from '../../components/InboxPanel.jsx';

const lakh = (n) => `₹${(n / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 1 })} L`;
const crore = (n) => (n >= 1e7 ? `₹${(n / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr` : lakh(n));

function WardPanel({ id, onClose }) {
  const t = useT();
  const { data: d } = useFetch(() => api.get(`/dashboard/ward/${id}`), [id]);
  if (!d) return <div className="card ward-panel"><p className="muted">{t('लोड होत आहे…')}</p></div>;
  return (
    <div className="card ward-panel">
      <div className="page-head"><h3 className="card-title" style={{ margin: 0 }}>📍 {t(d.ward.name)}</h3><button className="btn btn-sm btn-ghost" onClick={onClose}>✕</button></div>
      <div className="mini-kpis">
        <div><b>{d.grievance.open || 0}</b><small>{t('प्रलंबित')}</small></div>
        <div className="bad"><b>{d.grievance.overdue || 0}</b><small>{t('उशीर')}</small></div>
        <div className="good"><b>{d.grievance.resolved || 0}</b><small>{t('निकाली')}</small></div>
        <div><b>{d.staff.present || 0}/{d.staff.total || 0}</b><small>{t('हजर')}</small></div>
      </div>
      <p className="muted small">{t('कर संकलन (वर्ष)')}: <b>{fmtMoney(d.tax)}</b></p>
      {d.top.length > 0 && <p className="small">{d.top.map((c) => `${c.icon} ${t(c.name)} (${c.n})`).join(' · ')}</p>}
      {d.officers.map((o) => <p key={o.mobile} className="small">👤 {o.name} — {t(o.designation)} <a href={`tel:${o.mobile}`}>📞</a></p>)}
      <Link className="btn btn-sm btn-primary" to={`/grievances?ward_id=${id}&status=open`}>{t('प्रभागाच्या तक्रारी पहा')}</Link>
    </div>
  );
}

export default function AdminDashboard() {
  const t = useT();
  const { data: d, loading, error, reload } = useFetch(() => api.get('/dashboard/admin'));
  const [ward, setWard] = useState(null);
  const [pulse, setPulse] = useState(false);
  const timer = useRef();
  // नवीन तक्रार / अलर्ट / आपत्कालीन / हजेरी आल्यावर काही सेकंदांत आपोआप अपडेट
  const live = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { reload(); setPulse(true); setTimeout(() => setPulse(false), 1500); }, 1500);
  }, [reload]);
  useLive(['grievance', 'emergency', 'alert', 'attendance'], live);
  useEffect(() => { const i = setInterval(reload, 120000); return () => clearInterval(i); }, [reload]);

  if (loading && !d) return <p className="muted">{t('लोड होत आहे…')}</p>;
  if (error) return <div className="alert alert-error">{error.message}</div>;
  const g = d.grievance;
  const totalToday = d.revenue.property.today + d.revenue.water.today;
  const totalYtd = d.revenue.property.ytd + d.revenue.water.ytd;
  const staffPct = d.staff.total ? Math.round((100 * d.staff.present) / d.staff.total) : 0;
  const trend = d.trend.map((x) => ({ ...x, day: new Date(x.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) }));
  const budget = d.budget.map((b) => ({ name: t(b.name).replace(/ विभाग$/, ''), budget: Math.round(b.budget / 1e5), spent: Math.round(b.spent / 1e5), pct: b.pct }));
  const center = d.wards.length ? [d.wards.reduce((s, w) => s + w.lat, 0) / d.wards.length, d.wards.reduce((s, w) => s + w.lng, 0) / d.wards.length] : [20.932, 77.752];

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">🏙️ {t('शहर नियंत्रण कक्ष (Command Center)')}</h2>
        <div className="row-gap" style={{ marginBottom: 0 }}>
          <span className={`live-dot ${pulse ? 'pulse' : ''}`}>● {t('Live — नवीन माहिती आपोआप दिसते')}</span>
          <button className="btn btn-sm btn-light" onClick={reload}><RefreshCw size={14} /></button>
          <Link to="/reports" className="btn btn-sm btn-light">📄 {t('आजचा PDF अहवाल')}</Link>
        </div>
      </div>

      {/* A. KPI पट्टी */}
      <div className="stats kpi-strip">
        <Kpi icon="💰" label="आजचे कर संकलन" value={fmtMoney(totalToday)} tone="ok" to="/tax"
          sub={`${t('मालमत्ता')} ${fmtMoney(d.revenue.property.today)} · ${t('पाणी')} ${fmtMoney(d.revenue.water.today)}`} />
        <Kpi icon="📈" label="या वर्षीचे संकलन (YTD)" value={crore(totalYtd)} to="/tax" progress={d.demand ? (100 * totalYtd) / d.demand : 0}
          sub={`${t('मागणीच्या')} ${d.demand ? Math.round((100 * totalYtd) / d.demand) : 0}% · ${d.fy}`} />
        <Kpi icon="✅" label="तक्रार निराकरण दर" value={`${g.rate}%`} to="/grievances" progress={g.rate} tone={g.rate >= 80 ? 'ok' : ''}
          sub={`${num(g.total)} ${t('आल्या')} · ${num(g.resolved)} ${t('सुटल्या')} · ${num(g.pending)} ${t('प्रलंबित')}`} />
        <Kpi icon="📁" label="प्रलंबित ई-फाईल्स" value={num(d.files.pending)} to="/efiles" tone={d.files.stuck ? 'danger' : ''}
          sub={`⚠️ ${num(d.files.stuck || 0)} ${t('फाईल्स ७ दिवसांपेक्षा जास्त अडकल्या')}`} />
        <Kpi icon="⚠️" label="कर थकबाकीदार" value={num(d.defaulters.count)} to="/defaulters" tone="danger" sub={`${t('थकबाकी')} ${crore(d.defaulters.due)}`} />
        <Kpi icon="🧑‍🤝‍🧑" label="आज ऑन-ड्युटी कर्मचारी" value={`${num(d.staff.on_duty)} / ${num(d.staff.total)}`} to="/roster" progress={staffPct}
          sub={`${t('हजेरी')} ${staffPct}% · 🏖️ ${num(d.staff.on_leave)} ${t('रजेवर')}`} />
      </div>

      {/* C. तातडीचे अलर्ट */}
      <div className="grid-2">
        <div className="card critical-card">
          <div className="page-head"><h3 className="card-title" style={{ margin: 0 }}><AlertTriangle size={18} color="#d9403f" /> {t('SLA भंग — तातडीच्या तक्रारी')}</h3>
            <Link to="/grievances?overdue=1" className="btn btn-sm btn-light">{t('सर्व पहा')}</Link></div>
          {d.slaBreaches.length === 0 && <p className="muted">🎉 {t('एकही तातडीची तक्रार उशिरा नाही')}</p>}
          {d.slaBreaches.map((x) => (
            <Link key={x.id} to={`/grievances/${x.id}`} className="crit-row">
              <span className="crit-icon">{x.icon}</span>
              <span className="crit-main"><b>{t(x.category)}</b> {x.priority === 'high' && <span className="badge b-rejected">{t('तातडीचे')}</span>}
                <small>{x.ticket_no} · {t(x.ward_name)} · {x.assigned_name || t('नेमणूक नाही')}</small></span>
              <span className="crit-late">{t('{n} तास उशीर', { n: x.hours_late })}{x.escalation_level > 0 && <small>⬆ L{x.escalation_level}</small>}</span>
            </Link>
          ))}
        </div>
        <div className="card critical-card emergency">
          <div className="page-head"><h3 className="card-title" style={{ margin: 0 }}><Siren size={18} color="#d9403f" /> {t('आपत्कालीन अलर्ट — लाईव्ह')}</h3>
            <Link to="/emergencies" className="btn btn-sm btn-danger">{t('+ घटना कळवा')}</Link></div>
          {d.emergencies.length === 0 && <p className="muted">✅ {t('सध्या कोणतीही आपत्कालीन घटना नाही')}</p>}
          {d.emergencies.map((e) => (
            <Link key={e.id} to={`/emergencies?id=${e.id}`} className={`crit-row sev-${e.severity}`}>
              <span className="crit-icon">{e.icon}</span>
              <span className="crit-main"><b>{t(e.title)}</b><small>{t(e.type_name)} · {t(e.location || '')} · {fmtDate(e.created_at)}</small></span>
              <span className={`badge ${e.severity === 'critical' ? 'b-rejected' : 'b-new'}`}>{t(e.severity === 'critical' ? 'अतिगंभीर' : e.severity === 'high' ? 'गंभीर' : 'मध्यम')}</span>
            </Link>
          ))}
        </div>
      </div>

      <InboxPanel showAttendance={false} />

      {/* B. GIS नकाशा */}
      <div className="card map-card gis-card">
        <div className="gis-head">
          <h3 className="card-title" style={{ margin: 0 }}>🗺️ {t('शहराचा GIS नकाशा')}</h3>
          <span className="legend"><i className="dot red" /> {t('प्रलंबित तक्रार')} <i className="dot green" /> {t('सोडवलेली (३० दिवस)')} <i className="dot ring" /> {t('प्रभाग — क्लिक करा')}</span>
        </div>
        <div className="gis-body">
          <MapContainer center={center} zoom={12} style={{ height: 470, flex: 1 }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
            {d.wards.map((w) => (
              <Circle key={w.id} center={[w.lat, w.lng]} radius={w.radius_m * 0.75} eventHandlers={{ click: () => setWard(w.id) }}
                pathOptions={{ color: ward === w.id ? '#d9480f' : '#5c1608', weight: ward === w.id ? 3 : 1.5, fillOpacity: ward === w.id ? 0.12 : 0.04, dashArray: '6 6' }}>
                <MapTip sticky>{t(w.name)} — {w.open || 0} {t('प्रलंबित')}</MapTip>
              </Circle>
            ))}
            {d.points.map((p) => {
              const open = !['resolved', 'closed'].includes(p.status);
              return (
                <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={open ? (p.priority === 'high' ? 7 : 5.5) : 4.5}
                  pathOptions={{ color: open ? '#d9403f' : '#12a150', fillColor: open ? '#f03e3e' : '#2f9e44', fillOpacity: 0.85, weight: 1 }}>
                  <Popup>{p.icon} <b>{t(p.category)}</b><br />{p.ticket_no}<br /><Link to={`/grievances/${p.id}`}>{t('तपशील ›')}</Link></Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
          {ward && <WardPanel id={ward} onClose={() => setWard(null)} />}
        </div>
      </div>

      <div className="grid-2">
        {/* प्रभागनिहाय कामगिरी */}
        <div className="card">
          <div className="page-head"><h3 className="card-title" style={{ margin: 0 }}>🏆 {t('प्रभागनिहाय कामगिरी (३० दिवस)')}</h3>
            <ExportButtons rows={d.leaderboard} filename="ward-performance" title="प्रभागनिहाय कामगिरी"
              columns={[['rank', '#'], ['name', 'प्रभाग'], ['sla_pct', 'SLA पालन %'], ['avg_hours', 'सरासरी वेळ (तास)'], ['resolved_30d', 'निकाली'], ['tax_collected', 'कर संकलन'], ['score', 'गुण']]} /></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>{t('प्रभाग')}</th><th>{t('SLA %')}</th><th>{t('सरासरी वेळ')}</th><th>{t('निकाली')}</th><th>{t('कर संकलन')}</th><th>{t('गुण')}</th></tr></thead>
              <tbody>{d.leaderboard.map((w) => (
                <tr key={w.id} className="clickable" onClick={() => setWard(w.id)}>
                  <td className="leader-rank">{['🥇', '🥈', '🥉'][w.rank - 1] || w.rank}</td>
                  <td><b>{t(w.name)}</b></td><td>{w.sla_pct ?? 0}%</td><td>{w.avg_hours ? t('{n} तास', { n: w.avg_hours }) : '—'}</td>
                  <td>{w.resolved_30d || 0}</td><td>{lakh(w.tax_collected)}</td><td><b>{w.score}</b></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        {/* अर्थसंकल्प विरुद्ध खर्च */}
        <div className="card">
          <div className="page-head"><h3 className="card-title" style={{ margin: 0 }}>💹 {t('अर्थसंकल्प विरुद्ध खर्च')} <small className="muted">({t('लाख ₹')}, {d.fy})</small></h3>
            <ExportButtons rows={d.budget} filename="budget-vs-expenditure" title="अर्थसंकल्प विरुद्ध खर्च"
              columns={[['name', 'विभाग'], ['budget', 'अर्थसंकल्प'], ['spent', 'खर्च'], ['pct', 'खर्च %']]} /></div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={budget} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={11} interval={0} angle={-18} textAnchor="end" height={58} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v) => `₹${v} L`} />
              <Legend />
              <Bar dataKey="budget" name={t('अर्थसंकल्प')} fill="#f4b183" radius={[4, 4, 0, 0]} />
              <Bar dataKey="spent" name={t('प्रत्यक्ष खर्च')} fill="#d9480f" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <Link to="/budget" className="btn btn-sm btn-light">{t('तपशील व खर्च नोंद ›')}</Link>
        </div>
      </div>

      <div className="card">
        <div className="page-head"><h3 className="card-title" style={{ margin: 0 }}>📉 {t('गेल्या १४ दिवसांचा कल')}</h3>
          <ExportButtons rows={d.trend} filename="grievance-trend" title="तक्रारींचा कल" columns={[['day', 'दिनांक'], ['received', 'प्राप्त'], ['resolved', 'निकाली']]} /></div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="day" fontSize={12} />
            <YAxis allowDecimals={false} fontSize={12} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="received" name={t('प्राप्त')} stroke="#d9480f" strokeWidth={2.5} />
            <Line type="monotone" dataKey="resolved" name={t('निकाली')} stroke="#12a150" strokeWidth={2.5} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
