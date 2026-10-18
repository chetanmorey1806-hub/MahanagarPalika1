// कर भरणा पावती (छापण्यायोग्य)
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { fmtDate, fmtMoney, useFetch } from '../../utils.js';
import { useT } from '../../i18n/index.jsx';

export default function Receipt() {
  const t = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const { data: y, loading, error } = useFetch(() => api.get(`/tax/payments/${id}/receipt`), [id]);
  if (loading) return <p className="muted">{t('लोड होत आहे…')}</p>;
  if (error) return <div className="alert alert-error">{error.message}</div>;
  const ref = JSON.parse(y.payment_gateway_response || '{}').reference;

  return (
    <div>
      <button className="btn btn-ghost no-print" onClick={() => nav(-1)}>{t('‹ मागे')}</button>
      <div className="certificate receipt">
        <div className="cert-head">
          <div className="cert-emblem"><img src="/logo.png" alt="" /></div>
          <h1>{t('अमरावती महानगरपालिका')}</h1>
          <h2>{t('{head} पावती', { head: t(y.head_name || 'मालमत्ता कर') })}</h2>
          <small>{t('व्यवहार क्र.')} {y.transaction_id}</small>
        </div>
        <dl className="dl">
          <dt>{t('मालमत्ता क्र.')}</dt><dd>{y.property_no}</dd>
          <dt>{t('मालक')}</dt><dd>{y.owner_name}</dd>
          <dt>{t('पत्ता')}</dt><dd>{y.address} · {t(y.ward_name)}</dd>
          <dt>{t('प्रकार / क्षेत्र')}</dt><dd>{t(y.type_name)} · {y.built_up_area_sqft} {t('चौ.फू.')}</dd>
          <dt>{t('आर्थिक वर्ष')}</dt><dd>{y.financial_year}</dd>
          <dt>{t('वार्षिक कर')}</dt><dd>{fmtMoney(y.tax_amount)}</dd>
          {y.discount_amount > 0 && <><dt>{t('सवलत')}</dt><dd>− {fmtMoney(y.discount_amount)}</dd></>}
          {y.penalty_amount > 0 && <><dt>{t('दंड')}</dt><dd>+ {fmtMoney(y.penalty_amount)}</dd></>}
          <dt>{t('या पावतीने भरलेले')}</dt><dd className="receipt-amt">{fmtMoney(y.amount_paid)}</dd>
          <dt>{t('भरण्याची पद्धत')}</dt><dd>{y.payment_mode}{ref ? ` · ${ref}` : ''}</dd>
          <dt>{t('वर्षातील एकूण भरलेले')}</dt><dd>{fmtMoney(y.total_paid)} / {fmtMoney(y.total_payable)} — {y.assessment_status === 'PAID' ? t('✔ पूर्ण भरलेला') : t('बाकी आहे')}</dd>
          <dt>{t('दिनांक')}</dt><dd>{fmtDate(y.paid_at)}</dd>
          <dt>{t('वसूल करणारे')}</dt><dd>{y.collected_by_name || t('ऑनलाइन')}</dd>
        </dl>
        <p className="muted small center">{t('ही संगणकीय पावती आहे, स्वाक्षरीची आवश्यकता नाही.')}</p>
        <button className="btn btn-primary no-print" onClick={() => window.print()}>{t('🖨️ छापा')}</button>
      </div>
    </div>
  );
}
