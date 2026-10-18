// ड्युटी रोस्टर व लाईव्ह लोकेशन — गैरहजर कर्मचाऱ्याची कामे दुसऱ्याकडे हस्तांतरित करा
import { useCallback, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip as MapTip } from 'react-leaflet';
import { Repeat } from 'lucide-react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { useLive } from '../../live.js';
import { fmtTime, useFetch } from '../../utils.js';
import ExportButtons from '../../components/Export.jsx';

const STATE = { on_duty: ['ड्युटीवर', 'b-resolved', '#12a150'], off: ['ड्युटी संपली', 'b-closed', '#868e96'], leave: ['रजेवर', 'b-assigned', '#1c7ed6'], absent: ['गैरहजर', 'b-rejected', '#d9403f'] };

function Reassign({ from, workers, onDone }) {
  const t = useT();
  const [to, setTo] = useState('');
  const [msg, setMsg] = useState('');
  const go = async () => {
    try { const r = await api.post('/grievances/reassign', { from_worker: from.id, to_worker: +to }); setMsg(t('✔ {n} कामे हस्तांतरित', { n: r.moved })); onDone(); } catch (e) { setMsg(e.message); }
  };
  const options = workers.filter((w) => w.id !== from.id && w.role === 'worker' && w.state === 'on_duty');
  return (
    <div className="decide">
      <select value={to} onChange={(e) => setTo(e.target.value)}>
        <option value="">— {t('ड्युटीवरील कर्मचारी निवडा')} —</option>
        {options.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.open_tasks} {t('कामे')})</option>)}
      </select>
      <button className="btn btn-sm btn-primary" disabled={!to} onClick={go}><Repeat size={14} /> {t('{n} कामे हस्तांतरित करा', { n: from.open_tasks })}</button>
      {msg && <small>{msg}</small>}
    </div>
  );
}

export default function Roster() {
  const t = useT();
  const [filter, setFilter] = useState('');
  const { data, reload } = useFetch(() => api.get('/attendance/roster'));
  useLive(['attendance', 'location'], useCallback(() => reload(), [reload]));
  const rows = (data || []).filter((w) => !filter || w.state === filter);
  const located = (data || []).filter((w) => w.last_lat);
  const center = located.length ? [located.reduce((s, w) => s + w.last_lat, 0) / located.length, located.reduce((s, w) => s + w.last_lng, 0) / located.length] : [20.932, 77.752];
  const counts = (data || []).reduce((c, w) => ({ ...c, [w.state]: (c[w.state] || 0) + 1 }), {});

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">🧑‍🤝‍🧑 {t('ड्युटी रोस्टर व लाईव्ह लोकेशन')}</h2>
        <ExportButtons rows={data || []} filename="duty-roster" title="ड्युटी रोस्टर"
          columns={[['name', 'नाव'], ['designation', 'पद'], ['ward_name', 'प्रभाग'], [(w) => STATE[w.state][0], 'स्थिती'], ['check_in_at', 'आले'], ['open_tasks', 'प्रलंबित कामे'], ['done_today', 'आज पूर्ण']]} />
      </div>
      <div className="tabs">
        <button className={!filter ? 'active' : ''} onClick={() => setFilter('')}>{t('सर्व')} ({data?.length || 0})</button>
        {Object.entries(STATE).map(([k, [l]]) => <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{t(l)} ({counts[k] || 0})</button>)}
      </div>
      <div className="card map-card">
        <MapContainer center={center} zoom={13} style={{ height: 360 }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
          {located.filter((w) => !filter || w.state === filter).map((w) => (
            <CircleMarker key={w.id} center={[w.last_lat, w.last_lng]} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: STATE[w.state][2], fillOpacity: 1 }}>
              <MapTip>{w.name}</MapTip>
              <Popup><b>{w.name}</b><br />{t(w.designation)}<br />{t('शेवटचे लोकेशन')}: {fmtTime(w.last_at)}</Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>{t('कर्मचारी')}</th><th>{t('प्रभाग')}</th><th>{t('स्थिती')}</th><th>{t('आले')}</th><th>{t('चेहरा')}</th><th>{t('प्रलंबित / आज पूर्ण')}</th><th>{t('शेवटचे लोकेशन')}</th><th /></tr></thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id}>
                <td><b>{w.name}</b><br /><small className="muted">{t(w.designation)}</small></td>
                <td>{t(w.ward_name || '—')}</td>
                <td><span className={`badge ${STATE[w.state][1]}`}>{t(STATE[w.state][0])}</span>{w.check_in_at && !w.inside_geofence && <span className="badge b-rejected">⚠️ {t('वॉर्डबाहेर')}</span>}</td>
                <td>{fmtTime(w.check_in_at)}</td>
                <td>{w.check_in_at ? (w.face_verified ? '✅' : w.face_verified === 0 ? '⚠️' : '—') : ''}</td>
                <td>{w.open_tasks} / {w.done_today}</td>
                <td>{w.last_at ? <a href={`https://www.google.com/maps?q=${w.last_lat},${w.last_lng}`} target="_blank" rel="noreferrer">📍 {fmtTime(w.last_at)}</a> : '—'}</td>
                <td>
                  <a className="btn btn-sm btn-light" href={`tel:${w.mobile}`}>📞</a>
                  {w.state !== 'on_duty' && w.open_tasks > 0 && w.role === 'worker' && <Reassign from={w} workers={data} onDone={reload} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
