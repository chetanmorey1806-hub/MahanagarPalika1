// वाहन ट्रॅकिंग: नकाशा (Live GPS), मार्ग, इंधन नोंद, कचरा फेरी नोंद
import { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMapEvents } from 'react-leaflet';
import { api } from '../../api.js';
import { STATUS, VEHICLE, fmtDate, fmtMoney, useFetch } from '../../utils.js';
import { useT } from '../../i18n/index.jsx';

const COLORS = { running: '#2e9e5b', idle: '#f0a020', maintenance: '#d64545' };
const ALERT = { off_route: '🛑 मार्गाबाहेर', missed_checkpoint: '📍 गल्ली चुकवली', overspeed: '⚡ जास्त वेग', no_signal: '📡 सिग्नल नाही' };

function ClickCapture({ onClick }) {
  useMapEvents({ click: (e) => onClick(e.latlng) });
  return null;
}

// नकाशावर क्लिक करून ठरलेला मार्ग व checkpoints आखा
function RouteEditor({ v, draft, setDraft, onSaved, onCancel }) {
  const t = useT();
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    try {
      await api.post(`/fleet/${v.id}/route`, {
        name: draft.name, path: draft.path, tolerance_m: +draft.tolerance_m, shift_start: draft.shift_start, shift_end: draft.shift_end,
        checkpoints: draft.checkpoints,
      });
      onSaved();
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="card">
      <h3 className="card-title">✏️ {v.reg_no} — {t('ठरलेला मार्ग आखा')}</h3>
      <p className="muted small">{t('नकाशावर क्लिक करा:')} <b>{draft.mode === 'path' ? t('मार्गाचा बिंदू') : t('थांबा / गल्ली (checkpoint)')}</b> {t('जोडला जाईल.')} {t('बिंदू:')} {draft.path.length} · {t('थांबे:')} {draft.checkpoints.length}</p>
      <div className="row-gap">
        <button className={`btn btn-sm ${draft.mode === 'path' ? 'btn-primary' : 'btn-light'}`} onClick={() => setDraft({ ...draft, mode: 'path' })}>{t('〰 मार्ग')}</button>
        <button className={`btn btn-sm ${draft.mode === 'cp' ? 'btn-primary' : 'btn-light'}`} onClick={() => setDraft({ ...draft, mode: 'cp' })}>{t('📍 थांबा')}</button>
        <button className="btn btn-sm btn-light" onClick={() => setDraft({ ...draft, path: draft.path.slice(0, -1) })}>{t('↶ शेवटचा बिंदू काढा')}</button>
      </div>
      <div className="grid-3">
        <label>{t('मार्गाचे नाव')}<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>{t('परवानगी अंतर (मी.)')}<input type="number" value={draft.tolerance_m} onChange={(e) => setDraft({ ...draft, tolerance_m: e.target.value })} /></label>
        <label>{t('पाळी सुरू')}<input type="time" value={draft.shift_start} onChange={(e) => setDraft({ ...draft, shift_start: e.target.value })} /></label>
        <label>{t('पाळी संपते')}<input type="time" value={draft.shift_end} onChange={(e) => setDraft({ ...draft, shift_end: e.target.value })} /></label>
      </div>
      {draft.checkpoints.map((c, i) => (
        <div key={i} className="row-gap">
          <input value={c.name} onChange={(e) => setDraft({ ...draft, checkpoints: draft.checkpoints.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
          <button className="btn btn-sm btn-light" onClick={() => setDraft({ ...draft, checkpoints: draft.checkpoints.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      {err && <div className="alert alert-error">{err}</div>}
      <div className="row-gap">
        <button className="btn btn-primary" disabled={draft.path.length < 2} onClick={save}>{t('💾 मार्ग जतन करा')}</button>
        <button className="btn btn-light" onClick={onCancel}>{t('रद्द')}</button>
      </div>
    </div>
  );
}

function VehiclePanel({ v, route, onClose, onSaved, onEditRoute }) {
  const t = useT();
  const fuel = useFetch(() => api.get(`/fleet/${v.id}/fuel`), [v.id]);
  const [f, setF] = useState({ litres: '', amount: '', odometer_km: '' });
  const [tonnes, setTonnes] = useState('');
  const [err, setErr] = useState('');

  const save = async (url, body, reset) => {
    setErr('');
    try { await api.post(url, body); reset(); fuel.reload(); onSaved(); } catch (e) { setErr(e.message); }
  };

  return (
    <div className="card">
      <div className="page-head">
        <h3 className="card-title">{t(VEHICLE[v.type])} · {v.reg_no}</h3>
        <button className="btn btn-sm btn-ghost" onClick={onClose}>✕</button>
      </div>
      <p className="muted">{t('चालक:')} {v.driver_name} {v.driver_mobile && <a href={`tel:${v.driver_mobile}`}>📞</a>} · {t(v.ward_name)} · {t('शेवटचे सिग्नल:')} {fmtDate(v.last_seen)}</p>
      <div className="sub-card">
        <div className="row-gap" style={{ marginBottom: 0 }}>
          <b>{t('🗺️ ठरलेला मार्ग:')} {route ? `${route.name} (${route.shift_start}–${route.shift_end}, ±${t('{m} मी.', { m: route.tolerance_m })})` : t('नाही')}</b>
          {route?.completed_at && <span className="badge b-resolved">✅ {t('मार्ग पूर्ण')} {new Date(route.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          <button className="btn btn-sm btn-light" onClick={onEditRoute}>✏️ {route ? t('बदला') : t('आखा')}</button>
        </div>
        {route?.checkpoints.length > 0 && (
          <div className="cp-list">
            {route.checkpoints.map((c) => (
              <span key={c.id} className={`badge ${c.visited ? 'b-resolved' : 'b-rejected'}`}>{c.visited ? '✔' : '✖'} {c.name}{c.visited_at ? ` ${new Date(c.visited_at).toLocaleTimeString('mr-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
            ))}
          </div>
        )}
      </div>
      <div className="grid-2">
        <form className="sub-card" onSubmit={(e) => { e.preventDefault(); save(`/fleet/${v.id}/fuel`, { litres: +f.litres, amount: +f.amount, odometer_km: +f.odometer_km || null }, () => setF({ litres: '', amount: '', odometer_km: '' })); }}>
          <b>{t('⛽ इंधन नोंद')}</b>
          <input type="number" step="0.1" placeholder={t('लिटर')} value={f.litres} onChange={(e) => setF({ ...f, litres: e.target.value })} required />
          <input type="number" placeholder={t('रक्कम ₹')} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required />
          <input type="number" placeholder={t('ओडोमीटर (कि.मी.)')} value={f.odometer_km} onChange={(e) => setF({ ...f, odometer_km: e.target.value })} />
          <button className="btn btn-primary btn-sm">{t('जतन करा')}</button>
        </form>
        {v.type === 'garbage' && (
          <form className="sub-card" onSubmit={(e) => { e.preventDefault(); save(`/fleet/${v.id}/trip`, { tonnes: +tonnes }, () => setTonnes('')); }}>
            <b>{t('🚛 कचरा फेरी (डंपिंग ग्राउंड वजन)')}</b>
            <input type="number" step="0.1" placeholder={t('टन')} value={tonnes} onChange={(e) => setTonnes(e.target.value)} required />
            <button className="btn btn-primary btn-sm">{t('नोंदवा')}</button>
            <small className="muted">{t('आज: {n} टन', { n: v.tonnes_today.toFixed(1) })}</small>
          </form>
        )}
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      <table className="table">
        <thead><tr><th>{t('दिनांक')}</th><th>{t('लिटर')}</th><th>{t('रक्कम')}</th><th>{t('ओडोमीटर')}</th></tr></thead>
        <tbody>{fuel.data?.map((x) => <tr key={x.id}><td>{fmtDate(x.logged_at)}</td><td>{x.litres.toFixed(1)}</td><td>{fmtMoney(x.amount)}</td><td>{x.odometer_km ?? '—'}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export default function Fleet() {
  const t = useT();
  const { data, reload } = useFetch(() => api.get('/fleet'));
  const [sel, setSel] = useState(null);
  const [type, setType] = useState('');
  const track = useFetch(() => (sel ? api.get(`/fleet/${sel.id}/track`) : []), [sel?.id]);
  const route = useFetch(() => (sel ? api.get(`/fleet/${sel.id}/route`) : null), [sel?.id]);
  const alerts = useFetch(() => api.get('/fleet/alerts'));
  const [draft, setDraft] = useState(null);
  useEffect(() => { const timer = setInterval(() => { reload(); alerts.reload(); }, 30000); return () => clearInterval(timer); }, [reload, alerts.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  const startEdit = () => {
    const r = route.data;
    setDraft({ mode: 'path', name: r?.name || `${sel.reg_no} — फेरी`, tolerance_m: r?.tolerance_m || 150, shift_start: r?.shift_start || '06:00', shift_end: r?.shift_end || '14:00',
      path: r?.path || [], checkpoints: (r?.checkpoints || []).map(({ name, lat, lng, radius_m }) => ({ name, lat, lng, radius_m })) });
  };
  const mapClick = ({ lat, lng }) => {
    if (!draft) return;
    if (draft.mode === 'path') setDraft({ ...draft, path: [...draft.path, [lng, lat]] });
    else setDraft({ ...draft, checkpoints: [...draft.checkpoints, { name: `थांबा ${draft.checkpoints.length + 1}`, lat, lng }] });
  };
  const resolveAlert = async (id) => { await api.post(`/fleet/alerts/${id}/resolve`); alerts.reload(); };
  const shownPath = draft ? draft.path : route.data?.path;
  const shownCps = draft ? draft.checkpoints : route.data?.checkpoints;

  const list = (data || []).filter((v) => !type || v.type === type);
  const withGps = list.filter((v) => v.last_lat);
  const center = withGps.length ? [withGps[0].last_lat, withGps[0].last_lng] : [20.932, 77.752];
  const totals = list.reduce((a, v) => ({ fuel: a.fuel + v.fuel_30d, cost: a.cost + v.fuel_cost_30d }), { fuel: 0, cost: 0 });

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">{t('🚛 वाहन व साहित्य ट्रॅकिंग')}</h2>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{t('सर्व वाहने')}</option>
          {Object.entries(VEHICLE).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
        </select>
      </div>
      <p className="muted">{t('३० दिवसांचे इंधन:')} <b>{t('{n} लि.', { n: totals.fuel.toFixed(0) })}</b> · {t('खर्च:')} <b>{fmtMoney(totals.cost)}</b> · {t('दर ३० सेकंदाला Live अपडेट')}</p>

      {alerts.data?.length > 0 && (
        <div className="card alert-card">
          <h3 className="card-title">{t('🚨 वाहन अलर्ट')} ({alerts.data.length})</h3>
          {alerts.data.slice(0, 8).map((a) => (
            <div key={a.id} className="alert-row">
              <span className="badge b-rejected">{ALERT[a.type] ? t(ALERT[a.type]) : a.type}</span>
              <span className="alert-msg">{a.message}<br /><small className="muted">{t(a.ward_name)} · {fmtDate(a.created_at)}</small></span>
              {a.driver_mobile && <a className="btn btn-sm btn-light" href={`tel:${a.driver_mobile}`}>{t('📞 चालक')}</a>}
              <button className="btn btn-sm btn-light" onClick={() => resolveAlert(a.id)}>{t('✔ पाहिले')}</button>
            </div>
          ))}
        </div>
      )}

      <div className={`card map-card ${draft ? 'editing' : ''}`}>
        <MapContainer center={center} zoom={12} style={{ height: 440 }}>
          <ClickCapture onClick={mapClick} />
          {shownPath?.length > 1 && <Polyline positions={shownPath.map(([lng, lat]) => [lat, lng])} pathOptions={{ color: '#2e9e5b', weight: 6, opacity: 0.45, dashArray: '8 8' }} />}
          {shownCps?.map((c, i) => (
            <CircleMarker key={`cp${i}`} center={[c.lat, c.lng]} radius={7} pathOptions={{ color: c.visited === false ? '#d64545' : '#2e9e5b', fillOpacity: 0.3 }}>
              <Tooltip>📍 {c.name}{c.visited === false ? ` — ${t('आज गेली नाही')}` : c.visited ? ' — ✔' : ''}</Tooltip>
            </CircleMarker>
          ))}
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
          {withGps.map((v) => (
            <CircleMarker key={v.id} center={[v.last_lat, v.last_lng]} radius={sel?.id === v.id ? 12 : 8}
              pathOptions={{ color: COLORS[v.status], fillOpacity: 0.85 }} eventHandlers={{ click: () => { if (!draft) setSel(v); } }}>
              <Tooltip>{t(VEHICLE[v.type])} {v.reg_no}</Tooltip>
              <Popup>{v.reg_no}<br />{v.driver_name}<br />{Math.round(v.last_speed || 0)} km/h</Popup>
            </CircleMarker>
          ))}
          {track.data?.length > 1 && <Polyline positions={track.data.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#0b5394', weight: 3 }} />}
        </MapContainer>
      </div>

      {sel && draft && <RouteEditor v={sel} draft={draft} setDraft={setDraft} onCancel={() => setDraft(null)} onSaved={() => { setDraft(null); route.reload(); }} />}
      {sel && !draft && <VehiclePanel v={sel} route={route.data} onClose={() => setSel(null)} onSaved={reload} onEditRoute={startEdit} />}

      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>{t('वाहन')}</th><th>{t('प्रभाग')}</th><th>{t('चालक')}</th><th>{t('स्थिती')}</th><th>{t('वेग')}</th><th>{t('शेवटचे सिग्नल')}</th><th>{t('इंधन (३० दि.)')}</th></tr></thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.id} onClick={() => { setDraft(null); setSel(v); }} className={`clickable ${sel?.id === v.id ? 'row-sel' : ''}`}>
                <td>{t(VEHICLE[v.type])}<br /><b>{v.reg_no}</b></td>
                <td>{t(v.ward_name)}</td>
                <td>{v.driver_name}</td>
                <td><span className={`badge ${STATUS[v.status].cls}`}>{t(STATUS[v.status].label)}</span>{v.has_route > 0 && (v.route_completed_at ? <span className="badge b-resolved">✅ {t('मार्ग पूर्ण')}</span> : <span className="badge b-new">🛣️ {t('मार्ग चालू')}</span>)}</td>
                <td>{Math.round(v.last_speed || 0)} km/h</td>
                <td>{fmtDate(v.last_seen)}</td>
                <td>{t('{n} लि.', { n: v.fuel_30d.toFixed(0) })} · {fmtMoney(v.fuel_cost_30d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
