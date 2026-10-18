// पाणी बिल (मीटर रीडिंगवरून) — छापण्यायोग्य; कार्यालयात भरणा
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useT } from '../../i18n/index.jsx';
import { fmtDate, fmtDay, fmtMoney, useFetch } from '../../utils.js';

export default function WaterBill() {
  const t = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { data: b, reload } = useFetch(() => api.get(`/water/readings/${id}/bill`), [id]);
  const [mode, setMode] = useState('UPI');
  if (!b) return <p className="muted">{t('लोड होत आहे…')}</p>;
  const pay = async () => { await api.post(`/water/readings/${id}/pay`, { payment_mode: mode }); reload(); };

  return (
    <div>
      <button className="btn btn-ghost no-print" onClick={() => nav(-1)}>‹ {t('मागे')}</button>
      <div className="certificate receipt">
        <div className="cert-head">
          <div className="cert-emblem"><img src="/logo.png" alt="" /></div>
          <h1>{t('अमरावती महानगरपालिका')}</h1>
          <h2>💧 {t('पाणी बिल')}</h2>
          <small>{t('बिल क्र.')} {b.bill_no}</small>
        </div>
        <dl className="dl">
          <dt>{t('मालक')}</dt><dd>{b.owner_name}</dd>
          <dt>{t('मालमत्ता क्र.')}</dt><dd>{b.property_no} · {t(b.ward_name)}</dd>
          <dt>{t('मीटर क्र.')}</dt><dd>{b.meter_no} ({t(b.connection_size)})</dd>
          <dt>{t('मागील आकडा')}</dt><dd>{b.previous}</dd>
          <dt>{t('चालू आकडा')}</dt><dd><b>{b.reading}</b> {b.manual_override ? <small className="muted">({t('हाताने दुरुस्त')})</small> : <small className="muted">(🤖 OCR)</small>}</dd>
          <dt>{t('वापर')}</dt><dd><b>{b.units} {t('युनिट')}</b> ({(b.units * 1000).toLocaleString('en-IN')} {t('लिटर')})</dd>
          <dt>{t('वाचन दिनांक')}</dt><dd>{fmtDate(b.read_at)} · {b.read_by_name}</dd>
        </dl>
        <table className="table" style={{ marginTop: 14 }}>
          <thead><tr><th>{t('तपशील')}</th><th>{t('युनिट')}</th><th>{t('दर')}</th><th>{t('रक्कम')}</th></tr></thead>
          <tbody>{b.rows.map((r) => <tr key={r.label}><td>{t(r.label)}</td><td>{r.units ?? '—'}</td><td>{r.rate ? `₹${r.rate}` : '—'}</td><td>{fmtMoney(r.amount)}</td></tr>)}</tbody>
        </table>
        <div className="net-pay">{t('एकूण देय')}: <b>{fmtMoney(b.bill_amount)}</b> · {t('अंतिम तारीख')} {fmtDay(b.due_date)}</div>
        {b.photo && <img src={b.photo} alt="" style={{ maxWidth: 240, borderRadius: 8, display: 'block', margin: '0 auto 10px' }} />}
        {b.bill_status === 'paid'
          ? <p className="center"><span className="badge b-resolved">✔ {t('भरलेले')}</span> {b.payment_mode} · {fmtDate(b.paid_at)} · {b.transaction_id}</p>
          : user.role !== 'worker' && (
            <div className="row-gap no-print">
              <select value={mode} onChange={(e) => setMode(e.target.value)}>{['UPI', 'CASH', 'CHEQUE', 'DEBIT_CARD', 'NET_BANKING'].map((m) => <option key={m}>{m}</option>)}</select>
              <button className="btn btn-success" onClick={pay}>💳 {t('भरणा नोंदवा')}</button>
            </div>
          )}
        <button className="btn btn-primary no-print" onClick={() => window.print()}>🖨️ {t('छापा')}</button>
      </div>
    </div>
  );
}
