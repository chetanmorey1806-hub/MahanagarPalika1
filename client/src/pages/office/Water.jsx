// पाणीपुरवठा विभाग (कार्यालय): टँकर फेरी ठरवा (नागरिकाला OTP) · मीटर बिले
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { useLive } from '../../live.js';
import { fmtDate, fmtMoney, getLocation, useFetch } from '../../utils.js';
import ExportButtons from '../../components/Export.jsx';
import { TRIP_STATUS } from '../worker/TankerTrips.jsx';

function NewTrip({ onDone }) {
  const t = useT();
  const opts = useFetch(() => api.get('/water/tanker-drivers'));
  const [f, setF] = useState({ driver_id: '', vehicle_id: '', location: '', citizen_name: '', citizen_mobile: '', litres_requested: 10000, purpose: '' });
  const [loc, setLoc] = useState(null);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try {
      const r = await api.post('/water/tanker-trips', { ...f, driver_id: +f.driver_id, vehicle_id: f.vehicle_id ? +f.vehicle_id : null, litres_requested: +f.litres_requested, lat: loc?.lat, lng: loc?.lng });
      onDone(r);
    } catch (x) { setErr(x.message); }
  };
  return (
    <form className="card" onSubmit={submit}>
      <h3 className="card-title">🚰 {t('नवीन टँकर फेरी')}</h3>
      <div className="grid-3">
        <label>{t('ठिकाण')}<input required value={f.location} onChange={set('location')} placeholder={t('उदा. शिव मंदिर परिसर')} /></label>
        <label>{t('नागरिकाचे नाव')}<input value={f.citizen_name} onChange={set('citizen_name')} /></label>
        <label>{t('नागरिकाचा मोबाईल (OTP येथे जाईल)')}<input required inputMode="numeric" maxLength={10} value={f.citizen_mobile} onChange={(e) => setF({ ...f, citizen_mobile: e.target.value.replace(/\D/g, '') })} /></label>
        <label>{t('पाणी (लिटर)')}<input type="number" min={500} step={500} value={f.litres_requested} onChange={set('litres_requested')} /></label>
        <label>{t('टँकर चालक')}<select required value={f.driver_id} onChange={set('driver_id')}><option value="">—</option>{opts.data?.drivers.map((d) => <option key={d.id} value={d.id}>{d.name} — {t(d.designation)}</option>)}</select></label>
        <label>{t('टँकर')}<select value={f.vehicle_id} onChange={set('vehicle_id')}><option value="">—</option>{opts.data?.tankers.map((v) => <option key={v.id} value={v.id}>{v.reg_no}</option>)}</select></label>
      </div>
      <div className="row-gap">
        <input placeholder={t('कारण (ऐच्छिक)')} value={f.purpose} onChange={set('purpose')} />
        <button type="button" className="btn btn-light" onClick={async () => setLoc(await getLocation().catch(() => null))}>📍 {loc ? t('लोकेशन घेतले') : t('सध्याचे लोकेशन')}</button>
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      <button className="btn btn-primary">📤 {t('फेरी ठरवा व नागरिकाला OTP पाठवा')}</button>
    </form>
  );
}

export default function Water() {
  const t = useT();
  const [tab, setTab] = useState('tanker');
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');
  const trips = useFetch(() => (tab === 'tanker' ? api.get('/water/tanker-trips') : null), [tab]);
  const bills = useFetch(() => (tab === 'bills' ? api.get('/water/readings') : null), [tab]);
  useLive('tanker', useCallback(() => trips.reload(), [trips.reload])); // eslint-disable-line react-hooks/exhaustive-deps
  const resend = async (id) => { const r = await api.post(`/water/tanker-trips/${id}/resend-otp`); setMsg(t('✔ नवीन OTP नागरिकाला पाठवला') + (r.demo_otp ? ` (demo OTP: ${r.demo_otp})` : '')); };

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">🚰 {t('पाणीपुरवठा विभाग')}</h2>
        {tab === 'tanker' && <button className="btn btn-primary" onClick={() => setAdding(!adding)}>{adding ? t('रद्द') : t('+ नवीन टँकर फेरी')}</button>}
      </div>
      <div className="tabs">
        <button className={tab === 'tanker' ? 'active' : ''} onClick={() => setTab('tanker')}>🚰 {t('टँकर फेऱ्या (OTP)')}</button>
        <button className={tab === 'bills' ? 'active' : ''} onClick={() => setTab('bills')}>💧 {t('मीटर रीडिंग व बिले')}</button>
      </div>
      {msg && <div className="alert alert-ok">{msg}</div>}
      {tab === 'tanker' && (
        <>
          {adding && <NewTrip onDone={(r) => { setAdding(false); setMsg(t('✔ फेरी {no} ठरली — नागरिकाला OTP व चालकाला सूचना गेली', { no: r.trip_no }) + (r.demo_otp ? ` (demo OTP: ${r.demo_otp})` : '')); trips.reload(); }} />}
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>{t('फेरी')}</th><th>{t('ठिकाण')}</th><th>{t('चालक / टँकर')}</th><th>{t('लिटर')}</th><th>{t('स्थिती')}</th><th>{t('OTP पडताळणी')}</th><th /></tr></thead>
              <tbody>
                {trips.data?.map((x) => (
                  <tr key={x.id}>
                    <td><b>{x.trip_no}</b><br /><small className="muted">{fmtDate(x.created_at)}</small></td>
                    <td>{t(x.location)}<br /><small className="muted">{x.citizen_name} · {x.citizen_mobile}</small></td>
                    <td>{x.driver_name}<br /><small className="muted">{x.reg_no || '—'}</small></td>
                    <td>{x.litres_delivered ? `${x.litres_delivered.toLocaleString('en-IN')} / ` : ''}{x.litres_requested.toLocaleString('en-IN')}</td>
                    <td><span className={`badge ${TRIP_STATUS[x.status][1]}`}>{t(TRIP_STATUS[x.status][0])}</span></td>
                    <td>{x.status === 'delivered' ? <>✅ {t('OTP जुळला')} · {fmtDate(x.delivered_at)}{x.delivery_distance_m > 500 && <span className="text-danger"> ⚠️ {x.delivery_distance_m} {t('मी.')}</span>}</> : '—'}</td>
                    <td>{x.status === 'scheduled' && <button className="btn btn-sm btn-light" onClick={() => resend(x.id)}>🔁 OTP</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === 'bills' && (
        <div className="card table-wrap">
          <div className="page-head" style={{ padding: '10px 12px 0' }}>
            <span className="muted small">{t('मीटर रीडरने काढलेल्या फोटोतून आकडे OCR ने ओळखले जातात व जागेवरच बिल तयार होते.')}</span>
            <ExportButtons rows={bills.data || []} filename="water-bills" title="पाणी बिले"
              columns={[['bill_no', 'बिल क्र.'], ['meter_no', 'मीटर क्र.'], ['owner_name', 'मालक'], ['ward_name', 'प्रभाग'], ['previous', 'मागील आकडा'], ['reading', 'चालू आकडा'], ['units', 'वापर'], ['bill_amount', 'रक्कम'], ['bill_status', 'स्थिती']]} />
          </div>
          <table className="table">
            <thead><tr><th>{t('बिल')}</th><th>{t('मालक / मीटर')}</th><th>{t('आकडा')}</th><th>{t('वापर')}</th><th>{t('रक्कम')}</th><th>{t('स्थिती')}</th><th>{t('मीटर रीडर')}</th></tr></thead>
            <tbody>
              {bills.data?.map((b) => (
                <tr key={b.id}>
                  <td><Link to={`/water-bill/${b.id}`}><b>{b.bill_no}</b></Link><br /><small className="muted">{fmtDate(b.read_at)}</small></td>
                  <td>{b.owner_name}<br /><small className="muted">{b.meter_no} · {t(b.ward_name)}</small></td>
                  <td>{b.previous} → <b>{b.reading}</b> {b.manual_override ? '✏️' : '🤖'}</td>
                  <td>{b.units} {t('युनिट')}</td><td>{fmtMoney(b.bill_amount)}</td>
                  <td><span className={`badge ${b.bill_status === 'paid' ? 'b-resolved' : 'b-new'}`}>{t(b.bill_status === 'paid' ? 'भरलेले' : 'बाकी')}</span></td>
                  <td>{b.read_by_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
