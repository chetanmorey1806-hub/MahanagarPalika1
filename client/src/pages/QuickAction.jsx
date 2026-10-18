// WhatsApp मधील लिंक → लॉगिन न करता एका क्लिकवर मंजूर / नामंजूर
import { Fragment, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { STATUS, fmtDate, useFetch } from '../utils.js';
import SignaturePad from '../components/SignaturePad.jsx';
import PublicHeader from '../components/PublicHeader.jsx';
import { useT } from '../i18n/index.jsx';

const LABELS = { child_name: 'बाळाचे नाव', dob: 'जन्म तारीख', hospital: 'रुग्णालय', deceased_name: 'मृत व्यक्ती', date_of_death: 'मृत्यू तारीख',
  survey_no: 'सर्व्हे नं.', area_sqft: 'क्षेत्र (चौ.फू.)', floors: 'मजले', shop_name: 'दुकान', business: 'व्यवसाय', property_no: 'मालमत्ता क्र.', connection_size: 'जोडणी', reason: 'कारण' };

export default function QuickAction() {
  const t = useT();
  const { token } = useParams();
  const { data, loading, error, reload } = useFetch(() => api.get(`/quick/${token}`), [token]);
  const [remark, setRemark] = useState('');
  const [sig, setSig] = useState(null);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (decision) => {
    setErr('');
    setBusy(true);
    try {
      await api.post(`/quick/${token}`, { decision, remark, signature: sig });
      setDone(decision);
      reload();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const it = data?.item;
  const isApp = data?.kind !== 'grievance_review';
  const needsSign = data?.kind === 'application';
  const pending = it && (isApp ? it.status === 'pending' : it.status === 'resolved');

  return (
    <div className="public-page">
      <PublicHeader title="एका क्लिकवर निर्णय" />
      <div className="card form-card">
        {loading && <p className="muted">{t('लोड होत आहे…')}</p>}
        {error && <div className="alert alert-error">{error.message}</div>}
        {it && (
          <>
            <p className="muted">{t('नमस्कार,')} {data.officer}</p>
            <h2>{t(it.title)}</h2>
            <p><b>{it.number}</b> <span className={`badge ${STATUS[it.status]?.cls}`}>{t(STATUS[it.status]?.label)}</span></p>
            <dl className="dl">
              <dt>{data.kind === 'application' ? t('अर्जदार') : t('कर्मचारी')}</dt><dd>{it.name || '—'}</dd>
              <dt>{t('प्रभाग')}</dt><dd>{t(it.ward) || '—'}</dd>
              {it.address && <><dt>{t('ठिकाण')}</dt><dd>{it.address}</dd></>}
              {isApp && Object.entries(it.details).map(([k, v]) => <Fragment key={k}><dt>{LABELS[k] ? t(LABELS[k]) : k}</dt><dd>{v}</dd></Fragment>)}
              <dt>{t('नोंद')}</dt><dd>{fmtDate(it.created_at)}</dd>
            </dl>
            {!isApp && (
              <div className="grid-2">
                <figure><figcaption>Before</figcaption>{it.before_photo ? <img className="photo-preview" src={it.before_photo} alt="" /> : '—'}</figure>
                <figure><figcaption>After</figcaption>{it.after_photo ? <img className="photo-preview" src={it.after_photo} alt="" /> : '—'}</figure>
              </div>
            )}

            {done && <div className="alert alert-ok">{t('✔ निर्णय नोंदवला:')} {done === 'approve' ? (isApp ? t('मंजूर') : t('काम मान्य, तक्रार बंद')) : (isApp ? t('नामंजूर') : t('पुन्हा करायला सांगितले'))}</div>}
            {pending && !done && (
              <>
                {needsSign && !data.has_signature && (<><p className="field-label">{t('✍️ स्वाक्षरी (पहिल्यांदाच — पुढच्या वेळी आपोआप वापरली जाईल)')}</p><SignaturePad onChange={setSig} /></>)}
                {needsSign && data.has_signature && <p className="muted small">{t('✔ तुमची जतन केलेली डिजिटल स्वाक्षरी वापरली जाईल')}</p>}
                <textarea rows={2} placeholder={isApp ? t('शेरा (नामंजुरीसाठी आवश्यक)') : t('शेरा (ऐच्छिक)')} value={remark} onChange={(e) => setRemark(e.target.value)} />
                {err && <div className="alert alert-error">{err}</div>}
                <div className="quick-buttons">
                  <button className="btn btn-success btn-xl" disabled={busy || (needsSign && !data.has_signature && !sig)} onClick={() => act('approve')}>
                    ✔ {isApp ? t('मंजूर करा') : t('मान्य — बंद करा')}
                  </button>
                  <button className="btn btn-danger btn-xl" disabled={busy} onClick={() => act('reject')}>
                    ✖ {isApp ? t('नामंजूर') : t('पुन्हा करा')}
                  </button>
                </div>
              </>
            )}
            {!pending && !done && <div className="alert alert-ok">{t('या विषयावर आधीच निर्णय झाला आहे.')}</div>}
          </>
        )}
      </div>
    </div>
  );
}
