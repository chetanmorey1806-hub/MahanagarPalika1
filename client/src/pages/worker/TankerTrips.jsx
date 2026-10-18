// टँकर चालक: आजच्या फेऱ्या → ठिकाणी पोहोचा → नागरिकाकडून OTP घ्या → दिलेले लिटर टाका → नोंद
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { fmtDate, getLocation, useFetch } from '../../utils.js';

export const TRIP_STATUS = { scheduled: ['जायचे आहे', 'b-new'], delivered: ['पाणी दिले', 'b-resolved'], cancelled: ['रद्द', 'b-closed'] };

export function TankerTripList() {
  const t = useT();
  const { data } = useFetch(() => api.getCached('/water/tanker-trips'));
  return (
    <div>
      <h2 className="page-title">🚰 {t('माझ्या टँकर फेऱ्या')}</h2>
      {data?.length === 0 && <div className="card empty">{t('आज फेरी नाही')}</div>}
      {data?.map((x) => (
        <Link key={x.id} to={`/tanker/${x.id}`} className={`card task-card ${x.status === 'scheduled' ? '' : 'done-card'}`}>
          <span className="task-icon">🚰</span>
          <div>
            <b>{t(x.location)}</b>
            <small>{x.trip_no} · {x.litres_requested.toLocaleString('en-IN')} {t('लिटर')} · {x.reg_no || ''}</small>
            <small><span className={`badge ${TRIP_STATUS[x.status][1]}`}>{t(TRIP_STATUS[x.status][0])}</span> {x.delivered_at && fmtDate(x.delivered_at)}</small>
          </div>
          <span className="chev">›</span>
        </Link>
      ))}
    </div>
  );
}

export function TankerTripDetail() {
  const t = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const { data: x, reload } = useFetch(() => api.getCached(`/water/tanker-trips/${id}`), [id]);
  const [otp, setOtp] = useState('');
  const [litres, setLitres] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!x) return <p className="muted">{t('लोड होत आहे…')}</p>;

  const deliver = async () => {
    setBusy(true); setMsg(null);
    try {
      const loc = await getLocation().catch(() => null);
      const r = await api.post(`/water/tanker-trips/${id}/deliver`, { otp, litres_delivered: Number(litres || x.litres_requested), lat: loc?.lat, lng: loc?.lng });
      setMsg({ ok: true, text: t('✅ पाणी दिल्याची नोंद झाली!') + (r.distance_m > 500 ? ` ⚠️ ${t('ठिकाणापासून {n} मी. दूर — अधिकारी तपासतील', { n: r.distance_m })}` : '') });
      reload();
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => nav(-1)}>‹ {t('मागे')}</button>
      <div className="card">
        <div className="task-head"><span className="task-icon xl">🚰</span><div><h2>{t(x.location)}</h2><small className="muted">{x.trip_no} · {x.reg_no}</small></div></div>
        <dl className="dl">
          <dt>{t('पाणी')}</dt><dd><b>{x.litres_requested.toLocaleString('en-IN')} {t('लिटर')}</b></dd>
          <dt>{t('नागरिक')}</dt><dd>{x.citizen_name} {x.citizen_mobile}</dd>
          {x.purpose && <><dt>{t('कारण')}</dt><dd>{t(x.purpose)}</dd></>}
          <dt>{t('स्थिती')}</dt><dd><span className={`badge ${TRIP_STATUS[x.status][1]}`}>{t(TRIP_STATUS[x.status][0])}</span></dd>
        </dl>
        {x.lat && <a className="btn btn-light btn-block" style={{ marginTop: 10 }} href={`https://www.google.com/maps/dir/?api=1&destination=${x.lat},${x.lng}`} target="_blank" rel="noreferrer">🧭 {t('नकाशावर रस्ता दाखवा')}</a>}
      </div>
      {x.status === 'scheduled' ? (
        <div className="card center-card">
          <h3>🔐 {t('नागरिकाकडून OTP घ्या')}</h3>
          <p className="muted">{t('नागरिकाच्या मोबाईलवर ४ अंकी OTP आला आहे. पाणी दिल्यावर तो येथे टाका.')}</p>
          <input className="otp-input" inputMode="numeric" maxLength={4} placeholder="• • • •" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} />
          <label>{t('दिलेले पाणी (लिटर)')}<input inputMode="numeric" placeholder={String(x.litres_requested)} value={litres} onChange={(e) => setLitres(e.target.value.replace(/\D/g, ''))} /></label>
          <button className="btn btn-success btn-xl btn-block" disabled={busy || otp.length !== 4} onClick={deliver}>{busy ? t('पाठवत आहे…') : t('✔ पाणी दिले — नोंद करा')}</button>
        </div>
      ) : x.status === 'delivered' && (
        <div className="alert alert-ok">✅ {t('{n} लिटर पाणी दिले', { n: x.litres_delivered?.toLocaleString('en-IN') })} · {fmtDate(x.delivered_at)}{x.delivery_distance_m != null && ` · 📍 ${x.delivery_distance_m} ${t('मी.')}`}</div>
      )}
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-error'}`}>{msg.text}</div>}
    </div>
  );
}
