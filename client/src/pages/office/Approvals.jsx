import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import SignaturePad from '../../components/SignaturePad.jsx';
import { STATUS, fmtDate, useFetch } from '../../utils.js';
import { useT } from '../../i18n/index.jsx';

const FIELDS = {
  birth: [['child_name', 'बाळाचे नाव'], ['dob', 'जन्म तारीख', 'date'], ['hospital', 'रुग्णालय'], ['father_name', 'वडिलांचे नाव'], ['mother_name', 'आईचे नाव']],
  death: [['deceased_name', 'मृत व्यक्तीचे नाव'], ['date_of_death', 'मृत्यू तारीख', 'date'], ['place', 'ठिकाण']],
  building: [['survey_no', 'सर्व्हे नं.'], ['area_sqft', 'क्षेत्र (चौ. फूट)', 'number'], ['floors', 'मजले', 'number']],
  trade: [['shop_name', 'दुकानाचे नाव'], ['business', 'व्यवसाय']],
  water: [['property_no', 'मालमत्ता क्र.'], ['connection_size', 'जोडणी आकार']],
};

function NewApplication({ types, wards, onDone }) {
  const t = useT();
  const [type, setType] = useState('birth');
  const [form, setForm] = useState({ applicant_name: '', applicant_mobile: '', ward_id: '' });
  const [details, setDetails] = useState({});
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/approvals', { type, ...form, ward_id: form.ward_id ? Number(form.ward_id) : null, details });
      onDone();
    } catch (x) { setErr(x.message); }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h3 className="card-title">{t('नवीन अर्ज नोंद')}</h3>
      <div className="grid-3">
        <label>{t('अर्जाचा प्रकार')}
          <select value={type} onChange={(e) => { setType(e.target.value); setDetails({}); }}>
            {Object.entries(types).map(([k, ty]) => <option key={k} value={k}>{t(ty.name)}</option>)}
          </select>
        </label>
        <label>{t('अर्जदाराचे नाव')}<input required value={form.applicant_name} onChange={(e) => setForm({ ...form, applicant_name: e.target.value })} /></label>
        <label>{t('मोबाईल')}<input inputMode="numeric" maxLength={10} value={form.applicant_mobile} onChange={(e) => setForm({ ...form, applicant_mobile: e.target.value.replace(/\D/g, '') })} /></label>
        <label>{t('प्रभाग')}
          <select value={form.ward_id} onChange={(e) => setForm({ ...form, ward_id: e.target.value })}>
            <option value="">—</option>
            {wards.map((w) => <option key={w.id} value={w.id}>{t(w.name)}</option>)}
          </select>
        </label>
        {FIELDS[type].map(([k, label, ty]) => (
          <label key={k}>{t(label)}<input type={ty || 'text'} value={details[k] || ''} onChange={(e) => setDetails({ ...details, [k]: e.target.value })} /></label>
        ))}
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      <button className="btn btn-primary">{t('अर्ज नोंदवा')}</button>
    </form>
  );
}

export default function Approvals() {
  const t = useT();
  const [status, setStatus] = useState('pending');
  const { user } = useAuth();
  const canSign = ['officer', 'admin'].includes(user.role);
  const [bulk, setBulk] = useState(() => new URLSearchParams(window.location.search).get('bulk') === '1');
  const [sel, setSel] = useState(new Set());
  const [sig, setSig] = useState(null);
  const [bulkMsg, setBulkMsg] = useState(null);
  const mySig = useFetch(() => (canSign ? api.get('/approvals/my-signature') : null));
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const bulkApprove = async () => {
    setBulkMsg(null);
    try {
      const r = await api.post('/approvals/bulk-decide', { ids: [...sel], decision: 'approved', signature: sig });
      setBulkMsg({ ok: !r.failed.length, text: t('✔ {n} दाखले डिजिटल सहीने मंजूर', { n: r.done }) + (r.failed.length ? ` · ✖ ${r.failed.length}: ${r.failed[0].message}` : '') });
      setSel(new Set()); reload(); mySig.reload();
    } catch (x) { setBulkMsg({ ok: false, text: x.message }); }
  };
  const [adding, setAdding] = useState(() => new URLSearchParams(window.location.search).get('new') === '1');
  const { data, loading, reload } = useFetch(() => api.get(`/approvals${status ? `?status=${status}` : ''}`), [status]);
  const types = useFetch(() => api.get('/approvals/types'));
  const masters = useFetch(() => api.get('/masters'));

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">{t('✍️ दाखले व परवाने मंजुरी')}</h2>
        <div className="row-gap" style={{ marginBottom: 0 }}>
          {canSign && status === 'pending' && <button className="btn btn-light" onClick={() => { setBulk(!bulk); setSel(new Set()); }}>✍️ {bulk ? t('एकत्रित मंजुरी बंद') : t('एकत्रित e-Sign मंजुरी')}</button>}
          <button className="btn btn-primary" onClick={() => setAdding(!adding)}>{adding ? t('रद्द') : t('+ नवीन अर्ज')}</button>
        </div>
      </div>
      {adding && types.data && <NewApplication types={types.data} wards={masters.data?.wards || []} onDone={() => { setAdding(false); reload(); }} />}
      <div className="tabs">
        {[['pending', '⏳ प्रलंबित'], ['approved', '✅ मंजूर'], ['rejected', '✖ नामंजूर'], ['', 'सर्व']].map(([k, l]) => (
          <button key={k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>{t(l)}</button>
        ))}
      </div>
      {bulk && canSign && status === 'pending' && (
        <div className="card bulk-bar">
          <b>{t('{n} निवडले', { n: sel.size })}</b>
          <button className="btn btn-sm btn-light" onClick={() => setSel(new Set((data || []).map((a) => a.id)))}>{t('सर्व निवडा')}</button>
          {!mySig.data?.signature_path && <div style={{ flexBasis: '100%' }}><small className="muted">{t('पहिल्यांदा सही करा — ती सर्व निवडलेल्या दाखल्यांवर लागेल:')}</small><SignaturePad onChange={setSig} /></div>}
          {mySig.data?.signature_path && <span className="muted small">{t('✔ जतन केलेली सही वापरली जाईल')} <img src={mySig.data.signature_path} alt="" style={{ height: 28, verticalAlign: 'middle', background: '#fff' }} /></span>}
          <button className="btn btn-success" disabled={!sel.size || (!mySig.data?.signature_path && !sig)} onClick={bulkApprove}>{t('✔ {n} दाखले मंजूर करा', { n: sel.size })}</button>
        </div>
      )}
      {bulkMsg && <div className={`alert ${bulkMsg.ok ? 'alert-ok' : 'alert-error'}`}>{bulkMsg.text}</div>}
      {loading && <p className="muted">{t('लोड होत आहे…')}</p>}
      {data?.length === 0 && <div className="card empty">{t('कोणताही अर्ज नाही')}</div>}
      <div className="list">
        {data?.map((a) => (
          <Link key={a.id} to={`/approvals/${a.id}`} className={`card list-item row ${sel.has(a.id) ? 'row-sel-card' : ''}`}
            onClick={(e) => { if (bulk && a.status === 'pending') { e.preventDefault(); toggle(a.id); } }}>
            {bulk && a.status === 'pending' && <input type="checkbox" checked={sel.has(a.id)} readOnly style={{ width: 20, height: 20 }} />}
            <div style={{ flex: 1 }}>
              <strong>{t(a.type_name)} — {a.applicant_name}</strong>
              <small className="muted">{a.app_no} · {t(a.ward_name)} · {fmtDate(a.created_at)}</small>
            </div>
            <span className={`badge ${STATUS[a.status].cls}`}>{t(STATUS[a.status].label)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
