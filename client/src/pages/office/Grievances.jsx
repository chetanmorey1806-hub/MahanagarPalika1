import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { STATUS, fmtDate, timeLeft, useFetch } from '../../utils.js';
import ExportButtons from '../../components/Export.jsx';
import { useT } from '../../i18n/index.jsx';

const COLORS = { new: '#d64545', assigned: '#f0a020', in_progress: '#0b84d6', resolved: '#2e9e5b', closed: '#888', rejected: '#555' };

export default function Grievances() {
  const t = useT();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState('list');
  const masters = useFetch(() => api.get('/masters'));
  const filters = Object.fromEntries(params.entries());
  const qs = params.toString();
  const { data, loading } = useFetch(() => api.get(`/grievances${qs ? `?${qs}` : ''}`), [qs]);

  const setF = (k) => (e) => {
    const p = new URLSearchParams(params);
    if (e.target.value) p.set(k, e.target.value); else p.delete(k);
    setParams(p);
  };
  const withGps = (data || []).filter((g) => g.lat);
  const center = withGps.length ? [withGps[0].lat, withGps[0].lng] : [20.932, 77.752];

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">{t('📢 तक्रारी')} {data && <small className="muted">({data.length})</small>}</h2>
        <ExportButtons rows={data || []} filename="grievances" title={t('तक्रारी')}
          columns={[['ticket_no', 'तिकीट'], ['category', 'प्रकार'], ['ward_name', 'प्रभाग'], ['address', 'ठिकाण'], ['assigned_name', 'कर्मचारी'], [(g) => t(STATUS[g.status].label), 'स्थिती'], ['created_at', 'नोंद'], ['sla_due_at', 'SLA मुदत']]} />
        <div className="tabs small">
          <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>{t('☰ यादी')}</button>
          <button className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}>{t('🗺️ नकाशा')}</button>
        </div>
      </div>

      <div className="card filters">
        <input placeholder={t('🔎 तिकीट / पत्ता शोधा')} value={filters.search || ''} onChange={setF('search')} />
        <select value={filters.status || ''} onChange={setF('status')}>
          <option value="">{t('सर्व स्थिती')}</option>
          <option value="open">{t('सर्व प्रलंबित')}</option>
          {['new', 'assigned', 'in_progress', 'resolved', 'closed', 'rejected'].map((s) => <option key={s} value={s}>{t(STATUS[s].label)}</option>)}
        </select>
        {!(user.role === 'officer' && user.ward_id) && (
          <select value={filters.ward_id || ''} onChange={setF('ward_id')}>
            <option value="">{t('सर्व प्रभाग')}</option>
            {masters.data?.wards.map((w) => <option key={w.id} value={w.id}>{t(w.name)}</option>)}
          </select>
        )}
        {user.role === 'admin' && (
          <select value={filters.department_id || ''} onChange={setF('department_id')}>
            <option value="">{t('सर्व विभाग')}</option>
            {masters.data?.departments.map((d) => <option key={d.id} value={d.id}>{t(d.name)}</option>)}
          </select>
        )}
        <label className="check"><input type="checkbox" checked={filters.overdue === '1'} onChange={(e) => setF('overdue')({ target: { value: e.target.checked ? '1' : '' } })} /> {t('फक्त उशीर झालेल्या')}</label>
      </div>

      {loading && <p className="muted">{t('लोड होत आहे…')}</p>}
      {view === 'map' ? (
        <div className="card map-card">
          <MapContainer center={center} zoom={12} style={{ height: 520 }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
            {withGps.map((g) => (
              <CircleMarker key={g.id} center={[g.lat, g.lng]} radius={8} pathOptions={{ color: COLORS[g.status], fillOpacity: 0.8 }}>
                <Popup><b>{g.icon} {t(g.category)}</b><br />{g.ticket_no}<br />{g.address}<br /><Link to={`/grievances/${g.id}`}>{t('तपशील ›')}</Link></Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>{t('तिकीट')}</th><th>{t('प्रकार')}</th><th>{t('ठिकाण')}</th><th>{t('कर्मचारी')}</th><th>{t('स्थिती')}</th><th>SLA</th></tr></thead>
            <tbody>
              {data?.map((g) => {
                const open = ['new', 'assigned', 'in_progress'].includes(g.status);
                const tl = timeLeft(g.sla_due_at);
                return (
                  <tr key={g.id} className={g.overdue ? 'row-late' : ''}>
                    <td><Link to={`/grievances/${g.id}`}><b>{g.ticket_no}</b></Link><br /><small className="muted">{fmtDate(g.created_at)}</small></td>
                    <td>{g.icon} {t(g.category)}</td>
                    <td>{g.address}<br /><small className="muted">{t(g.ward_name)}</small></td>
                    <td>{g.assigned_name || <span className="text-danger">{t('नेमणूक नाही')}</span>}</td>
                    <td><span className={`badge ${STATUS[g.status].cls}`}>{t(STATUS[g.status].label)}</span>
                      {g.escalation_level > 0 && <span className="badge b-rejected">⬆ L{g.escalation_level}</span>}</td>
                    <td className={open && tl.late ? 'text-danger' : 'muted'}>{open ? tl.text : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
