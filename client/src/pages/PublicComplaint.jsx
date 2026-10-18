// नागरिक तक्रार फॉर्म (सार्वजनिक) — आणि staff साठी हेल्पलाईन/WhatsApp तक्रार नोंद
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { fmtDate, getLocation } from '../utils.js';
import PhotoCapture from '../components/PhotoCapture.jsx';
import VoiceInput from '../components/VoiceInput.jsx';
import PublicHeader from '../components/PublicHeader.jsx';
import { useT } from '../i18n/index.jsx';

export default function PublicComplaint({ staff = false }) {
  const t = useT();
  const [masters, setMasters] = useState({ wards: [], categories: [] });
  const [form, setForm] = useState({ category_id: null, citizen_name: '', citizen_mobile: '', address: '', description: '', ward_id: '', source: 'helpline' });
  const [loc, setLoc] = useState(null);
  const [locMsg, setLocMsg] = useState('');
  const [photo, setPhoto] = useState(null);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/masters/public').then(setMasters).catch((e) => setError(e.message)); }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const detect = async () => {
    setLocMsg(t('⏳ लोकेशन घेत आहे…'));
    try {
      const l = await getLocation();
      setLoc(l);
      setLocMsg(t('📍 लोकेशन मिळाले (±{n} मी.)', { n: l.accuracy }));
    } catch (e) { setLocMsg(e.message); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.category_id) return setError(t('तक्रारीचा प्रकार निवडा'));
    if (!loc && !form.ward_id) return setError(t('लोकेशन घ्या किंवा प्रभाग निवडा'));
    setBusy(true);
    setError('');
    try {
      const body = { ...form, ward_id: form.ward_id ? Number(form.ward_id) : null, lat: loc?.lat, lng: loc?.lng, photo: photo?.dataUrl };
      setDone(await api.post(staff ? '/grievances' : '/grievances/public', body));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className={staff ? '' : 'public-page'}>
        <div className="card center-card">
          <div className="big-emoji">✅</div>
          <h2>{t('तक्रार नोंदवली गेली')}</h2>
          <p>{t('तुमचा तिकीट क्रमांक')}</p>
          <div className="ticket">{done.ticket_no}</div>
          <p className="muted">{t('अपेक्षित निराकरण: {date} पर्यंत', { date: fmtDate(done.sla_due_at) })}</p>
          <p className="muted">{t('तक्रार संबंधित प्रभाग अधिकारी व कर्मचाऱ्याकडे आपोआप पाठवली गेली आहे.')}</p>
          <div className="row-gap">
            <button className="btn btn-primary" onClick={() => { setDone(null); setPhoto(null); setForm({ ...form, category_id: null, description: '', address: '' }); }}>{t('आणखी तक्रार')}</button>
            {!staff && <Link className="btn btn-light" to={`/track?t=${done.ticket_no}`}>{t('स्थिती पहा')}</Link>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={staff ? '' : 'public-page'}>
      {!staff && <PublicHeader title="नागरिक तक्रार" />}
      <form className="card form-card" onSubmit={submit}>
        <h2>{staff ? t('नवीन तक्रार नोंद (हेल्पलाईन / WhatsApp / प्रत्यक्ष)') : t('तक्रार नोंदवा')}</h2>
        <div className="field-label">{t('१. समस्या निवडा')}</div>
        <div className="icon-grid">
          {masters.categories.map((c) => (
            <button type="button" key={c.id} className={`icon-tile ${form.category_id === c.id ? 'active' : ''}`} onClick={() => setForm({ ...form, category_id: c.id })}>
              <span className="tile-icon">{c.icon}</span>
              <span>{t(c.name)}</span>
              <small>{t('{n} तासांत', { n: c.sla_hours })}</small>
            </button>
          ))}
        </div>

        <div className="field-label">{t('२. ठिकाण')}</div>
        <div className="row-gap">
          <button type="button" className="btn btn-light" onClick={detect}>{t('📍 माझे सध्याचे लोकेशन घ्या')}</button>
          <span className="muted">{locMsg}</span>
        </div>
        <div className="grid-2">
          <label>{t('किंवा प्रभाग निवडा')}
            <select value={form.ward_id} onChange={set('ward_id')}>
              <option value="">{t('— लोकेशनवरून आपोआप —')}</option>
              {masters.wards.map((w) => <option key={w.id} value={w.id}>{t(w.name)}</option>)}
            </select>
          </label>
          <label>{t('पत्ता / खूण')}
            <input value={form.address} onChange={set('address')} placeholder={t('उदा. गणपती मंदिराजवळ, गल्ली क्र. ३')} />
          </label>
        </div>

        <div className="field-label">{t('३. माहिती')}</div>
        <div className="grid-2">
          <label>{t('नाव')}<input value={form.citizen_name} onChange={set('citizen_name')} required={!staff} /></label>
          <label>{t('मोबाईल नंबर')}<input inputMode="numeric" maxLength={10} value={form.citizen_mobile} onChange={(e) => setForm({ ...form, citizen_mobile: e.target.value.replace(/\D/g, '') })} required={!staff} /></label>
        </div>
        {staff && (
          <label>{t('तक्रार कुठून आली')}
            <select value={form.source} onChange={set('source')}>
              <option value="helpline">{t('📞 हेल्पलाईन')}</option>
              <option value="whatsapp">💬 WhatsApp</option>
              <option value="walkin">{t('🚶 प्रत्यक्ष कार्यालयात')}</option>
              <option value="staff">{t('🧑‍💼 कर्मचारी निरीक्षण')}</option>
            </select>
          </label>
        )}
        <label>{t('तक्रारीचे वर्णन (🎤 बोलूनही लिहू शकता)')}</label>
        <VoiceInput value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder={t('समस्या थोडक्यात सांगा…')} />
        <div className="field-label">{t('४. फोटो (ऐच्छिक)')}</div>
        <PhotoCapture label="नागरिक तक्रार" onCapture={setPhoto} />

        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn btn-primary btn-xl btn-block" disabled={busy}>{busy ? t('पाठवत आहे…') : t('तक्रार पाठवा')}</button>
        {!staff && <p className="center muted"><Link to="/login">{t('कर्मचारी लॉगिन')}</Link> · <Link to="/track">{t('तक्रार स्थिती')}</Link></p>}
      </form>
    </div>
  );
}
