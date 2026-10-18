// मीटर रीडर: मीटर निवडा → फोटो काढा → आकडा आपोआप ओळखला जातो (OCR) → तपासा → जागेवरच बिल
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { fmtDate, fmtMoney, useFetch } from '../../utils.js';
import PhotoCapture from '../../components/PhotoCapture.jsx';
import { preloadOcr, readMeter } from '../../ocr.js';

function ReadingForm({ meter, onDone }) {
  const t = useT();
  const [shot, setShot] = useState(null);
  const [ocr, setOcr] = useState(null); // 'reading' | { value, confidence } | { error }
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { preloadOcr(); }, []);

  const onShot = async (s) => {
    setShot(s); setErr('');
    setOcr('reading');
    const r = await readMeter(s.raw || s.dataUrl);
    setOcr(r);
    if (r.value) setValue(r.value);
  };
  const units = value !== '' ? Math.round((Number(value) - meter.last_reading) * 100) / 100 : null;

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.post(`/water/meters/${meter.id}/reading`, {
        reading: Number(value), photo: shot.dataUrl, ocr_value: ocr?.value ?? null, ocr_confidence: ocr?.confidence ?? null,
        lat: shot.meta.lat, lng: shot.meta.lng, capturedAt: shot.meta.capturedAt,
      });
      onDone(r);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="card center-card">
      <h3>💧 {meter.meter_no}</h3>
      <p className="muted">{meter.owner_name} · {meter.property_no} · {t(meter.address || '')}</p>
      <div className="meter-last">{t('मागील आकडा')}: <b>{meter.last_reading}</b> <small className="muted">({fmtDate(meter.last_read_at)})</small></div>
      <PhotoCapture big label={`${t('मीटर')} ${meter.meter_no}`} buttonText={t('📷 मीटरचा फोटो काढा')} onCapture={onShot} />
      {ocr === 'reading' && <div className="alert">🔎 {t('फोटोतील आकडे ओळखत आहे…')}</div>}
      {ocr?.value && <div className="alert alert-ok">🤖 {t('फोटोतून ओळखलेला आकडा')}: <b>{ocr.value}</b>{ocr.confidence > 0 && ` (${t('खात्री')} ${ocr.confidence}%)`} — {t('बरोबर आहे का ते तपासा')}</div>}
      {ocr?.error && <div className="alert alert-error">{t('आकडा आपोआप ओळखता आला नाही — कृपया हाताने टाका')}</div>}
      {shot && (
        <>
          <label>{t('मीटरचा आकडा')}
            <input className="meter-input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
          {units != null && <p>{t('वापर')}: <b className={units < 0 ? 'text-danger' : ''}>{units} {t('युनिट')}</b> ({t('१ युनिट = १००० लिटर')})</p>}
          {err && <div className="alert alert-error">{err}</div>}
          <button className="btn btn-success btn-xl btn-block" disabled={busy || value === '' || units < 0} onClick={submit}>
            {busy ? t('पाठवत आहे…') : t('✔ बिल तयार करा')}
          </button>
        </>
      )}
    </div>
  );
}

export default function MeterReading() {
  const t = useT();
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState(null);
  const [bill, setBill] = useState(null);
  const qs = search ? `?search=${encodeURIComponent(search)}` : '?due=1';
  const { data, reload } = useFetch(() => api.getCached(`/water/meters${qs}`), [qs]);

  if (bill) {
    return (
      <div className="card center-card">
        <div className="big-emoji">🧾</div>
        <h3>{t('बिल तयार झाले')}</h3>
        <div className="ticket">{bill.bill_no}</div>
        <p>{t('वापर')}: <b>{bill.units} {t('युनिट')}</b> · {t('रक्कम')}: <b>{fmtMoney(bill.amount)}</b></p>
        <p className="muted">{t('अंतिम तारीख')}: {bill.due_date} · {t('बिल मालकाला WhatsApp वर पाठवले')}</p>
        <Link className="btn btn-primary btn-block" to={`/water-bill/${bill.id}`}>🧾 {t('बिल पहा / छापा')}</Link>
        <button className="btn btn-light btn-block" onClick={() => { setBill(null); setSel(null); reload(); }}>{t('पुढचा मीटर')} ›</button>
      </div>
    );
  }
  if (sel) {
    return (
      <div>
        <button className="btn btn-ghost" onClick={() => setSel(null)}>‹ {t('मागे')}</button>
        <ReadingForm meter={sel} onDone={setBill} />
      </div>
    );
  }
  return (
    <div>
      <h2 className="page-title">💧 {t('पाणी मीटर रीडिंग')}</h2>
      <input placeholder={t('🔎 मीटर क्र. / मालमत्ता क्र. / नाव')} value={search} onChange={(e) => setSearch(e.target.value)} />
      <p className="muted small" style={{ marginTop: 8 }}>{search ? '' : t('या महिन्यात वाचायचे बाकी असलेले मीटर:')}</p>
      {data?.length === 0 && <div className="card empty">🎉 {t('सर्व मीटर वाचून झाले')}</div>}
      {data?.map((m) => (
        <button key={m.id} type="button" className="card task-card meter-card" onClick={() => setSel(m)}>
          <span className="task-icon">💧</span>
          <div><b>{m.meter_no} · {m.owner_name}</b><small>{m.property_no} · {t(m.address || '')}</small>
            <small>{t('मागील आकडा')}: {m.last_reading} · {fmtDate(m.last_read_at)}</small></div>
          <span className="chev">›</span>
        </button>
      ))}
    </div>
  );
}
