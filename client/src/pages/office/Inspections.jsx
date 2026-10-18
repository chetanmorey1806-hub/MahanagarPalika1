// तपासणी भेटी — ठरवा, आज कोणत्या भेटी, भेट पूर्ण (फोटो + आवाजाने निरीक्षणे)
import { useState } from 'react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { fmtDate, fmtDay, useFetch } from '../../utils.js';
import PhotoCapture from '../../components/PhotoCapture.jsx';
import VoiceInput from '../../components/VoiceInput.jsx';
import ExportButtons from '../../components/Export.jsx';

const plus = (n) => new Date(Date.now() + 5.5 * 3600e3 + n * 864e5).toISOString().slice(0, 10);

function DoneForm({ item, onDone }) {
  const t = useT();
  const [findings, setFindings] = useState('');
  const [shot, setShot] = useState(null);
  const [err, setErr] = useState('');
  const save = async () => {
    try { await api.post(`/inspections/${item.id}/done`, { findings, photo: shot?.dataUrl, meta: shot?.meta }); onDone(); } catch (e) { setErr(e.message); }
  };
  return (
    <div className="sub-card">
      <PhotoCapture label={`${t('तपासणी')} · ${t(item.title)}`} onCapture={setShot} />
      <VoiceInput value={findings} onChange={setFindings} placeholder={t('🎤 तपासणीत काय आढळले ते बोला / लिहा')} />
      {err && <div className="alert alert-error">{err}</div>}
      <button className="btn btn-success" onClick={save}>✔ {t('भेट पूर्ण')}</button>
    </div>
  );
}

export default function Inspections() {
  const t = useT();
  const [when, setWhen] = useState('today');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);
  const [f, setF] = useState({ title: '', purpose: '', location: '', scheduled_date: plus(0), scheduled_time: '11:00' });
  const { data, reload } = useFetch(() => api.get(`/inspections?when=${when}`), [when]);

  const add = async (e) => {
    e.preventDefault();
    await api.post('/inspections', f);
    setAdding(false); setF({ ...f, title: '', purpose: '', location: '' }); reload();
  };

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">🔎 {t('तपासणी भेटी')}</h2>
        <div className="row-gap" style={{ marginBottom: 0 }}>
          <ExportButtons rows={data || []} filename="inspections" title="तपासणी भेटी" columns={[['scheduled_date', 'तारीख'], ['scheduled_time', 'वेळ'], ['title', 'विषय'], ['location', 'ठिकाण'], ['status', 'स्थिती'], ['findings', 'निरीक्षणे']]} />
          <button className="btn btn-primary" onClick={() => setAdding(!adding)}>{adding ? t('रद्द') : t('+ भेट ठरवा')}</button>
        </div>
      </div>
      {adding && (
        <form className="card" onSubmit={add}>
          <div className="grid-3">
            <label>{t('विषय')}<input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t('उदा. सार्वजनिक शौचालय तपासणी')} /></label>
            <label>{t('ठिकाण')}<input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
            <label>{t('उद्देश')}<input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></label>
            <label>{t('तारीख')}<input type="date" min={plus(0)} value={f.scheduled_date} onChange={(e) => setF({ ...f, scheduled_date: e.target.value })} /></label>
            <label>{t('वेळ')}<input type="time" value={f.scheduled_time} onChange={(e) => setF({ ...f, scheduled_time: e.target.value })} /></label>
          </div>
          <button className="btn btn-primary">{t('जतन करा')}</button>
        </form>
      )}
      <div className="tabs">
        {[['today', 'आज'], ['upcoming', 'पुढील'], ['missed', 'राहिलेल्या'], ['done', 'पूर्ण']].map(([k, l]) => <button key={k} className={when === k ? 'active' : ''} onClick={() => setWhen(k)}>{t(l)}</button>)}
      </div>
      {data?.length === 0 && <div className="card empty">{t('काहीही नाही')}</div>}
      <div className="list">
        {data?.map((i) => (
          <div key={i.id} className="card list-item">
            <div className="page-head">
              <strong>📌 {t(i.title)}</strong>
              <span className="muted">{fmtDay(i.scheduled_date)} {i.scheduled_time || ''}</span>
            </div>
            <span>{t(i.location || '')} {i.purpose && `· ${t(i.purpose)}`}</span>
            {i.status === 'done' && <span>✔ {t(i.findings)} <small className="muted">({fmtDate(i.done_at)})</small></span>}
            {i.photo && <img className="photo-preview" src={i.photo} alt="" />}
            {i.status === 'scheduled' && (
              <div className="row-gap" style={{ marginTop: 6 }}>
                <button className="btn btn-sm btn-success" onClick={() => setOpen(open === i.id ? null : i.id)}>✔ {t('भेट पूर्ण करा')}</button>
                <button className="btn btn-sm btn-light" onClick={async () => { await api.post(`/inspections/${i.id}/cancel`); reload(); }}>{t('रद्द')}</button>
              </div>
            )}
            {open === i.id && <DoneForm item={i} onDone={() => { setOpen(null); reload(); }} />}
          </div>
        ))}
      </div>
    </div>
  );
}
