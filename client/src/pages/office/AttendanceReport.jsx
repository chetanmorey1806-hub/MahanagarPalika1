import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { fmtTime, useFetch } from '../../utils.js';
import ExportButtons from '../../components/Export.jsx';
import { useT } from '../../i18n/index.jsx';

export default function AttendanceReport() {
  const t = useT();
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const { data, loading } = useFetch(() => api.get(`/attendance/report?date=${date}`), [date]);
  const present = (data || []).filter((r) => r.check_in_at).length;
  const leave = (data || []).filter((r) => !r.check_in_at && r.leave_type).length;


  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">{t('🧑‍🤝‍🧑 हजेरी अहवाल')}</h2>
        <div className="row-gap">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <ExportButtons rows={data || []} filename={`attendance-${date}`} title={t('हजेरी अहवाल')}
            columns={[['name', 'नाव'], ['mobile', 'मोबाईल'], ['designation', 'पद'], ['ward_name', 'प्रभाग'], ['department_name', 'विभाग'], [(r) => fmtTime(r.check_in_at), 'आले'], [(r) => fmtTime(r.check_out_at), 'गेले'], [(r) => (r.check_in_at ? (r.inside_geofence ? t('हो') : t('नाही')) : r.leave_type ? t('रजा') : t('गैरहजर')), 'वॉर्डमध्ये'], [(r) => (r.face_verified ? '✔' : ''), 'चेहरा']]} />
        </div>
      </div>
      {data && <p><b>{present}</b> / {data.length} {t('हजर')} · 🏖️ {t('{n} रजेवर', { n: leave })} · <span className="text-danger">{t('{n} गैरहजर', { n: data.length - present - leave })}</span></p>}
      {loading && <p className="muted">{t('लोड होत आहे…')}</p>}
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>{t('सेल्फी')}</th><th>{t('नाव')}</th><th>{t('पद / विभाग')}</th><th>{t('प्रभाग')}</th><th>{t('आले')}</th><th>{t('गेले')}</th><th>Geo-fence</th></tr></thead>
          <tbody>
            {data?.map((r) => (
              <tr key={r.user_id} className={!r.check_in_at ? 'row-absent' : ''}>
                <td>{r.check_in_photo ? <a href={r.check_in_photo} target="_blank" rel="noreferrer"><img className="avatar" src={r.check_in_photo} alt="" /></a> : '—'}</td>
                <td><b>{r.name}</b><br /><small className="muted">{r.mobile}</small> <Link to={`/payslip?user_id=${r.user_id}`} title={t('पगार स्लिप')}>💵</Link></td>
                <td>{t(r.designation)}<br /><small className="muted">{t(r.department_name)}</small></td>
                <td>{t(r.ward_name)}</td>
                <td>{r.check_in_at ? fmtTime(r.check_in_at) : r.leave_type ? <span className="badge b-assigned">{t('🏖️ रजेवर')}</span> : <span className="badge b-rejected">{t('गैरहजर')}</span>}</td>
                <td>{fmtTime(r.check_out_at)}</td>
                <td>{!r.check_in_at ? '' : r.inside_geofence ? t('✅ आत') : <span className="text-danger">{t('⚠️ {m} मी. बाहेर', { m: r.check_in_distance_m })}</span>}
                  {r.check_in_at && (r.face_verified ? t(' · 🙂 चेहरा जुळला') : r.face_verified === 0 ? <span className="text-danger">{t(' · ⚠️ चेहरा जुळला नाही')}</span> : '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
