// अग्रीम / कर्ज अर्ज — सण अग्रीम, पगार अग्रीम, वैद्यकीय, शैक्षणिक, घर व वाहन कर्ज
import { useState } from 'react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { fmtDate, fmtMoney, useFetch } from '../../utils.js';
import VoiceInput from '../../components/VoiceInput.jsx';

export const ADV_STATUS = { pending: ['प्रलंबित', 'b-new'], approved: ['मंजूर — रक्कम येणे बाकी', 'b-assigned'], disbursed: ['रक्कम जमा', 'b-resolved'], rejected: ['नामंजूर', 'b-rejected'], cancelled: ['रद्द', 'b-closed'] };
const ICON = { festival: '🪔', salary: '💵', medical: '🏥', education: '🎓', house_loan: '🏠', vehicle_loan: '🛵' };

export default function Advance() {
  const t = useT();
  const { data, reload } = useFetch(() => api.getCached('/hr/advance/my'));
  const [kind, setKind] = useState('festival');
  const [amount, setAmount] = useState('');
  const [inst, setInst] = useState(1);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState(null);
  const k = data?.kinds[kind];

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      const r = await api.post('/hr/advance', { kind, amount: +amount, installments: +inst, reason });
      setMsg({ ok: true, text: t('✅ अर्ज {no} वरिष्ठांकडे पाठवला', { no: r.request_no }) });
      setAmount(''); setReason(''); reload();
    } catch (x) { setMsg({ ok: false, text: x.message }); }
  };

  return (
    <div>
      <h2 className="page-title">💰 {t('अग्रीम / कर्ज अर्ज')}</h2>
      {data && (
        <form className="card" onSubmit={submit}>
          <div className="icon-grid">
            {Object.entries(data.kinds).map(([key, v]) => (
              <button type="button" key={key} className={`icon-tile ${kind === key ? 'active' : ''}`} onClick={() => { setKind(key); setInst(Math.min(inst, v.maxInst)); }}>
                <span className="tile-icon">{ICON[key]}</span><span>{t(v.name)}</span><small>{t('कमाल')} {fmtMoney(v.max)}</small>
              </button>
            ))}
          </div>
          <div className="grid-3" style={{ marginTop: 12 }}>
            <label>{t('रक्कम (₹)')}<input required type="number" min={1} max={k?.max} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label>{t('हप्ते (महिने)')}<input type="number" min={1} max={k?.maxInst} value={inst} onChange={(e) => setInst(e.target.value)} /></label>
            <div className="sub-card"><small className="muted">{t('मासिक हप्ता')}</small><b>{amount ? fmtMoney(amount / Math.max(1, inst)) : '—'}</b></div>
          </div>
          <label>{t('कारण (🎤 बोलूनही लिहू शकता)')}</label>
          <VoiceInput rows={2} value={reason} onChange={setReason} placeholder={t('कारण')} />
          <p className="muted small">{t('मंजूर झाल्यावर रक्कम जमा होते आणि पुढील महिन्यापासून पगारातून हप्ता आपोआप कापला जातो.')}</p>
          {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-error'}`}>{msg.text}</div>}
          <button className="btn btn-primary btn-xl btn-block">📤 {t('अर्ज पाठवा')}</button>
        </form>
      )}
      <h3 className="section-title">{t('माझे अर्ज')}</h3>
      <div className="list">
        {data?.requests.length === 0 && <div className="card empty">{t('अजून अर्ज नाही')}</div>}
        {data?.requests.map((r) => (
          <div key={r.id} className="card list-item row">
            <div>
              <strong>{ICON[r.kind]} {t(r.kind_name)} · {fmtMoney(r.amount)}</strong>
              <small className="muted">{r.request_no} · {r.installments} {t('हप्ते')} × {fmtMoney(r.installment)} · {fmtDate(r.created_at)}{r.remark ? ` · “${t(r.remark)}”` : ''}</small>
            </div>
            <div className="col-end">
              <span className={`badge ${ADV_STATUS[r.status][1]}`}>{t(ADV_STATUS[r.status][0])}</span>
              {r.status === 'pending' && <button className="btn btn-sm btn-light" onClick={async () => { await api.post(`/hr/advance/${r.id}/cancel`); reload(); }}>{t('रद्द')}</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
