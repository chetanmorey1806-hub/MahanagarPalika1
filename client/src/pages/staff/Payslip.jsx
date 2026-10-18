// पगार स्लिप — हजेरी व मंजूर रजेवरून (छापण्यायोग्य)
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { currentLocale, useT } from '../../i18n/index.jsx';
import { fmtMoney, useFetch } from '../../utils.js';

const thisMonth = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 7);
const monthName = (m) => new Date(`${m}-01`).toLocaleDateString(currentLocale(), { month: 'long', year: 'numeric' });

export default function Payslip() {
  const t = useT();
  const [params] = useSearchParams();
  const [month, setMonth] = useState(thisMonth());
  const uid = params.get('user_id');
  const { data: p, loading, error } = useFetch(() => api.getCached(`/hr/payslip?month=${month}${uid ? `&user_id=${uid}` : ''}`), [month, uid]);

  return (
    <div>
      <div className="page-head no-print">
        <h2 className="page-title">💵 {t('पगार स्लिप')}</h2>
        <input type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value)} style={{ width: 'auto' }} />
      </div>
      {loading && <p className="muted">{t('लोड होत आहे…')}</p>}
      {error && <div className="alert alert-error">{error.message}</div>}
      {p && (
        <div className="certificate receipt payslip">
          <div className="cert-head">
            <div className="cert-emblem"><img src="/logo.png" alt="" /></div>
            <h1>{t('अमरावती महानगरपालिका')}</h1>
            <h2>{t('वेतन पत्रक — {month}', { month: monthName(month) })}</h2>
            {p.partial && <small className="text-danger">{t('महिना चालू आहे — आजपर्यंतचा अंदाज')}</small>}
          </div>
          <dl className="dl">
            <dt>{t('नाव')}</dt><dd>{p.employee.name}</dd>
            <dt>{t('कर्मचारी कोड')}</dt><dd>{p.employee.employee_code || '—'}</dd>
            <dt>{t('पद')}</dt><dd>{t(p.employee.designation)}</dd>
            <dt>{t('विभाग / प्रभाग')}</dt><dd>{t(p.employee.department_name) || '—'} · {t(p.employee.ward_name) || t('मुख्यालय')}</dd>
          </dl>
          <div className="att-strip">
            <div><b>{p.attendance.working_days}</b><small>{t('कामाचे दिवस')}</small></div>
            <div><b>{p.attendance.present}</b><small>{t('हजर')}</small></div>
            <div><b>{p.attendance.paid_leave}</b><small>{t('पगारी रजा')}</small></div>
            <div className={p.attendance.absent ? 'bad' : ''}><b>{p.attendance.absent}</b><small>{t('गैरहजर')}</small></div>
            <div><b>{p.attendance.payable_days}</b><small>{t('पगारी दिवस')}</small></div>
          </div>
          {!p.configured ? (
            <div className="alert alert-error">{t('मूळ वेतन अजून भरलेले नाही — प्रशासनाशी संपर्क साधा.')}</div>
          ) : (
            <div className="grid-2">
              <table className="table">
                <thead><tr><th>{t('उत्पन्न')}</th><th>{t('रक्कम')}</th></tr></thead>
                <tbody>{p.earnings.map(([l, v]) => <tr key={l}><td>{t(l)}</td><td>{fmtMoney(v)}</td></tr>)}
                  <tr><td><b>{t('एकूण')}</b></td><td><b>{fmtMoney(p.gross)}</b></td></tr></tbody>
              </table>
              <table className="table">
                <thead><tr><th>{t('कपात')}</th><th>{t('रक्कम')}</th></tr></thead>
                <tbody>{p.deductions.map(([l, v]) => <tr key={l}><td>{t(l)}</td><td>{fmtMoney(v)}</td></tr>)}
                  <tr><td><b>{t('एकूण कपात')}</b></td><td><b>{fmtMoney(p.total_deductions)}</b></td></tr></tbody>
              </table>
            </div>
          )}
          {p.configured && <div className="net-pay">{t('निव्वळ वेतन:')} <b>{fmtMoney(p.net)}</b></div>}
          <p className="muted small center">{t('हजेरी व मंजूर रजेवरून संगणकाने काढलेला अंदाज. अंतिम वेतन लेखा विभागाकडून.')}</p>
          <button className="btn btn-primary no-print" onClick={() => window.print()}>🖨️ {t('छापा / PDF')}</button>
        </div>
      )}
    </div>
  );
}
