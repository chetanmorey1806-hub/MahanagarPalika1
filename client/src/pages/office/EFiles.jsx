import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { STATUS, useFetch } from '../../utils.js';
import { useT } from '../../i18n/index.jsx';

export default function EFiles() {
  const t = useT();
  const [box, setBox] = useState('inbox');
  const [adding, setAdding] = useState(false);
  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState('normal');
  const { data, loading, reload } = useFetch(() => api.get(`/efiles?box=${box}`), [box]);

  const create = async (e) => {
    e.preventDefault();
    await api.post('/efiles', { subject, priority });
    setSubject(''); setAdding(false); setBox('inbox'); reload();
  };

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">{t('📁 ई-ऑफिस फाईल ट्रॅकिंग')}</h2>
        <button className="btn btn-primary" onClick={() => setAdding(!adding)}>{adding ? t('रद्द') : t('+ नवीन फाईल')}</button>
      </div>
      {adding && (
        <form className="card row-gap" onSubmit={create}>
          <input required placeholder={t('फाईलचा विषय')} value={subject} onChange={(e) => setSubject(e.target.value)} style={{ flex: 1 }} />
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="normal">{t('साधारण')}</option>
            <option value="urgent">{t('🔴 तातडीची')}</option>
          </select>
          <button className="btn btn-primary">{t('तयार करा')}</button>
        </form>
      )}
      <div className="tabs">
        {[['inbox', '📥 माझ्याकडे'], ['sent', '📤 पुढे पाठवलेल्या'], ['all', '🗂️ सर्व']].map(([k, l]) => (
          <button key={k} className={box === k ? 'active' : ''} onClick={() => setBox(k)}>{t(l)}</button>
        ))}
      </div>
      {loading && <p className="muted">{t('लोड होत आहे…')}</p>}
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>{t('फाईल क्र.')}</th><th>{t('विषय')}</th><th>{t('विभाग')}</th><th>{t('सध्या कोणाकडे')}</th><th>{t('किती दिवस')}</th><th>{t('स्थिती')}</th></tr></thead>
          <tbody>
            {data?.length === 0 && <tr><td colSpan={6} className="empty">{t('फाईल नाही')}</td></tr>}
            {data?.map((f) => (
              <tr key={f.id}>
                <td><Link to={`/efiles/${f.id}`}><b>{f.file_no}</b></Link></td>
                <td>{f.priority === 'urgent' && '🔴 '}{f.subject}</td>
                <td>{t(f.department_name)}</td>
                <td>{f.holder_name}<br /><small className="muted">{t(f.holder_designation)}</small></td>
                <td className={f.status === 'open' && f.days_pending > 7 ? 'text-danger' : ''}><b>{f.status === 'open' ? f.days_pending : '—'}</b></td>
                <td><span className={`badge ${STATUS[f.status].cls}`}>{f.status === 'open' ? t('चालू') : t('निकाली')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
