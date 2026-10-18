// KPI कार्ड — डॅशबोर्डच्या वरच्या पट्टीसाठी
import { Link } from 'react-router-dom';
import { useT } from '../i18n/index.jsx';

export default function Kpi({ icon, label, value, sub, tone = '', to, progress }) {
  const t = useT();
  const body = (
    <div className={`stat kpi ${tone}`}>
      <span className="stat-icon">{icon}</span>
      <div className="kpi-body">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{t(label)}</div>
        {sub && <div className="stat-sub">{sub}</div>}
        {progress != null && <div className="progress kpi-progress"><div style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="stat-link">{body}</Link> : body;
}
