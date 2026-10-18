// Admin: कर्मचारी व्यवस्थापन, वॉर्ड Geo-fence, SLA वेळ
import { useState } from 'react';
import { api } from '../../api.js';
import { ROLE, useFetch } from '../../utils.js';
import { useT } from '../../i18n/index.jsx';

function UserForm({ masters, onDone }) {
  const t = useT();
  const [f, setF] = useState({ name: '', mobile: '', email: '', password: '', role: 'worker', designation: '', ward_id: '', department_id: '', employee_code: '', basic_pay: '', joining_date: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/masters/users', { ...f, ward_id: f.ward_id ? +f.ward_id : null, department_id: f.department_id ? +f.department_id : null });
      onDone();
    } catch (x) { setErr(x.message); }
  };
  return (
    <form className="card" onSubmit={submit}>
      <div className="grid-3">
        <label>{t('नाव')}<input required value={f.name} onChange={set('name')} /></label>
        <label>{t('मोबाईल')}<input required maxLength={10} value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value.replace(/\D/g, '') })} /></label>
        <label>{t('पासवर्ड')}<input required value={f.password} onChange={set('password')} /></label>
        <label>{t('ई-मेल (दैनिक अहवालासाठी)')}<input type="email" value={f.email} onChange={set('email')} /></label>
        <label>{t('कर्मचारी कोड')}<input value={f.employee_code} onChange={set('employee_code')} /></label>
        <label>{t('मूळ वेतन (₹/महिना)')}<input type="number" value={f.basic_pay} onChange={set('basic_pay')} /></label>
        <label>{t('रुजू दिनांक')}<input type="date" value={f.joining_date} onChange={set('joining_date')} /></label>
        <label>{t('भूमिका')}<select value={f.role} onChange={set('role')}>{Object.entries(ROLE).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select></label>
        <label>{t('पद')}<input value={f.designation} onChange={set('designation')} placeholder={t('उदा. सफाई कामगार')} /></label>
        <label>{t('प्रभाग')}<select value={f.ward_id} onChange={set('ward_id')}><option value="">{t('सर्व / नाही')}</option>{masters.wards.map((w) => <option key={w.id} value={w.id}>{t(w.name)}</option>)}</select></label>
        <label>{t('विभाग')}<select value={f.department_id} onChange={set('department_id')}><option value="">—</option>{masters.departments.map((d) => <option key={d.id} value={d.id}>{t(d.name)}</option>)}</select></label>
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      <button className="btn btn-primary">{t('जतन करा')}</button>
    </form>
  );
}

export default function Users() {
  const t = useT();
  const [tab, setTab] = useState('users');
  const [adding, setAdding] = useState(false);
  const [role, setRole] = useState('');
  const users = useFetch(() => api.get(`/masters/users${role ? `?role=${role}` : ''}`), [role]);
  const masters = useFetch(() => api.get('/masters'));
  const [msg, setMsg] = useState('');

  const toggle = async (u) => { await api.patch(`/masters/users/${u.id}`, { active: !u.active }); users.reload(); };
  const saveWard = async (w, e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const boundary = fd.get('boundary').trim();
    try {
      await api.patch(`/masters/wards/${w.id}`, { lat: +fd.get('lat'), lng: +fd.get('lng'), radius_m: +fd.get('radius_m'), boundary: boundary || null });
    } catch (x) { setMsg(''); alert(x.message); return; }
    setMsg(t('{name} जतन केले', { name: t(w.name) })); masters.reload();
  };
  const saveSla = async (c, value) => { await api.patch(`/masters/categories/${c.id}`, { sla_hours: +value }); setMsg(t('{name}: SLA {n} तास', { name: t(c.name), n: value })); };

  return (
    <div>
      <h2 className="page-title">{t('👥 कर्मचारी व मास्टर डेटा')}</h2>
      <div className="tabs">
        {[['users', '👥 कर्मचारी'], ['wards', '📍 वॉर्ड Geo-fence'], ['sla', '⏱ SLA वेळ']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => { setTab(k); setMsg(''); }}>{t(l)}</button>
        ))}
      </div>
      {msg && <div className="alert alert-ok">✔ {msg}</div>}

      {tab === 'users' && (
        <>
          <div className="row-gap">
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">{t('सर्व भूमिका')}</option>
              {Object.entries(ROLE).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
            </select>
            <button className="btn btn-primary" onClick={() => setAdding(!adding)}>{adding ? t('रद्द') : t('+ नवीन कर्मचारी')}</button>
          </div>
          {adding && masters.data && <UserForm masters={masters.data} onDone={() => { setAdding(false); users.reload(); }} />}
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>{t('नाव')}</th><th>{t('मोबाईल')}</th><th>{t('भूमिका / पद')}</th><th>{t('विभाग')}</th><th>{t('प्रभाग')}</th><th></th></tr></thead>
              <tbody>
                {users.data?.map((u) => (
                  <tr key={u.id} className={u.active ? '' : 'row-absent'}>
                    <td><b>{u.name}</b></td><td>{u.mobile}</td><td>{t(ROLE[u.role])}<br /><small className="muted">{t(u.designation)}</small></td>
                    <td>{t(u.department_name) || '—'}</td><td>{t(u.ward_name) || t('सर्व')}</td>
                    <td><button className={`btn btn-sm ${u.active ? 'btn-light' : 'btn-success'}`} onClick={() => toggle(u)}>{u.active ? t('निष्क्रिय करा') : t('सक्रिय करा')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'wards' && (
        <div className="card">
          <p className="muted">{t('हद्द (boundary polygon) दिल्यास हजेरी व तक्रारीचा वॉर्ड त्या हद्दीवरून ठरतो; नसल्यास केंद्रबिंदूपासून दिलेल्या त्रिज्येवरून (मीटर).')}</p>
          {masters.data?.wards.map((w) => (
            <form key={w.id} className="row-gap ward-row" onSubmit={(e) => saveWard(w, e)}>
              <b style={{ minWidth: 180 }}>{t(w.name)}</b>
              <input name="lat" type="number" step="any" defaultValue={w.lat} />
              <input name="lng" type="number" step="any" defaultValue={w.lng} />
              <input name="radius_m" type="number" defaultValue={w.radius_m} style={{ width: 100 }} />
              <button className="btn btn-sm btn-primary">{t('जतन')}</button>
              <textarea name="boundary" rows={2} defaultValue={w.boundary || ''} placeholder={t('(ऐच्छिक) प्रभागाची हद्द — GeoJSON Polygon coordinates, उदा. [[[73.84,18.52],[73.86,18.52],[73.86,18.54],[73.84,18.52]]]')} style={{ flexBasis: '100%' }} />
            </form>
          ))}
        </div>
      )}

      {tab === 'sla' && (
        <div className="card">
          <table className="table">
            <thead><tr><th>{t('तक्रार प्रकार')}</th><th>{t('SLA (तास)')}</th></tr></thead>
            <tbody>
              {masters.data?.categories.map((c) => (
                <tr key={c.id}><td>{c.icon} {t(c.name)}</td>
                  <td><input type="number" min={1} defaultValue={c.sla_hours} style={{ width: 90 }} onBlur={(e) => +e.target.value !== c.sla_hours && saveSla(c, e.target.value)} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
