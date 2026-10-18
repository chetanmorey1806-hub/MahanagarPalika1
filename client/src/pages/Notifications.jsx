import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { fmtDate, useFetch } from '../utils.js';
import { useT } from '../i18n/index.jsx';

export default function Notifications() {
  const t = useT();
  const { data, loading } = useFetch(() => api.get('/notifications'));
  useEffect(() => { if (data?.unread) api.post('/notifications/read-all').catch(() => {}); }, [data]);

  return (
    <div>
      <h2 className="page-title">{t('🔔 सूचना')}</h2>
      {loading && <p className="muted">{t('लोड होत आहे…')}</p>}
      {data?.items.length === 0 && <div className="card empty">{t('कोणतीही सूचना नाही')}</div>}
      <div className="list">
        {data?.items.map((n) => (
          <Link key={n.id} to={n.link || '#'} className={`card list-item ${n.is_read ? '' : 'unread'}`}>
            <strong>{n.title}</strong>
            <span>{n.message}</span>
            <small className="muted">{fmtDate(n.created_at)}</small>
          </Link>
        ))}
      </div>
    </div>
  );
}
