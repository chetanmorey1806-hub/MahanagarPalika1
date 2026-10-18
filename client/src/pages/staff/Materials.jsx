// साहित्य मागणी — झाडू, हातमोजे, गणवेश, स्टेशनरी इ.
import { useState } from 'react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { fmtDate, useFetch } from '../../utils.js';

export const MR_STATUS = { pending: ['प्रलंबित', 'b-new'], approved: ['मंजूर — वाटप बाकी', 'b-assigned'], rejected: ['नामंजूर', 'b-rejected'], issued: ['साहित्य मिळाले', 'b-resolved'] };

export default function Materials() {
  const t = useT();
  const catalog = useFetch(() => api.getCached('/ops/materials/items'));
  const mine = useFetch(() => api.getCached('/ops/materials/my'));
  const [cart, setCart] = useState({});
  const [custom, setCustom] = useState({ name: '', qty: 1, unit: 'नग' });
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState(null);

  const qty = (name, d, unit) => setCart((c) => {
    const n = Math.max(0, (c[name]?.qty || 0) + d);
    const next = { ...c };
    if (n) next[name] = { name, qty: n, unit }; else delete next[name];
    return next;
  });
  const items = Object.values(cart);

  const submit = async () => {
    setMsg(null);
    try {
      const r = await api.post('/ops/materials', { items, reason });
      setMsg({ ok: true, text: t('✅ मागणी {no} वरिष्ठांकडे पाठवली', { no: r.request_no }) });
      setCart({}); setReason(''); mine.reload();
    } catch (x) { setMsg({ ok: false, text: x.message }); }
  };

  return (
    <div>
      <h2 className="page-title">📦 {t('साहित्य मागणी')}</h2>
      <div className="card">
        <p className="muted">{t('लागणाऱ्या वस्तूंवर + दाबा')}</p>
        <div className="mat-grid">
          {catalog.data?.map((i) => (
            <div key={i.name} className={`mat-item ${cart[i.name] ? 'on' : ''}`}>
              <span>{t(i.name)}</span>
              <div className="qty">
                <button type="button" onClick={() => qty(i.name, -1, i.unit)}>−</button>
                <b>{cart[i.name]?.qty || 0}</b>
                <button type="button" onClick={() => qty(i.name, 1, i.unit)}>+</button>
              </div>
              <small className="muted">{t(i.unit)}</small>
            </div>
          ))}
        </div>
        <div className="row-gap">
          <input placeholder={t('इतर वस्तू')} value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
          <input type="number" min={1} value={custom.qty} onChange={(e) => setCustom({ ...custom, qty: +e.target.value })} style={{ maxWidth: 90 }} />
          <input value={custom.unit} onChange={(e) => setCustom({ ...custom, unit: e.target.value })} style={{ maxWidth: 90 }} />
          <button type="button" className="btn btn-light" disabled={!custom.name} onClick={() => { setCart({ ...cart, [custom.name]: { ...custom } }); setCustom({ name: '', qty: 1, unit: 'नग' }); }}>{t('+ जोडा')}</button>
        </div>
        {items.length > 0 && <p><b>{t('मागणी:')}</b> {items.map((i) => `${t(i.name)} ${i.qty} ${t(i.unit)}`).join(', ')}</p>}
        <input placeholder={t('कारण (उदा. जुने खराब झाले)')} value={reason} onChange={(e) => setReason(e.target.value)} />
        {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-error'}`}>{msg.text}</div>}
        <button className="btn btn-primary btn-xl btn-block" style={{ marginTop: 10 }} disabled={!items.length} onClick={submit}>📤 {t('मागणी पाठवा')}</button>
      </div>

      <h3 className="section-title">{t('माझ्या मागण्या')}</h3>
      <div className="list">
        {mine.data?.length === 0 && <div className="card empty">{t('अजून मागणी नाही')}</div>}
        {mine.data?.map((m) => (
          <div key={m.id} className="card list-item row">
            <div>
              <strong>{m.items.map((i) => `${t(i.name)} ${i.qty} ${t(i.unit)}`).join(', ')}</strong>
              <small className="muted">{m.request_no} · {fmtDate(m.created_at)}{m.remark ? ` · “${m.remark}”` : ''}</small>
            </div>
            <span className={`badge ${MR_STATUS[m.status][1]}`}>{t(MR_STATUS[m.status][0])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
