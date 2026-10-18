import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { fmtDate, fmtMoney, useFetch } from '../../utils.js';
import { PAY_STATUS } from './Tax.jsx';
import { useT } from '../../i18n/index.jsx';

const MODES = [['UPI', 'UPI'], ['CASH', 'रोख'], ['CHEQUE', 'चेक'], ['DEBIT_CARD', 'डेबिट कार्ड'], ['CREDIT_CARD', 'क्रेडिट कार्ड'], ['NET_BANKING', 'नेट बँकिंग']];

function PayForm({ a, onPaid }) {
  const t = useT();
  const [amount, setAmount] = useState(String(a.due_now));
  const [mode, setMode] = useState('UPI');
  const [ref, setRef] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const pay = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { const r = await api.post(`/tax/assessments/${a.id}/pay`, { amount: +amount, payment_mode: mode, reference: ref }); onPaid(r.payment_id); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <form className="sub-card" onSubmit={pay}>
      <b>{t('💳 {head} भरणा — {fy}', { head: t(a.head_name), fy: a.financial_year })}</b>
      <div className="row-gap">
        <input type="number" step="0.01" min={1} max={a.due_now} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select value={mode} onChange={(e) => setMode(e.target.value)}>{MODES.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select>
        <input placeholder={t('UTR / चेक क्र.')} value={ref} onChange={(e) => setRef(e.target.value)} />
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      <button className="btn btn-success" disabled={busy}>{busy ? t('थांबा…') : t('✔ {amt} जमा करा व पावती द्या', { amt: fmtMoney(+amount) })}</button>
    </form>
  );
}

export default function PropertyDetail() {
  const t = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const { data: p, loading, error } = useFetch(() => api.get(`/tax/properties/${id}`), [id]);
  const [paying, setPaying] = useState(null);

  if (loading) return <p className="muted">{t('लोड होत आहे…')}</p>;
  if (error) return <div className="alert alert-error">{error.message}</div>;
  const totalDue = p.assessments.reduce((s, a) => s + a.due_now, 0);

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => nav(-1)}>{t('‹ मागे')}</button>
      <div className="page-head">
        <h2 className="page-title">🏠 {p.property_no} — {p.owner_name}</h2>
        <div className={`badge ${totalDue > 0 ? 'b-rejected' : 'b-resolved'}`} style={{ fontSize: 16 }}>{t('एकूण देय:')} {fmtMoney(totalDue)}</div>
      </div>
      <div className="grid-2">
        <div className="card">
          <dl className="dl">
            <dt>{t('पत्ता')}</dt><dd>{p.address}</dd>
            <dt>{t('प्रभाग')}</dt><dd>{t(p.ward_name)}</dd>
            <dt>{t('प्रकार')}</dt><dd>{t(p.type_name)}</dd>
            <dt>{t('बांधकाम क्षेत्र')}</dt><dd>{p.built_up_area_sqft} {t('चौ.फू.')} × ₹{p.rate}</dd>
            <dt>{t('मोबाईल')}</dt><dd>{p.owner_mobile || '—'}</dd>
            {p.lat && <><dt>{t('नकाशा')}</dt><dd><a href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">{t('📍 पहा')}</a></dd></>}
          </dl>
        </div>
        <div className="card">
          <h3 className="card-title">{t('पावत्या')}</h3>
          <table className="table">
            <tbody>
              {p.payments.length === 0 && <tr><td className="empty">{t('अजून भरणा नाही')}</td></tr>}
              {p.payments.map((y) => (
                <tr key={y.id}><td>{fmtDate(y.paid_at)}<br /><small className="muted">{y.financial_year} · {y.payment_mode}</small></td>
                  <td><b>{fmtMoney(y.amount_paid)}</b></td><td><Link to={`/receipt/${y.id}`}>{t('🧾 पावती')}</Link></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h3 className="section-title">{t('वार्षिक कर आकारणी')}</h3>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>{t('आर्थिक वर्ष')}</th><th>{t('कर प्रकार')}</th><th>{t('कर')}</th><th>{t('सवलत')}</th><th>{t('दंड')}</th><th>{t('भरलेले')}</th><th>{t('आता देय')}</th><th>{t('स्थिती')}</th><th></th></tr></thead>
          <tbody>
            {p.assessments.map((a) => (
              <tr key={a.id}>
                <td><b>{a.financial_year}</b></td><td>{a.tax_head === 'water' ? '🚰' : '🏠'} {t(a.head_name)}</td><td>{fmtMoney(a.tax_amount)}</td>
                <td>{fmtMoney(a.payment_status === 'PAID' ? a.discount_amount : a.current_discount)}</td>
                <td className={a.current_penalty > 0 ? 'text-danger' : ''}>{fmtMoney(a.payment_status === 'PAID' ? a.penalty_amount : a.current_penalty)}</td>
                <td>{fmtMoney(a.amount_paid)}</td><td><b>{fmtMoney(a.due_now)}</b></td>
                <td><span className={`badge ${PAY_STATUS[a.payment_status][1]}`}>{t(PAY_STATUS[a.payment_status][0])}</span></td>
                <td>{a.due_now > 0 && <button className="btn btn-sm btn-primary" onClick={() => setPaying(paying?.id === a.id ? null : a)}>{t('भरणा')}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paying && <PayForm a={paying} onPaid={(pid) => nav(`/receipt/${pid}`)} />}
    </div>
  );
}
