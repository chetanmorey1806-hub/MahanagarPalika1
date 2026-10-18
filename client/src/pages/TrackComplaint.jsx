import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { STATUS, fmtDate } from '../utils.js';
import Stars from '../components/Stars.jsx';
import PublicHeader from '../components/PublicHeader.jsx';
import { useT } from '../i18n/index.jsx';

export default function TrackComplaint() {
  const t = useT();
  const [params] = useSearchParams();
  const [ticket, setTicket] = useState(params.get('t') || '');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [mobile, setMobile] = useState('');
  const [rateMsg, setRateMsg] = useState(null);

  const rate = async (e) => {
    e.preventDefault();
    setRateMsg(null);
    try {
      await api.post(`/grievances/public/rate/${data.ticket_no}`, { rating, feedback, mobile });
      setRateMsg({ ok: true, text: t('🙏 धन्यवाद! तुमचा अभिप्राय नोंदवला.') });
      setData({ ...data, citizen_rating: rating });
    } catch (x) { setRateMsg({ ok: false, text: x.message }); }
  };

  const find = async (t = ticket) => {
    setError('');
    setData(null);
    try { setData(await api.get(`/grievances/public/track/${encodeURIComponent(t.trim())}`)); } catch (e) { setError(e.message); }
  };
  useEffect(() => { if (params.get('t')) find(params.get('t')); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="public-page">
      <PublicHeader title="तक्रार स्थिती" />
      <div className="card form-card">
        <form className="row-gap" onSubmit={(e) => { e.preventDefault(); find(); }}>
          <input value={ticket} onChange={(e) => setTicket(e.target.value.toUpperCase())} placeholder="GRV-2026-00001" />
          <button className="btn btn-primary">{t('शोधा')}</button>
        </form>
        {error && <div className="alert alert-error">{error}</div>}
        {data && (
          <div className="track-result">
            <h3>{data.ticket_no} <span className={`badge ${STATUS[data.status].cls}`}>{t(STATUS[data.status].label)}</span></h3>
            <p><b>{t('प्रकार:')}</b> {t(data.category)} · <b>{t('प्रभाग:')}</b> {t(data.ward)}</p>
            <p><b>{t('नोंद:')}</b> {fmtDate(data.created_at)} · <b>{t('अपेक्षित:')}</b> {fmtDate(data.sla_due_at)}</p>
            {data.resolved_at && <p><b>{t('निराकरण:')}</b> {fmtDate(data.resolved_at)}</p>}
            {data.after_photo && <img className="photo-preview" src={data.after_photo} alt={t('काम पूर्ण')} />}
            {['resolved', 'closed'].includes(data.status) && (data.citizen_rating ? (
              <p>{t('तुमचे रेटिंग:')} <Stars value={data.citizen_rating} /></p>
            ) : (
              <form className="sub-card" onSubmit={rate}>
                <b>{t('कामाबद्दल समाधानी आहात? रेटिंग द्या')}</b>
                <Stars value={rating} onChange={setRating} size={34} />
                <input inputMode="numeric" maxLength={10} placeholder={t('तक्रार नोंदवलेला मोबाईल नंबर')} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} required />
                <input placeholder={t('अभिप्राय (ऐच्छिक)')} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
                <button className="btn btn-primary" disabled={!rating}>{t('पाठवा')}</button>
              </form>
            ))}
            {rateMsg && <div className={`alert ${rateMsg.ok ? 'alert-ok' : 'alert-error'}`}>{rateMsg.text}</div>}
          </div>
        )}
        <p className="center muted"><Link to="/complaint">{t('नवीन तक्रार')}</Link> · <Link to="/login">{t('लॉगिन')}</Link></p>
      </div>
    </div>
  );
}
