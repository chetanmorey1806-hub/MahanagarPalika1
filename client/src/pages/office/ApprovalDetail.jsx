// अर्ज तपशील + डिजिटल स्वाक्षरीने एका क्लिकवर मंजुरी + छापण्यायोग्य दाखला
import { Fragment, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { STATUS, fmtDate, fmtDay, useFetch } from '../../utils.js';
import SignaturePad from '../../components/SignaturePad.jsx';
import { useT } from '../../i18n/index.jsx';

const LABELS = {
  child_name: 'बाळाचे नाव', dob: 'जन्म तारीख', hospital: 'रुग्णालय', father_name: 'वडिलांचे नाव', mother_name: 'आईचे नाव',
  deceased_name: 'मृत व्यक्तीचे नाव', date_of_death: 'मृत्यू तारीख', place: 'ठिकाण',
  survey_no: 'सर्व्हे नं.', area_sqft: 'क्षेत्र (चौ. फूट)', floors: 'मजले', shop_name: 'दुकानाचे नाव', business: 'व्यवसाय',
  property_no: 'मालमत्ता क्र.', connection_size: 'जोडणी आकार',
};

export default function ApprovalDetail() {
  const t = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const { data: a, loading, error, reload } = useFetch(() => api.get(`/approvals/${id}`), [id]);
  const [sig, setSig] = useState(null);
  const [remark, setRemark] = useState('');
  const [err, setErr] = useState('');
  const [qr, setQr] = useState(null);
  const verifyUrl = a ? `${window.location.origin}/verify/${a.app_no}` : '';
  useEffect(() => { if (verifyUrl) QRCode.toDataURL(verifyUrl, { width: 220, margin: 1 }).then(setQr); }, [verifyUrl]);

  if (loading && !a) return <p className="muted">{t('लोड होत आहे…')}</p>;
  if (error) return <div className="alert alert-error">{error.message}</div>;

  const decide = async (decision) => {
    setErr('');
    try { await api.post(`/approvals/${id}/decide`, { decision, remark, signature: sig }); reload(); } catch (e) { setErr(e.message); }
  };

  return (
    <div>
      <button className="btn btn-ghost no-print" onClick={() => nav(-1)}>{t('‹ मागे')}</button>
      {a.status === 'approved' ? (
        <div className="certificate">
          <div className="cert-head">
            <div className="cert-emblem"><img src="/logo.png" alt="" /></div>
            <h1>{t('अमरावती महानगरपालिका')}</h1>
            <h2>{t(a.type_name)}</h2>
            <small>{t('प्रमाणपत्र क्र. {no}', { no: a.app_no })}</small>
          </div>
          <p>{t('प्रमाणित करण्यात येते की खालील माहिती महानगरपालिकेच्या नोंदवहीत नोंदवलेली आहे:')}</p>
          <dl className="dl">
            <dt>{t('अर्जदार')}</dt><dd>{a.applicant_name}</dd>
            {Object.entries(a.details).map(([k, v]) => <Fragment key={k}><dt>{LABELS[k] ? t(LABELS[k]) : k}</dt><dd>{v}</dd></Fragment>)}
            <dt>{t('प्रभाग')}</dt><dd>{t(a.ward_name)}</dd>
            <dt>{t('दिनांक')}</dt><dd>{fmtDay(a.decided_at)}</dd>
          </dl>
          <div className="cert-foot">
            <div className="cert-verify">
              {qr && <img alt="QR" src={qr} />}
              <small>{t('पडताळणी:')} {verifyUrl}</small>
              <small className="hash">SHA-256: {a.sign_hash?.slice(0, 32)}…</small>
            </div>
            <div className="cert-sign">
              {a.signature_path && <img src={a.signature_path} alt={t('सही')} />}
              <b>{a.officer_name}</b>
              <small>{t(a.officer_designation)}</small>
              <small>{t('डिजिटल स्वाक्षरी')} · {fmtDate(a.decided_at)}</small>
            </div>
          </div>
          <button className="btn btn-primary no-print" onClick={() => window.print()}>{t('🖨️ छापा / PDF')}</button>
        </div>
      ) : (
        <div className="grid-2">
          <div className="card">
            <h2>{t(a.type_name)} <span className={`badge ${STATUS[a.status].cls}`}>{t(STATUS[a.status].label)}</span></h2>
            <dl className="dl">
              <dt>{t('अर्ज क्र.')}</dt><dd>{a.app_no}</dd>
              <dt>{t('अर्जदार')}</dt><dd>{a.applicant_name}</dd>
              <dt>{t('मोबाईल')}</dt><dd>{a.applicant_mobile || '—'}</dd>
              <dt>{t('प्रभाग')}</dt><dd>{t(a.ward_name)}</dd>
              {Object.entries(a.details).map(([k, v]) => <Fragment key={k}><dt>{LABELS[k] ? t(LABELS[k]) : k}</dt><dd>{v}</dd></Fragment>)}
              <dt>{t('अर्ज दिनांक')}</dt><dd>{fmtDate(a.created_at)}</dd>
              {a.remark && <><dt>{t('शेरा')}</dt><dd>{a.remark}</dd></>}
            </dl>
          </div>
          {a.status === 'pending' && !a.can_decide && (
            <div className="card"><p>{t('⏳ हा अर्ज संबंधित अधिकाऱ्याकडे मंजुरीसाठी पाठवला आहे. मंजूर झाल्यावर येथे दाखला छापता येईल.')}</p></div>
          )}
          {a.status === 'pending' && a.can_decide && (
            <div className="card">
              <h3 className="card-title">{t('✍️ डिजिटल स्वाक्षरी')}</h3>
              <SignaturePad onChange={setSig} />
              <textarea rows={2} placeholder={t('शेरा (नामंजुरीसाठी आवश्यक)')} value={remark} onChange={(e) => setRemark(e.target.value)} />
              {err && <div className="alert alert-error">{err}</div>}
              <div className="row-gap">
                <button className="btn btn-success btn-xl" disabled={!sig} onClick={() => decide('approved')}>{t('✔ मंजूर करा')}</button>
                <button className="btn btn-danger" onClick={() => decide('rejected')}>{t('✖ नामंजूर')}</button>
              </div>
              <p className="muted small">{t('मंजुरीनंतर दाखल्याचा SHA-256 हॅश साठवला जातो — QR स्कॅन करून कोणीही खरेपणा तपासू शकतो. (Aadhaar e-Sign साठी ESP integration पुढील टप्प्यात.)')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
