// रजा: शिल्लक रजा, नवीन अर्ज, माझे अर्ज
import { useState } from 'react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { STATUS, fmtDate, fmtDay, useFetch } from '../../utils.js';
import VoiceInput from '../../components/VoiceInput.jsx';

export const LEAVE_STATUS = { ...STATUS, rejected: { label: 'नामंजूर', cls: 'b-rejected' }, cancelled: { label: 'रद्द', cls: 'b-closed' } };
const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

export default function Leave() {
  const t = useT();
  const { data, reload } = useFetch(() => api.getCached('/hr/leave/my'));
  const [f, setF] = useState({ leave_type: 'casual', from_date: todayIST(), to_date: todayIST(), reason: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await api.post('/hr/leave', f);
      setMsg({ ok: true, text: t('✅ {n} दिवसांचा रजा अर्ज वरिष्ठांकडे पाठवला. मंजूर झाल्यावर सूचना येईल.', { n: r.days }) });
      setF({ ...f, reason: '' });
      reload();
    } catch (x) { setMsg({ ok: false, text: x.message }); } finally { setBusy(false); }
  };
  const cancel = async (id) => { if (confirm(t('हा रजा अर्ज रद्द करायचा?'))) { await api.post(`/hr/leave/${id}/cancel`); reload(); } };

  return (
    <div>
      <h2 className="page-title">🏖️ {t('रजा')}</h2>
      <div className="leave-balance">
        {data?.balance.filter((b) => b.entitled != null).map((b) => (
          <div key={b.type} className="card bal">
            <b>{b.available}</b>
            <span>{t(b.name)}</span>
            <small className="muted">{t('एकूण {total} · वापरली {used}', { total: b.entitled, used: b.used })}{b.pending ? ` · ${t('प्रलंबित {n}', { n: b.pending })}` : ''}</small>
          </div>
        ))}
      </div>

      <form className="card" onSubmit={submit}>
        <h3 className="card-title">{t('नवीन रजा अर्ज')}</h3>
        <div className="grid-3">
          <label>{t('रजेचा प्रकार')}
            <select value={f.leave_type} onChange={(e) => setF({ ...f, leave_type: e.target.value })}>
              {data && Object.entries(data.types).map(([k, ty]) => <option key={k} value={k}>{t(ty.name)}</option>)}
            </select>
          </label>
          <label>{t('पासून')}<input type="date" value={f.from_date} onChange={(e) => setF({ ...f, from_date: e.target.value, to_date: e.target.value > f.to_date ? e.target.value : f.to_date })} /></label>
          <label>{t('पर्यंत')}<input type="date" min={f.from_date} value={f.to_date} onChange={(e) => setF({ ...f, to_date: e.target.value })} /></label>
        </div>
        <label>{t('कारण (🎤 बोलूनही लिहू शकता)')}</label>
        <VoiceInput rows={2} value={f.reason} onChange={(v) => setF((x) => ({ ...x, reason: v }))} placeholder={t('रजेचे कारण')} />
        <p className="muted small">{t('रविवार व सार्वजनिक सुट्ट्या रजेत मोजल्या जात नाहीत.')}</p>
        {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-error'}`}>{msg.text}</div>}
        <button className="btn btn-primary btn-xl btn-block" disabled={busy}>{busy ? t('पाठवत आहे…') : `📤 ${t('अर्ज पाठवा')}`}</button>
      </form>

      <h3 className="section-title">{t('माझे रजा अर्ज')}</h3>
      <div className="list">
        {data?.requests.length === 0 && <div className="card empty">{t('अजून अर्ज नाही')}</div>}
        {data?.requests.map((l) => (
          <div key={l.id} className="card list-item row">
            <div>
              <strong>{t(data.types[l.leave_type].name)} · {t('{n} दिवस', { n: l.days })}</strong>
              <small className="muted">{t('{from} ते {to}', { from: fmtDay(l.from_date), to: fmtDay(l.to_date) })} · {t('अर्ज {date}', { date: fmtDate(l.created_at) })}</small>
              <small className="muted">{t('मंजुरी:')} {l.decided_by_name || l.approver_name || '—'}{l.remark ? ` — “${l.remark}”` : ''}</small>
            </div>
            <div className="col-end">
              <span className={`badge ${LEAVE_STATUS[l.status].cls}`}>{t(LEAVE_STATUS[l.status].label)}</span>
              {(l.status === 'pending' || (l.status === 'approved' && l.from_date > todayIST())) && <button className="btn btn-sm btn-light" onClick={() => cancel(l.id)}>{t('रद्द')}</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
