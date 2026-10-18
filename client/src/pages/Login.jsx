// लॉगिन — BK पोर्टल पद्धत: डावीकडे ओळख, उजवीकडे लॉगिन कार्ड
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { useT } from '../i18n/index.jsx';
import { LangSwitch, ThemeToggle } from '../components/HeaderTools.jsx';

const DEMO = [
  ['आयुक्त', '9000000001', 'admin123'],
  ['विभाग प्रमुख', '9000000002', 'officer123'],
  ['वॉर्ड अधिकारी', '9200000011', 'officer123'],
  ['लिपिक (काउंटर)', '9400000011', 'clerk123'],
  ['सफाई कर्मचारी', '9100000001', 'worker123'],
  ['पाणी कर्मचारी / मीटर रीडर', '9100000004', 'worker123'],
];
const FEATS = ['📍 GPS हजेरी', '📸 फोटो पुरावा', '🎤 मराठी आवाज', '📴 ऑफलाईन', '💬 WhatsApp मंजुरी', '📊 Live डॅशबोर्ड'];

export default function Login() {
  const t = useT();
  const { login } = useAuth();
  const nav = useNavigate();
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(mobile, password);
      nav('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-top"><LangSwitch variant="chip" /><ThemeToggle variant="chip" /></div>

      <section className="login-hero">
        <div className="login-brand">
          <span className="mark"><img src="/logo.png" alt="" /></span>
          <div>
            <b>{t('अमरावती महानगरपालिका')}</b>
            <small>{t('ई-गव्हर्नन्स प्रणाली')}</small>
          </div>
        </div>
        <span className="secure-chip"><ShieldCheck size={15} /> {t('सुरक्षित पोर्टल')}</span>
        <h2>{t('कागदमुक्त, पारदर्शक')} <em>{t('आणि वेगवान कारभार')}</em></h2>
        <p>{t('कर्मचारी, अधिकारी व प्रशासन — सर्व कामे एकाच प्रणालीत.')}<br />{t('तुमच्या भूमिकेनुसार डॅशबोर्ड तयार आहे.')}</p>
        <div className="login-feats">{FEATS.map((f) => <span key={f}>{t(f)}</span>)}</div>
        <div className="amc-facts">
          <div><b>{t('१५ ऑगस्ट १९८३')}</b><small>{t('स्थापना')}</small></div>
          <div><b>{t('४३')}</b><small>{t('प्रभाग')}</small></div>
          <div><b>{t('८७')}</b><small>{t('नगरसेवक')}</small></div>
          <div className="motto"><b>{t('योगः कर्मसु कौशलम्')}</b><small>{t('ब्रीदवाक्य')}</small></div>
        </div>
      </section>

      <div className="login-card">
        <div className="login-logo"><img src="/logo.png" alt="" /></div>
        <div className="signin-chip"><LogIn size={15} /> {t('लॉगिन')}</div>
        <h1>{t('नमस्कार!')}</h1>
        <p className="muted">{t('मोबाईल नंबर व पासवर्ड टाकून पुढे जा.')}</p>
        <form onSubmit={submit}>
          <label>{t('मोबाईल नंबर')}
            <input inputMode="numeric" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} placeholder={t('१० अंकी मोबाईल')} required />
          </label>
          <label>{t('पासवर्ड')}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-primary btn-block btn-xl" disabled={busy}><LogIn size={18} /> {busy ? t('थांबा…') : t('लॉगिन करा')}</button>
        </form>
        <div className="demo-box">
          <small className="muted">{t('Demo लॉगिन (क्लिक करा):')}</small>
          <div className="demo-grid">
            {DEMO.map(([label, m, p]) => (
              <button key={m} type="button" className="btn btn-sm btn-light" onClick={() => { setMobile(m); setPassword(p); }}>{t(label)}</button>
            ))}
          </div>
        </div>
        <div className="login-links">
          <Link to="/complaint">📢 {t('नागरिक तक्रार नोंदवा')}</Link>
          <Link to="/track">🔎 {t('तक्रार स्थिती पहा')}</Link>
          <Link to="/verify">✅ {t('दाखला पडताळणी')}</Link>
          <Link to="/pay-tax">💰 {t('मालमत्ता कर थकबाकी')}</Link>
          <Link to="/training" className="training-link">🎬 {t('प्रशिक्षण व्हिडिओ पहा / डाऊनलोड करा')}</Link>
        </div>
      </div>
    </div>
  );
}
