// कर्मचारी संपर्क यादी — एका क्लिकवर फोन / WhatsApp
import { useState } from 'react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { ROLE, useFetch } from '../../utils.js';

export default function Directory() {
  const t = useT();
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const masters = useFetch(() => api.getCached('/masters'));
  const qs = new URLSearchParams({ ...(search && { search }), ...(dept && { department_id: dept }) }).toString();
  const { data } = useFetch(() => api.getCached(`/hr/directory${qs ? `?${qs}` : ''}`), [qs]);

  return (
    <div>
      <h2 className="page-title">📇 {t('कर्मचारी संपर्क')}</h2>
      <div className="card filters">
        <input placeholder={t('🔎 नाव / पद / मोबाईल')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">{t('सर्व विभाग')}</option>
          {masters.data?.departments.map((d) => <option key={d.id} value={d.id}>{t(d.name)}</option>)}
        </select>
      </div>
      <div className="dir-grid">
        {data?.map((u) => (
          <div key={u.id} className="card dir-card">
            <div className="dir-avatar">{u.name.replace(/^(श्री|सौ|डॉ)\.\s*/, '').slice(0, 1)}</div>
            <div className="dir-info">
              <b>{u.name}</b>
              <small>{t(u.designation || ROLE[u.role])}</small>
              <small className="muted">{t(u.department_name || 'प्रशासन')} · {t(u.ward_name || 'मुख्यालय')}</small>
            </div>
            <div className="dir-actions">
              <a className="btn btn-sm btn-success" href={`tel:${u.mobile}`}>📞</a>
              <a className="btn btn-sm btn-light" href={`https://wa.me/91${u.mobile}`} target="_blank" rel="noreferrer">💬</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
