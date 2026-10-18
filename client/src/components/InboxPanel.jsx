// "माझ्याकडे प्रलंबित" — आज बाकी असलेले सर्व काम एका नजरेत, प्रत्येकावर क्लिक करून थेट त्या कामावर
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { fmtTime, useFetch } from '../utils.js';
import { useT } from '../i18n/index.jsx';

export default function InboxPanel({ showAttendance = true }) {
  const t = useT();
  const { data } = useFetch(() => api.getCached('/inbox'));
  if (!data) return null;
  const a = data.attendance;
  return (
    <div className="card inbox">
      <div className="page-head">
        <h3 className="card-title" style={{ margin: 0 }}>{t('📥 माझ्याकडे प्रलंबित')} {data.total > 0 && <span className="badge b-rejected">{data.total}</span>}</h3>
        {showAttendance && (
          a.on_leave ? <span className="badge b-assigned">{t('🏖️ आज रजेवर')}</span>
            : a.checked_in ? <span className="badge b-resolved">{t('✅ हजर {time}', { time: fmtTime(a.check_in_at) })}</span>
              : <Link to="/attendance" className="btn btn-sm btn-warn">{t('🧑 आजची हजेरी द्या')}</Link>
        )}
      </div>
      {data.items.length === 0 ? (
        <p className="muted">{t('🎉 सध्या काहीही प्रलंबित नाही.')}</p>
      ) : (
        <div className="inbox-grid">
          {data.items.map((i) => (
            <Link key={i.key} to={i.link} className={`inbox-item ${i.tone}`}>
              <span className="inbox-icon">{i.icon}</span>
              <span className="inbox-label">{t(i.label)}</span>
              <b className="inbox-count">{i.count}</b>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
