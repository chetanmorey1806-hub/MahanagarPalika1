// वॉर्ड अधिकारी / विभाग प्रमुख — दैनंदिन कामांचा डॅशबोर्ड (Task Execution)
import { useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip as MapTip } from 'react-leaflet';
import { ClipboardCheck, FileSignature, KanbanSquare, MapPinned, Megaphone, PlusCircle, Repeat, Siren, UserPlus } from 'lucide-react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { useLive } from '../../live.js';
import { fmtTime, timeLeft, useFetch, VEHICLE } from '../../utils.js';
import InboxPanel from '../../components/InboxPanel.jsx';
import Kpi from '../../components/Kpi.jsx';
import Analytics from './Analytics.jsx';

const STATE_COLOR = { on_duty: '#12a150', off: '#868e96', leave: '#1c7ed6', absent: '#d9403f' };

export default function OfficerDashboard() {
  const t = useT();
  const { data: d, reload } = useFetch(() => api.get('/dashboard/officer'));
  const roster = useFetch(() => api.get('/attendance/roster'));
  const timer = useRef();
  const live = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { reload(); roster.reload(); }, 1200);
  }, [reload, roster.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  useLive(['grievance', 'emergency', 'alert', 'attendance', 'location'], live);

  const workers = (roster.data || []).filter((w) => w.last_lat);
  const pts = [...workers.map((w) => [w.last_lat, w.last_lng]), ...(d?.vehicles || []).map((v) => [v.last_lat, v.last_lng])];
  const center = pts.length ? [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] : [20.932, 77.752];
  const counts = (roster.data || []).reduce((c, w) => ({ ...c, [w.state]: (c[w.state] || 0) + 1 }), {});

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">📋 {t('माझा कार्य डॅशबोर्ड')}</h2>
        <span className="live-dot">● {t('Live — नवीन माहिती आपोआप दिसते')}</span>
      </div>

      {/* A. माझी कामे — वरची पट्टी */}
      {d && (
        <div className="stats kpi-strip">
          <Kpi icon="👷" label="नेमणूक बाकी तक्रारी" value={d.unassigned.length} tone={d.unassigned.length ? 'danger' : 'ok'} to="/grievances?status=new" />
          <Kpi icon="✍️" label="मंजुरीसाठी प्रलंबित" value={d.approvals} to="/approvals" sub={t('दाखले, परवाने')} />
          <Kpi icon="🔎" label="आजच्या तपासणी भेटी" value={d.inspections.length} to="/inspections" />
          <Kpi icon="⏰" label="आज संध्याकाळपर्यंत (SLA)" value={d.dueToday.length} tone={d.dueToday.length ? 'danger' : 'ok'} to="/grievances?status=open" />
          <Kpi icon="🔍" label="तपासणी बाकी (फोटो आले)" value={d.awaiting.length} to="/kanban" />
          {d.routes?.total > 0 && <Kpi icon="🛣️" label="आज कचरा गाडी मार्ग पूर्ण" value={`${d.routes.completed || 0} / ${d.routes.total}`} to="/fleet" tone={d.routes.completed === d.routes.total ? 'ok' : ''} progress={(100 * (d.routes.completed || 0)) / d.routes.total} />}
          <Kpi icon="💧" label="आज मीटर रीडिंग / टँकर" value={`${d.water.readings_today} / ${d.water.tanker_today.c}`} to="/water" sub={t('टँकरने {n} लिटर पाणी', { n: d.water.tanker_today.litres.toLocaleString('en-IN') })} />
        </div>
      )}

      {/* C. एका क्लिकवर करायची कामे */}
      <div className="quick-actions">
        <Link to="/kanban" className="qa"><KanbanSquare size={20} />{t('काम फलक')}</Link>
        <Link to="/approvals?bulk=1" className="qa"><FileSignature size={20} />{t('एकत्रित e-Sign मंजुरी')}</Link>
        <Link to="/roster" className="qa"><Repeat size={20} />{t('काम हस्तांतरित करा')}</Link>
        <Link to="/work-orders" className="qa"><UserPlus size={20} />{t('नवीन कामाचा आदेश')}</Link>
        <Link to="/inspections" className="qa"><ClipboardCheck size={20} />{t('तपासणी भेट ठरवा')}</Link>
        <Link to="/notices" className="qa"><Megaphone size={20} />{t('परिपत्रक काढा')}</Link>
        <Link to="/complaint/new" className="qa"><PlusCircle size={20} />{t('नवीन तक्रार')}</Link>
        <Link to="/emergencies" className="qa danger"><Siren size={20} />{t('आपत्कालीन घटना')}</Link>
      </div>

      <InboxPanel />

      {d && (
        <div className="grid-3 officer-lists">
          <div className="card">
            <h3 className="card-title">⏰ {t('SLA इशारा — आज पूर्ण करायच्या')}</h3>
            {d.dueToday.length === 0 && <p className="muted">🎉 {t('आज मुदत संपणारी तक्रार नाही')}</p>}
            {d.dueToday.map((g) => {
              const tl = timeLeft(g.sla_due_at);
              return (
                <Link key={g.id} to={`/grievances/${g.id}`} className="crit-row">
                  <span className="crit-icon">{g.icon}</span>
                  <span className="crit-main"><b>{t(g.category)}</b><small>{g.assigned_name || t('नेमणूक नाही')} · {t(g.address || '')}</small></span>
                  <span className={tl.late ? 'crit-late' : 'crit-ok'}>{tl.text}</span>
                </Link>
              );
            })}
          </div>
          <div className="card">
            <h3 className="card-title">👷 {t('नवीन तक्रारी — नेमणूक करा')}</h3>
            {d.unassigned.length === 0 && <p className="muted">✅ {t('सर्व तक्रारींची नेमणूक झाली आहे')}</p>}
            {d.unassigned.map((g) => (
              <Link key={g.id} to={`/grievances/${g.id}`} className="crit-row">
                <span className="crit-icon">{g.icon}</span>
                <span className="crit-main"><b>{t(g.category)}</b> {g.priority === 'high' && <span className="badge b-rejected">{t('तातडीचे')}</span>}<small>{g.ticket_no} · {t(g.ward_name)}</small></span>
                <span className="btn btn-sm btn-primary">{t('नेमणूक')}</span>
              </Link>
            ))}
          </div>
          <div className="card">
            <h3 className="card-title">🔎 {t('आजच्या तपासणी भेटी')}</h3>
            {d.inspections.length === 0 && <p className="muted">{t('आज भेट ठरलेली नाही')}</p>}
            {d.inspections.map((i) => (
              <Link key={i.id} to="/inspections" className="crit-row">
                <span className="crit-icon">📌</span>
                <span className="crit-main"><b>{t(i.title)}</b><small>{t(i.location || '')} · {t(i.purpose || '')}</small></span>
                <span className="crit-ok">{i.scheduled_time || ''}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* B. लाईव्ह नकाशा: कर्मचारी + वाहने */}
      <div className="card map-card gis-card">
        <div className="gis-head">
          <h3 className="card-title" style={{ margin: 0 }}><MapPinned size={18} /> {t('कर्मचारी ड्युटी व वाहनांचे लाईव्ह लोकेशन')}</h3>
          <span className="legend">
            <i className="dot green" /> {t('ड्युटीवर')} ({counts.on_duty || 0}) <i className="dot red" /> {t('गैरहजर')} ({counts.absent || 0})
            <i className="dot blue" /> {t('रजेवर')} ({counts.leave || 0}) <i className="dot truck" /> {t('वाहन')}
          </span>
          <Link to="/roster" className="btn btn-sm btn-light">{t('पूर्ण रोस्टर ›')}</Link>
        </div>
        <MapContainer center={center} zoom={13} style={{ height: 400 }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
          {workers.map((w) => (
            <CircleMarker key={`w${w.id}`} center={[w.last_lat, w.last_lng]} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: STATE_COLOR[w.state], fillOpacity: 1 }}>
              <MapTip>{w.name} · {t(w.designation)}</MapTip>
              <Popup><b>{w.name}</b><br />{t(w.designation)}<br />{t('आले')}: {fmtTime(w.check_in_at)} · {t('कामे')}: {w.open_tasks}<br /><a href={`tel:${w.mobile}`}>📞 {w.mobile}</a></Popup>
            </CircleMarker>
          ))}
          {d?.vehicles.map((v) => (
            <CircleMarker key={`v${v.id}`} center={[v.last_lat, v.last_lng]} radius={9} pathOptions={{ color: '#5c1608', weight: 3, fillColor: '#f59f00', fillOpacity: 0.9 }}>
              <MapTip>{t(VEHICLE[v.type])} {v.reg_no}</MapTip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {d && (
        <Link to="/kanban" className="card kanban-strip">
          <span><b>{d.kanban.todo || 0}</b>{t('करायची (To-Do)')}</span>
          <span><b>{d.kanban.doing || 0}</b>{t('काम सुरू')}</span>
          <span className="warn"><b>{d.kanban.review || 0}</b>{t('तपासणी बाकी')}</span>
          <span className="ok"><b>{d.kanban.closed_7d || 0}</b>{t('बंद (७ दिवस)')}</span>
        </Link>
      )}

      <h3 className="section-title">📊 {t('माझ्या विभाग / प्रभागाची आकडेवारी')}</h3>
      <Analytics />
    </div>
  );
}
