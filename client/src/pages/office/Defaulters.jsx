// कर थकबाकीदार यादी — प्रभागनिहाय, रकमेनुसार; एका क्लिकवर WhatsApp नोटीस
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Send } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useT } from '../../i18n/index.jsx';
import { fmtDate, fmtMoney, useFetch } from '../../utils.js';
import ExportButtons from '../../components/Export.jsx';

export default function Defaulters() {
  const t = useT();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [minDue, setMinDue] = useState('');
  const [ward, setWard] = useState('');
  const [sel, setSel] = useState(new Set());
  const [msg, setMsg] = useState('');
  const masters = useFetch(() => api.get('/masters'));
  const qs = new URLSearchParams({ ...(search && { search }), ...(minDue && { min_due: minDue }), ...(ward && { ward_id: ward }) }).toString();
  const { data: d, reload } = useFetch(() => api.get(`/tax/defaulters${qs ? `?${qs}` : ''}`), [qs]);
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const notice = async (ids) => {
    const r = await api.post('/tax/defaulters/notice', { property_ids: ids });
    setMsg(t('✔ {n} मालकांना थकबाकी नोटीस WhatsApp वर पाठवली', { n: r.sent })); setSel(new Set()); reload();
  };
  const wardScoped = ['officer', 'clerk'].includes(user.role) && user.ward_id;

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">⚠️ {t('कर थकबाकीदार यादी')} {d && <small className="muted">{d.fy}</small>}</h2>
        <ExportButtons rows={d?.list || []} filename="tax-defaulters" title="कर थकबाकीदार यादी"
          columns={[['property_no', 'मालमत्ता क्र.'], ['owner_name', 'मालक'], ['ward_name', 'प्रभाग'], ['address', 'पत्ता'], [(x) => x.years.join(', '), 'थकीत वर्षे'], ['penalty', 'दंड'], ['total_due', 'एकूण थकबाकी'], ['last_paid_at', 'शेवटचा भरणा']]} />
      </div>
      {d && (
        <div className="stats">
          <div className="stat danger"><span className="stat-icon">👥</span><div><div className="stat-value">{d.count}</div><div className="stat-label">{t('थकबाकीदार मालमत्ता')}</div></div></div>
          <div className="stat danger"><span className="stat-icon">💸</span><div><div className="stat-value">{fmtMoney(d.total_due)}</div><div className="stat-label">{t('एकूण थकबाकी (दंडासह)')}</div></div></div>
          {d.byWard.slice(0, 3).map((w) => (
            <div key={w.ward} className="stat"><span className="stat-icon">📍</span><div><div className="stat-value">{fmtMoney(w.due)}</div><div className="stat-label">{t(w.ward)}</div><div className="stat-sub">{w.count} {t('मालमत्ता')}</div></div></div>
          ))}
        </div>
      )}
      <div className="card filters">
        <input placeholder={t('🔎 मालमत्ता क्र. / मालक')} value={search} onChange={(e) => setSearch(e.target.value)} />
        {!wardScoped && (
          <select value={ward} onChange={(e) => setWard(e.target.value)}>
            <option value="">{t('सर्व प्रभाग')}</option>{masters.data?.wards.map((w) => <option key={w.id} value={w.id}>{t(w.name)}</option>)}
          </select>
        )}
        <select value={minDue} onChange={(e) => setMinDue(e.target.value)}>
          <option value="">{t('कोणतीही रक्कम')}</option>
          {[1000, 5000, 10000, 25000].map((n) => <option key={n} value={n}>≥ {fmtMoney(n)}</option>)}
        </select>
      </div>
      {msg && <div className="alert alert-ok">{msg}</div>}
      {sel.size > 0 && (
        <div className="card bulk-bar">
          <b>{t('{n} निवडल्या', { n: sel.size })}</b>
          <button className="btn btn-primary" onClick={() => notice([...sel])}><Send size={15} /> {t('थकबाकी नोटीस पाठवा (WhatsApp)')}</button>
          <button className="btn btn-light" onClick={() => setSel(new Set())}>{t('रद्द')}</button>
        </div>
      )}
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th><input type="checkbox" onChange={(e) => setSel(e.target.checked ? new Set((d?.list || []).slice(0, 100).map((x) => x.property_id)) : new Set())} /></th>
            <th>{t('मालमत्ता')}</th><th>{t('मालक')}</th><th>{t('थकीत वर्षे')}</th><th>{t('दंड')}</th><th>{t('एकूण थकबाकी')}</th><th>{t('शेवटचा भरणा')}</th><th>{t('नोटीस')}</th></tr></thead>
          <tbody>
            {d?.list.slice(0, 200).map((x) => (
              <tr key={x.property_id} className={sel.has(x.property_id) ? 'row-sel' : ''}>
                <td><input type="checkbox" checked={sel.has(x.property_id)} onChange={() => toggle(x.property_id)} /></td>
                <td><Link to={`/tax/${x.property_id}`}><b>{x.property_no}</b></Link><br /><small className="muted">{t(x.ward_name)} · {t(x.type_name)}</small></td>
                <td>{x.owner_name}<br /><small className="muted">{x.owner_mobile}</small></td>
                <td>{x.years.map((y) => <span key={y} className="badge b-rejected">{y}</span>)}<br /><small className="muted">{x.heads.map((h) => t(h)).join(', ')}</small></td>
                <td className="text-danger">{fmtMoney(x.penalty)}</td>
                <td><b>{fmtMoney(x.total_due)}</b></td>
                <td>{x.last_paid_at ? fmtDate(x.last_paid_at) : <span className="text-danger">{t('कधीच नाही')}</span>}</td>
                <td>{x.last_notice_at ? <small>✔ {fmtDate(x.last_notice_at)}</small> : <button className="btn btn-sm btn-light" onClick={() => notice([x.property_id])}><Send size={13} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
