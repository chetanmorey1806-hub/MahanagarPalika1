// दैनिक MIS अहवाल (PDF) + कर्मचाऱ्यांचे Voice रिपोर्ट
import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { fmtDate, fmtMoney, useFetch } from '../../utils.js';
import { tr, useT } from '../../i18n/index.jsx';

const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

async function openPdf(date) {
  const res = await fetch(`/api/reports/${date}/pdf`, { headers: { Authorization: `Bearer ${localStorage.getItem('mnp_token')}` } });
  if (!res.ok) return alert(tr('अहवाल उघडता आला नाही'));
  window.open(URL.createObjectURL(await res.blob()), '_blank');
}

export default function Reports() {
  const t = useT();
  const { user } = useAuth();
  const [tab, setTab] = useState('mis');
  const [date, setDate] = useState(todayIST());
  const list = useFetch(() => api.get('/reports'));
  const summary = useFetch(() => api.get(`/reports/summary?date=${date}`), [date]);
  const work = useFetch(() => api.get(`/work-reports?date=${date}`), [date]);
  const [msg, setMsg] = useState('');
  const s = summary.data;

  const sendNow = async () => {
    setMsg('');
    try { await api.post('/reports/send-now', { date }); setMsg(t('✔ अहवाल तयार करून आयुक्तांना ई-मेल व WhatsApp वर पाठवला')); list.reload(); } catch (e) { setMsg(e.message); }
  };

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">{t('📄 दैनिक अहवाल')}</h2>
        <input type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} style={{ width: 'auto' }} />
      </div>
      <div className="tabs">
        <button className={tab === 'mis' ? 'active' : ''} onClick={() => setTab('mis')}>{t('📊 MIS अहवाल')}</button>
        <button className={tab === 'work' ? 'active' : ''} onClick={() => setTab('work')}>{t('🎤 कर्मचारी रिपोर्ट')} {work.data ? `(${work.data.length})` : ''}</button>
      </div>

      {tab === 'mis' && (
        <>
          <div className="card">
            <p className="muted">{t('रोज संध्याकाळी ६ वाजता हा १ पानी PDF अहवाल आपोआप तयार होऊन आयुक्तांच्या ई-मेल व WhatsApp वर जातो.')}</p>
            {s && (
              <div className="stats mini">
                {[['नवीन तक्रारी', s.received], ['निकाली', s.resolved], ['प्रलंबित', s.pending], ['SLA उशीर', s.overdue],
                  ['हजेरी', `${s.present}/${s.workers}`], ['कर संकलन', fmtMoney(s.tax)], ['कचरा', t('{n} टन', { n: s.waste })], ['वाहन अलर्ट', s.alerts]].map(([l, v]) => (
                  <div key={l} className="stat"><div><div className="stat-value">{v}</div><div className="stat-label">{t(l)}</div></div></div>
                ))}
              </div>
            )}
            <div className="row-gap">
              <button className="btn btn-primary" onClick={() => openPdf(date)}>{t('📄 PDF पहा / डाऊनलोड')}</button>
              {user.role === 'admin' && <button className="btn btn-light" onClick={sendNow}>{t('📤 आत्ताच पाठवा (ई-मेल + WhatsApp)')}</button>}
            </div>
            {msg && <div className="alert alert-ok">{msg}</div>}
          </div>
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>{t('दिनांक')}</th><th>{t('तक्रारी (नवीन / निकाली / प्रलंबित)')}</th><th>{t('कर')}</th><th>{t('कोणाला पाठवला')}</th><th></th></tr></thead>
              <tbody>
                {list.data?.length === 0 && <tr><td colSpan={5} className="empty">{t('अजून पाठवलेला अहवाल नाही (रोज ६ वाजता आपोआप)')}</td></tr>}
                {list.data?.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.report_date}</b><br /><small className="muted">{fmtDate(r.created_at)}</small></td>
                    <td>{r.summary.received} / {r.summary.resolved} / {r.summary.pending}</td>
                    <td>{fmtMoney(r.summary.tax)}</td>
                    <td><small>{r.sent_to || '—'}</small></td>
                    <td><button className="btn btn-sm btn-light" onClick={() => openPdf(r.report_date)}>PDF</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'work' && (
        <div className="list">
          {work.data?.length === 0 && <div className="card empty">{t('या दिवशी रिपोर्ट नाही')}</div>}
          {work.data?.map((r) => (
            <div key={r.id} className="card list-item">
              <strong>{r.via_voice ? '🎤' : '✏️'} {r.text}</strong>
              <small className="muted">{r.name} ({t(r.designation)}) · {t(r.ward_name)} · {fmtDate(r.created_at)}
                {r.lat && <> · <a href={`https://www.google.com/maps?q=${r.lat},${r.lng}`} target="_blank" rel="noreferrer">{t('📍 नकाशा')}</a></>}</small>
              {r.photo && <img className="photo-preview" src={r.photo} alt="" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
