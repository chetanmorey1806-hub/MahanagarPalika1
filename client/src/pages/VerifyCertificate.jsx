import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { fmtDate } from '../utils.js';
import PublicHeader from '../components/PublicHeader.jsx';
import { useT } from '../i18n/index.jsx';

export default function VerifyCertificate() {
  const t = useT();
  const { appNo } = useParams();
  const [no, setNo] = useState(appNo || '');
  const [res, setRes] = useState(null);
  const [error, setError] = useState('');

  const check = async (n = no) => {
    setError(''); setRes(null);
    try { setRes(await api.get(`/approvals/verify/${encodeURIComponent(n.trim())}`)); } catch (e) { setError(e.message); }
  };
  useEffect(() => { if (appNo) check(appNo); }, [appNo]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="public-page">
      <PublicHeader title="दाखला / परवाना पडताळणी" />
      <div className="card form-card">
        <form className="row-gap" onSubmit={(e) => { e.preventDefault(); check(); }}>
          <input value={no} onChange={(e) => setNo(e.target.value.toUpperCase())} placeholder="BRT-2026-00001" />
          <button className="btn btn-primary">{t('तपासा')}</button>
        </form>
        {error && <div className="alert alert-error">{error}</div>}
        {res && (
          <div className={`alert ${res.valid ? 'alert-ok' : 'alert-error'}`}>
            <h3>{res.valid ? t('✔ हा दाखला खरा आहे') : t('✖ डिजिटल स्वाक्षरी जुळत नाही — दाखल्यात बदल झाला असू शकतो')}</h3>
            <p>{t(res.type)} · {res.app_no}</p>
            <p>{t('अर्जदार:')} <b>{res.applicant_name}</b></p>
            <p>{t('मंजूर करणारे:')} {res.officer_name} ({t(res.designation)}) · {fmtDate(res.decided_at)}</p>
          </div>
        )}
        <p className="center muted"><Link to="/login">{t('लॉगिन')}</Link></p>
      </div>
    </div>
  );
}
