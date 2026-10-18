// अधिकारी: कर्मचाऱ्यांचे रजा अर्ज व साहित्य मागणी — एका क्लिकवर मंजूर / नामंजूर
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { fmtDate, fmtDay, useFetch } from '../../utils.js';
import { LEAVE_STATUS } from '../staff/Leave.jsx';
import { MR_STATUS } from '../staff/Materials.jsx';
import { ADV_STATUS } from '../staff/Advance.jsx';
import { fmtMoney } from '../../utils.js';
import { useT } from '../../i18n/index.jsx';

const LT = { casual: 'किरकोळ रजा', sick: 'आजारपणाची रजा', earned: 'अर्जित रजा', other: 'इतर (बिनपगारी)' };

function Decide({ onDecide, issue }) {
  const t = useT();
  const [remark, setRemark] = useState('');
  const [err, setErr] = useState('');
  const go = async (decision) => {
    setErr('');
    try { await onDecide(decision, remark); } catch (x) { setErr(x.message); }
  };
  if (issue) return <button className="btn btn-sm btn-success" onClick={() => go('issued')}>{t('📦 साहित्य दिले')}</button>;
  return (
    <div className="decide">
      <input placeholder={t('शेरा (नामंजुरीसाठी आवश्यक)')} value={remark} onChange={(e) => setRemark(e.target.value)} />
      <button className="btn btn-sm btn-success" onClick={() => go('approved')}>{t('✔ मंजूर')}</button>
      <button className="btn btn-sm btn-danger" onClick={() => go('rejected')}>{t('✖ नामंजूर')}</button>
      {err && <small className="text-danger">{err}</small>}
    </div>
  );
}

export default function HrApprovals() {
  const t = useT();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'leave');
  const [status, setStatus] = useState('pending');
  const leave = useFetch(() => (tab === 'leave' ? api.get(`/hr/leave/team?status=${status}`) : null), [tab, status]);
  const mats = useFetch(() => (tab === 'materials' ? api.get(`/ops/materials/team?status=${status}`) : null), [tab, status]);
  const adv = useFetch(() => (tab === 'advance' ? api.get(`/hr/advance/team?status=${status}`) : null), [tab, status]);
  const rows = tab === 'leave' ? leave : tab === 'advance' ? adv : mats;

  return (
    <div>
      <h2 className="page-title">{t('🗂️ कर्मचारी अर्ज मंजुरी')}</h2>
      <div className="tabs">
        <button className={tab === 'leave' ? 'active' : ''} onClick={() => setTab('leave')}>{t('🏖️ रजा अर्ज')}</button>
        <button className={tab === 'advance' ? 'active' : ''} onClick={() => setTab('advance')}>{t('💰 अग्रीम / कर्ज')}</button>
        <button className={tab === 'materials' ? 'active' : ''} onClick={() => setTab('materials')}>{t('📦 साहित्य मागणी')}</button>
      </div>
      <div className="tabs small" style={{ marginLeft: 10 }}>
        {(tab === 'leave' ? ['pending', 'approved', 'rejected'] : tab === 'advance' ? ['pending', 'approved', 'disbursed', 'rejected'] : ['pending', 'approved', 'issued', 'rejected']).map((s) => (
          <button key={s} className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>{t(tab === 'leave' ? LEAVE_STATUS[s].label : tab === 'advance' ? ADV_STATUS[s][0] : MR_STATUS[s][0])}</button>
        ))}
      </div>
      {rows.data?.length === 0 && <div className="card empty">{t('काहीही नाही')}</div>}
      <div className="list">
        {tab === 'leave' && leave.data?.map((l) => (
          <div key={l.id} className="card list-item">
            <div className="page-head">
              <strong>{l.name} <small className="muted">— {t(l.designation)}, {t(l.ward_name) || t('मुख्यालय')}</small></strong>
              <span className={`badge ${LEAVE_STATUS[l.status].cls}`}>{t(LEAVE_STATUS[l.status].label)}</span>
            </div>
            <span>🏖️ {t(LT[l.leave_type])} · <b>{t('{n} दिवस', { n: l.days })}</b> · {t('{from} ते {to}', { from: fmtDay(l.from_date), to: fmtDay(l.to_date) })}</span>
            {l.reason && <span>{t('कारण:')} {l.reason}</span>}
            <small className="muted">{t('अर्ज:')} {fmtDate(l.created_at)}{l.decided_by_name ? ` · ${t('निर्णय:')} ${l.decided_by_name}` : ''}{l.remark ? ` — “${l.remark}”` : ''}
              {l.mobile && <> · <a href={`tel:${l.mobile}`}>📞 {l.mobile}</a></>}</small>
            {l.status === 'pending' && <Decide onDecide={async (decision, remark) => { await api.post(`/hr/leave/${l.id}/decide`, { decision, remark }); leave.reload(); }} />}
          </div>
        ))}
        {tab === 'advance' && adv.data?.map((a) => (
          <div key={a.id} className="card list-item">
            <div className="page-head">
              <strong>{a.name} <small className="muted">— {t(a.designation)}, {t(a.ward_name) || t('मुख्यालय')}</small></strong>
              <span className={`badge ${ADV_STATUS[a.status][1]}`}>{t(ADV_STATUS[a.status][0])}</span>
            </div>
            <span>💰 {t(a.kind_name)} · <b>{fmtMoney(a.amount)}</b> · {t('{n} हप्ते', { n: a.installments })} × {fmtMoney(a.installment)} · {t('मूळ वेतन')} {fmtMoney(a.basic_pay)}</span>
            {a.reason && <span>{t('कारण:')} {a.reason}</span>}
            <small className="muted">{a.request_no} · {fmtDate(a.created_at)}{a.remark ? ` · “${a.remark}”` : ''}</small>
            {a.status === 'pending' && <Decide onDecide={async (decision, remark) => { await api.post(`/hr/advance/${a.id}/decide`, { decision, remark }); adv.reload(); }} />}
            {a.status === 'approved' && <button className="btn btn-sm btn-success" style={{ alignSelf: 'flex-start' }} onClick={async () => { await api.post(`/hr/advance/${a.id}/decide`, { decision: 'disbursed' }); adv.reload(); }}>{t('💰 रक्कम दिली (वितरित)')}</button>}
          </div>
        ))}
        {tab === 'materials' && mats.data?.map((m) => (
          <div key={m.id} className="card list-item">
            <div className="page-head">
              <strong>{m.name} <small className="muted">— {t(m.designation)}, {t(m.ward_name) || t('मुख्यालय')}</small></strong>
              <span className={`badge ${MR_STATUS[m.status][1]}`}>{t(MR_STATUS[m.status][0])}</span>
            </div>
            <span>📦 {m.items.map((i) => `${i.name} ${i.qty} ${i.unit}`).join(', ')}</span>
            {m.reason && <span>{t('कारण:')} {m.reason}</span>}
            <small className="muted">{m.request_no} · {fmtDate(m.created_at)}{m.remark ? ` · “${m.remark}”` : ''}</small>
            {['pending', 'approved'].includes(m.status) && (
              <Decide issue={m.status === 'approved'} onDecide={async (decision, remark) => { await api.post(`/ops/materials/${m.id}/decide`, { decision, remark }); mats.reload(); }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
