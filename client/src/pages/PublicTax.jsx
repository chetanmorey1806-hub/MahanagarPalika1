// नागरिक: मालमत्ता क्रमांकावरून कर थकबाकी पहा
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { fmtMoney } from '../utils.js';
import PublicHeader from '../components/PublicHeader.jsx';
import { useT } from '../i18n/index.jsx';

const PS = { PAID: ['भरलेला', 'b-resolved'], PARTIAL: ['अंशतः', 'b-assigned'], PENDING: ['थकीत', 'b-rejected'] };

export default function PublicTax() {
  const t = useT();
  const [no, setNo] = useState('');
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');

  const find = async (e) => {
    e.preventDefault();
    setErr(''); setP(null);
    try { setP(await api.get(`/tax/public/${encodeURIComponent(no.trim())}`)); } catch (x) { setErr(x.message); }
  };

  return (
    <div className="public-page">
      <PublicHeader title="मालमत्ता कर थकबाकी" />
      <div className="card form-card">
        <form className="row-gap" onSubmit={find}>
          <input value={no} onChange={(e) => setNo(e.target.value.toUpperCase())} placeholder={t('मालमत्ता क्र. उदा. PR-01-00001')} />
          <button className="btn btn-primary">{t('शोधा')}</button>
        </form>
        {err && <div className="alert alert-error">{err}</div>}
        {p && (
          <>
            <h3>{p.property_no} — {p.owner_name}</h3>
            <p className="muted">{p.address} · {t(p.ward_name)} · {t(p.type_name)} · {p.built_up_area_sqft} {t('चौ.फू.')}</p>
            <table className="table">
              <thead><tr><th>{t('वर्ष')}</th><th>{t('प्रकार')}</th><th>{t('कर')}</th><th>{t('भरलेले')}</th><th>{t('आता देय')}</th><th>{t('स्थिती')}</th></tr></thead>
              <tbody>{p.assessments.map((a) => (
                <tr key={a.id}><td>{a.financial_year}</td><td>{t(a.head_name)}</td><td>{fmtMoney(a.tax_amount)}</td><td>{fmtMoney(a.amount_paid)}</td>
                  <td><b>{fmtMoney(a.due_now)}</b>{a.current_penalty > 0 && a.due_now > 0 && <small className="text-danger"> ({t('दंड')} {fmtMoney(a.current_penalty)})</small>}
                    {a.current_discount > 0 && a.due_now > 0 && <small className="muted"> ({t('सवलत')} {fmtMoney(a.current_discount)})</small>}</td>
                  <td><span className={`badge ${PS[a.payment_status][1]}`}>{t(PS[a.payment_status][0])}</span></td></tr>
              ))}</tbody>
            </table>
            <div className={`alert ${p.total_due > 0 ? 'alert-error' : 'alert-ok'}`}>{t('एकूण देय:')} <b>{fmtMoney(p.total_due)}</b></div>
            {p.total_due > 0 && <p className="muted small">{t('कर भरण्यासाठी जवळच्या प्रभाग कार्यालयात भेट द्या. (ऑनलाइन UPI भरणा — payment gateway जोडल्यानंतर उपलब्ध.)')}</p>}
          </>
        )}
        <p className="center muted"><Link to="/complaint">{t('तक्रार नोंदवा')}</Link> · <Link to="/login">{t('लॉगिन')}</Link></p>
      </div>
    </div>
  );
}
