// आपत्कालीन घटना — कळवा, लाईव्ह फीड, घटनास्थळावरील अपडेट, बंद करा
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useT } from '../../i18n/index.jsx';
import { useLive } from '../../live.js';
import { fmtDate, getLocation, useFetch } from '../../utils.js';
import PhotoCapture from '../../components/PhotoCapture.jsx';
import VoiceInput from '../../components/VoiceInput.jsx';

const SEV = { critical: ['अतिगंभीर', 'b-rejected'], high: ['गंभीर', 'b-new'], medium: ['मध्यम', 'b-assigned'] };

function Report({ types, onDone }) {
  const t = useT();
  const [f, setF] = useState({ type: 'tree_fall', severity: 'high', title: '', location: '', description: '' });
  const [shot, setShot] = useState(null);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const loc = shot?.meta || (await getLocation().catch(() => null));
      await api.post('/emergencies', { ...f, lat: loc?.lat, lng: loc?.lng, photo: shot?.dataUrl });
      onDone();
    } catch (x) { setErr(x.message); }
  };
  return (
    <form className="card emergency-form" onSubmit={submit}>
      <h3 className="card-title">🚨 {t('आपत्कालीन घटना कळवा')}</h3>
      <div className="icon-grid">
        {Object.entries(types).map(([k, v]) => (
          <button type="button" key={k} className={`icon-tile ${f.type === k ? 'active' : ''}`} onClick={() => setF({ ...f, type: k })}><span className="tile-icon">{v.icon}</span><span>{t(v.name)}</span></button>
        ))}
      </div>
      <div className="grid-3" style={{ marginTop: 12 }}>
        <label>{t('शीर्षक')}<input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label>{t('ठिकाण')}<input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
        <label>{t('गंभीरता')}<select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>{Object.entries(SEV).map(([k, [l]]) => <option key={k} value={k}>{t(l)}</option>)}</select></label>
      </div>
      <VoiceInput rows={2} value={f.description} onChange={(v) => setF((x) => ({ ...x, description: v }))} placeholder={t('🎤 काय झाले ते सांगा')} />
      <PhotoCapture label={t('आपत्कालीन घटना')} onCapture={setShot} />
      {err && <div className="alert alert-error">{err}</div>}
      <button className="btn btn-danger btn-xl btn-block">🚨 {t('लगेच कळवा — आयुक्त व प्रभाग अधिकाऱ्यांना सूचना जाईल')}</button>
    </form>
  );
}

function Detail({ id, onChange }) {
  const t = useT();
  const { user } = useAuth();
  const { data: e, reload } = useFetch(() => api.get(`/emergencies/${id}`), [id]);
  const [note, setNote] = useState('');
  useLive('emergency', useCallback((p) => { if (p.id === id) reload(); }, [id, reload]));
  if (!e) return null;
  const add = async () => { if (!note.trim()) return; await api.post(`/emergencies/${id}/updates`, { note }); setNote(''); reload(); };
  const resolve = async () => { await api.post(`/emergencies/${id}/resolve`, {}); reload(); onChange(); };
  return (
    <div className="card">
      <div className="page-head"><h3 className="card-title" style={{ margin: 0 }}>{e.icon} {t(e.title)}</h3>
        <span className={`badge ${e.status === 'active' ? SEV[e.severity][1] : 'b-resolved'}`}>{e.status === 'active' ? t(SEV[e.severity][0]) : t('बंद')}</span></div>
      <p className="muted">{t(e.type_name)} · {t(e.location || '')} · {t(e.ward_name || '')} · {fmtDate(e.created_at)} · {e.reported_by_name}</p>
      {e.description && <p>{t(e.description)}</p>}
      {e.photo && <img className="photo-preview" src={e.photo} alt="" />}
      {e.status === 'active' && (
        <div className="row-gap">
          <input placeholder={t('घटनास्थळावरील अपडेट लिहा…')} value={note} onChange={(x) => setNote(x.target.value)} />
          <button className="btn btn-primary" onClick={add}>{t('अपडेट द्या')}</button>
          {['officer', 'admin'].includes(user.role) && <button className="btn btn-success" onClick={resolve}>✔ {t('नियंत्रणात — बंद करा')}</button>}
        </div>
      )}
      <ul className="timeline">{e.updates.map((u) => <li key={u.id}><b>{t(u.note)}</b><br /><small className="muted">{u.user_name} · {fmtDate(u.created_at)}</small></li>)}</ul>
    </div>
  );
}

export default function Emergencies() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('active');
  const [adding, setAdding] = useState(false);
  const types = useFetch(() => api.get('/emergencies/types'));
  const { data, reload } = useFetch(() => api.get(`/emergencies?status=${status}`), [status]);
  const sel = Number(params.get('id')) || null;
  useLive('emergency', useCallback(() => reload(), [reload]));
  useEffect(() => { if (!sel && data?.[0] && status === 'active') setParams({ id: data[0].id }, { replace: true }); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const located = (data || []).filter((e) => e.lat);

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">🚨 {t('आपत्कालीन व्यवस्थापन')}</h2>
        <button className="btn btn-danger" onClick={() => setAdding(!adding)}>{adding ? t('रद्द') : t('+ घटना कळवा')}</button>
      </div>
      {adding && types.data && <Report types={types.data} onDone={() => { setAdding(false); setStatus('active'); reload(); }} />}
      <div className="tabs">
        {[['active', 'सुरू असलेल्या'], ['resolved', 'बंद'], ['all', 'सर्व']].map(([k, l]) => <button key={k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>{t(l)}</button>)}
      </div>
      <div className="grid-2">
        <div>
          {data?.length === 0 && <div className="card empty">✅ {t('सध्या कोणतीही आपत्कालीन घटना नाही')}</div>}
          {data?.map((e) => (
            <button key={e.id} type="button" className={`card crit-row em-item sev-${e.severity} ${sel === e.id ? 'sel' : ''}`} onClick={() => setParams({ id: e.id })}>
              <span className="crit-icon">{e.icon}</span>
              <span className="crit-main"><b>{t(e.title)}</b><small>{t(e.location || '')} · {fmtDate(e.created_at)} · {e.update_count} {t('अपडेट')}</small></span>
              <span className={`badge ${e.status === 'active' ? SEV[e.severity][1] : 'b-resolved'}`}>{e.status === 'active' ? t(SEV[e.severity][0]) : t('बंद')}</span>
            </button>
          ))}
          {located.length > 0 && (
            <div className="card map-card">
              <MapContainer center={[located[0].lat, located[0].lng]} zoom={12} style={{ height: 280 }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
                {located.map((e) => (
                  <CircleMarker key={e.id} center={[e.lat, e.lng]} radius={11} pathOptions={{ color: e.status === 'active' ? '#d9403f' : '#12a150', fillOpacity: 0.6 }} eventHandlers={{ click: () => setParams({ id: e.id }) }}>
                    <Popup>{e.icon} {t(e.title)}</Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          )}
        </div>
        {sel && <Detail id={sel} onChange={reload} />}
      </div>
    </div>
  );
}
