import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { fmtMoney, useFetch } from '../../utils.js';
import ExportButtons from '../../components/Export.jsx';
import { useT } from '../../i18n/index.jsx';

export const PAY_STATUS = { PAID: ['भरलेला', 'b-resolved'], PARTIAL: ['अंशतः', 'b-assigned'], PENDING: ['थकीत', 'b-rejected'] };
const TYPES = { RESIDENTIAL: 'निवासी', COMMERCIAL: 'व्यावसायिक', INDUSTRIAL: 'औद्योगिक', MIXED: 'मिश्र' };

function NewProperty({ wards, onDone }) {
  const t = useT();
  const [f, setF] = useState({ owner_name: '', owner_mobile: '', ward_id: '', address: '', built_up_area_sqft: '', property_type: 'RESIDENTIAL' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try { const r = await api.post('/tax/properties', { ...f, ward_id: +f.ward_id, built_up_area_sqft: +f.built_up_area_sqft }); onDone(r.id); } catch (x) { setErr(x.message); }
  };
  return (
    <form className="card" onSubmit={submit}>
      <h3 className="card-title">{t('नवीन मालमत्ता नोंद')}</h3>
      <div className="grid-3">
        <label>{t('मालकाचे नाव')}<input required value={f.owner_name} onChange={set('owner_name')} /></label>
        <label>{t('मोबाईल')}<input maxLength={10} value={f.owner_mobile} onChange={(e) => setF({ ...f, owner_mobile: e.target.value.replace(/\D/g, '') })} /></label>
        <label>{t('प्रभाग')}<select required value={f.ward_id} onChange={set('ward_id')}><option value="">—</option>{wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <label>{t('पत्ता')}<input value={f.address} onChange={set('address')} /></label>
        <label>{t('बांधकाम क्षेत्र (चौ.फू.)')}<input required type="number" min={1} value={f.built_up_area_sqft} onChange={set('built_up_area_sqft')} /></label>
        <label>{t('प्रकार')}<select value={f.property_type} onChange={set('property_type')}>{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select></label>
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      <button className="btn btn-primary">{t('नोंद करा व चालू वर्षाचा कर आकारा')}</button>
    </form>
  );
}

export default function Tax() {
  const t = useT();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');
  const summary = useFetch(() => api.get('/tax/summary'));
  const masters = useFetch(() => api.get('/masters'));
  const qs = new URLSearchParams({ ...(search && { search }), ...(status && { status }) }).toString();
  const list = useFetch(() => api.get(`/tax/properties${qs ? `?${qs}` : ''}`), [qs]);
  const s = summary.data;
  const pct = s?.total.demand ? Math.round((100 * s.total.collected) / s.total.demand) : 0;

  const assessNext = async () => {
    const y = Number(s.fy.slice(0, 4)) + 1;
    if (!confirm(t('{fy} या आर्थिक वर्षाची कर आकारणी सर्व मालमत्तांसाठी तयार करायची?', { fy: `${y}-${y + 1}` }))) return;
    const r = await api.post('/tax/assess', { financial_year: `${y}-${y + 1}` });
    setMsg(t('✔ {fy}: {n} मालमत्तांची आकारणी तयार', { fy: r.financial_year, n: r.created }));
  };

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">{t('💰 मालमत्ता कर')} {s && <small className="muted">{t('आर्थिक वर्ष')} {s.fy}</small>}</h2>
        <div className="row-gap">
          <button className="btn btn-primary" onClick={() => setAdding(!adding)}>{adding ? t('रद्द') : t('+ नवीन मालमत्ता')}</button>
          {user.role === 'admin' && s && <button className="btn btn-light" onClick={assessNext}>{t('📋 पुढील वर्षाची आकारणी')}</button>}
        </div>
      </div>
      {msg && <div className="alert alert-ok">{msg}</div>}
      {adding && masters.data && <NewProperty wards={masters.data.wards} onDone={() => { setAdding(false); list.reload(); summary.reload(); }} />}

      {s && (
        <div className="stats">
          <div className="stat"><span className="stat-icon">🏠</span><div><div className="stat-value">{s.total.properties}</div><div className="stat-label">{t('मालमत्ता')}</div></div></div>
          <div className="stat"><span className="stat-icon">📋</span><div><div className="stat-value">{fmtMoney(s.total.demand)}</div><div className="stat-label">{t('एकूण मागणी')}</div></div></div>
          <div className="stat ok"><span className="stat-icon">✅</span><div><div className="stat-value">{fmtMoney(s.total.collected)}</div><div className="stat-label">{t('वसुली ({pct}%)', { pct })}</div></div></div>
          <div className="stat danger"><span className="stat-icon">⏳</span><div><div className="stat-value">{fmtMoney(s.total.demand - s.total.collected)}</div><div className="stat-label">{t('थकबाकी')}</div></div></div>
        </div>
      )}

      {s && (
        <div className="grid-2">
          <div className="card">
            <h3 className="card-title">{t('प्रभागनिहाय वसुली')}</h3>
            {s.byWard.map((w) => {
              const p = w.demand ? Math.round((100 * w.collected) / w.demand) : 0;
              return (
                <div key={w.id} className="progress-row">
                  <span>{t(w.name)}</span>
                  <div className="progress"><div style={{ width: `${p}%` }} /></div>
                  <small>{p}% · {fmtMoney(w.collected)}</small>
                </div>
              );
            })}
          </div>
          <div className="card">
            <h3 className="card-title">{t('कर प्रकारानुसार')}</h3>
            <table className="table"><tbody>{s.byHead.map((h) => (
              <tr key={h.tax_head}><td>{h.tax_head === 'water' ? '🚰' : '🏠'} {t(h.head_name)}</td><td>{t('मागणी')} {fmtMoney(h.demand)}</td><td><b>{t('वसुली')} {fmtMoney(h.collected)}</b></td>
                <td>{h.demand ? Math.round((100 * h.collected) / h.demand) : 0}%</td></tr>
            ))}</tbody></table>
            <h3 className="card-title" style={{ marginTop: 14 }}>{t('भरण्याची पद्धत')}</h3>
            <table className="table"><tbody>{s.modes.map((m) => <tr key={m.payment_mode}><td>{m.payment_mode}</td><td>{t('{n} पावत्या', { n: m.n })}</td><td><b>{fmtMoney(m.amount)}</b></td></tr>)}</tbody></table>
            <p className="muted small">{t('दर (₹/चौ.फू./वर्ष): निवासी {r} · व्यावसायिक {c} · औद्योगिक {i} · मिश्र {m}', { r: s.rates.RESIDENTIAL, c: s.rates.COMMERCIAL, i: s.rates.INDUSTRIAL, m: s.rates.MIXED })}<br />
              {t('३० जूनपूर्वी पूर्ण भरल्यास ५% सवलत · ३० सप्टेंबरनंतर दरमहा २% दंड')}</p>
          </div>
        </div>
      )}

      <div className="card filters">
        <ExportButtons rows={list.data || []} filename="property-tax" title={t('मालमत्ता कर यादी')}
          columns={[['property_no', 'मालमत्ता क्र.'], ['owner_name', 'मालक'], ['ward_name', 'प्रभाग'], ['type_name', 'प्रकार'], ['built_up_area_sqft', 'क्षेत्र'], ['total_payable', 'एकूण कर'], ['amount_paid', 'भरलेले'], ['payment_status', 'स्थिती']]} />
        <input placeholder={t('🔎 मालमत्ता क्र. / मालक / पत्ता')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('सर्व')}</option>
          {Object.entries(PAY_STATUS).map(([k, [l]]) => <option key={k} value={k}>{t(l)}</option>)}
        </select>
      </div>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>{t('मालमत्ता क्र.')}</th><th>{t('मालक')}</th><th>{t('प्रभाग')}</th><th>{t('प्रकार / क्षेत्र')}</th><th>{t('चालू वर्ष कर')}</th><th>{t('भरलेले')}</th><th>{t('स्थिती')}</th></tr></thead>
          <tbody>
            {list.data?.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/tax/${p.id}`}><b>{p.property_no}</b></Link></td>
                <td>{p.owner_name}<br /><small className="muted">{p.address}</small></td>
                <td>{t(p.ward_name)}</td>
                <td>{t(p.type_name)}<br /><small className="muted">{p.built_up_area_sqft} {t('चौ.फू.')}</small></td>
                <td>{fmtMoney(p.total_payable)}</td><td>{fmtMoney(p.amount_paid)}</td>
                <td>{p.payment_status && <span className={`badge ${PAY_STATUS[p.payment_status][1]}`}>{t(PAY_STATUS[p.payment_status][0])}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
