// Leaderboard & Best Employee / Best Ward of the Month (डिजिटल प्रमाणपत्र)
import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useFetch } from '../../utils.js';
import Stars from '../../components/Stars.jsx';
import { currentLocale, useT } from '../../i18n/index.jsx';

const MEDAL = ['🥇', '🥈', '🥉'];
const thisMonth = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 7);
const monthName = (m) => new Date(`${m}-01`).toLocaleDateString(currentLocale(), { month: 'long', year: 'numeric' });

function Certificate({ title, name, sub, stats, month, onClose }) {
  const t = useT();
  return (
    <div className="cert-overlay" onClick={onClose}>
      <div className="certificate award" onClick={(e) => e.stopPropagation()}>
        <div className="cert-head">
          <div className="cert-emblem"><img src="/logo.png" alt="" /> 🏆</div>
          <h1>{t('अमरावती महानगरपालिका')}</h1>
          <h2>{title}</h2>
          <small>{monthName(month)}</small>
        </div>
        <p className="center">{t('हे प्रमाणपत्र अभिमानाने प्रदान करण्यात येते')}</p>
        <h1 className="award-name">{name}</h1>
        <p className="center muted">{sub}</p>
        <p className="center">{t('यांनी नागरिकांच्या तक्रारी वेळेत सोडवून उत्कृष्ट सेवा दिल्याबद्दल')}</p>
        <div className="center"><Stars value={stats.stars} size={30} /></div>
        <div className="perf-grid">{stats.items.map(([v, l]) => <div key={l}><b>{v}</b><small>{l}</small></div>)}</div>
        <div className="cert-foot">
          <small className="muted">{t('मनपा ई-गव्हर्नन्स प्रणालीद्वारे निर्मित')}</small>
          <div className="cert-sign"><b>{t('महापालिका आयुक्त')}</b><small>{t('अमरावती महानगरपालिका')}</small></div>
        </div>
        <div className="row-gap no-print">
          <button className="btn btn-primary" onClick={() => window.print()}>{t('🖨️ छापा / PDF')}</button>
          <button className="btn btn-light" onClick={onClose}>{t('बंद')}</button>
        </div>
      </div>
    </div>
  );
}

export default function Leaderboard() {
  const t = useT();
  const { user } = useAuth();
  const [month, setMonth] = useState(thisMonth());
  const [tab, setTab] = useState('workers');
  const [cert, setCert] = useState(null);
  const { data, loading } = useFetch(() => api.get(`/performance/leaderboard?month=${month}`), [month]);
  const winners = useFetch(() => (user.role === 'admin' ? api.get(`/performance/winners?month=${month}`) : null), [month]);
  const w = winners.data;

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">{t('🏆 लीडरबोर्ड व स्टार रेटिंग')}</h2>
        <input type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value)} style={{ width: 'auto' }} />
      </div>

      {w && (
        <div className="grid-2">
          {w.employee && (
            <div className="card winner">
              <span className="winner-icon">🥇</span>
              <div>
                <small className="muted">Best Employee of the Month</small>
                <h3>{w.employee.name}</h3>
                <small>{t(w.employee.designation)} · {t(w.employee.ward_name)}</small>
                <div><Stars value={w.employee.stars} /> <b>{t('{n} गुण', { n: w.employee.points })}</b></div>
              </div>
              <button className="btn btn-sm btn-primary" onClick={() => setCert({
                title: t('सर्वोत्तम कर्मचारी — Employee of the Month'), name: w.employee.name, sub: `${t(w.employee.designation)} · ${t(w.employee.ward_name)}`,
                stats: { stars: w.employee.stars, items: [[w.employee.points, t('गुण')], [w.employee.on_time, t('वेळेत काम')], [`${w.employee.sla_pct ?? 0}%`, t('SLA पालन')], [w.employee.attendance_days, t('हजेरी दिवस')]] },
              })}>{t('📜 प्रमाणपत्र')}</button>
            </div>
          )}
          {w.ward && (
            <div className="card winner">
              <span className="winner-icon">🏙️</span>
              <div>
                <small className="muted">Best Ward of the Month</small>
                <h3>{t(w.ward.name)}</h3>
                <small>SLA {w.ward.sla_pct}% · {t('हजेरी')} {w.ward.attendance_pct}%</small>
                <div><Stars value={w.ward.stars} /> <b>{t('{n} गुण', { n: w.ward.score })}</b></div>
              </div>
              <button className="btn btn-sm btn-primary" onClick={() => setCert({
                title: t('सर्वोत्तम प्रभाग — Best Ward of the Month'), name: t(w.ward.name), sub: t('सर्व अधिकारी व कर्मचारी'),
                stats: { stars: w.ward.stars, items: [[w.ward.score, t('गुण')], [w.ward.resolved, t('निकाली तक्रारी')], [`${w.ward.sla_pct}%`, t('SLA पालन')], [w.ward.avg_rating ?? '—', t('नागरिक रेटिंग')]] },
              })}>{t('📜 प्रमाणपत्र')}</button>
            </div>
          )}
        </div>
      )}

      <div className="tabs">
        <button className={tab === 'workers' ? 'active' : ''} onClick={() => setTab('workers')}>{t('👷 कर्मचारी')}</button>
        <button className={tab === 'wards' ? 'active' : ''} onClick={() => setTab('wards')}>{t('🏙️ प्रभाग')}</button>
      </div>
      {loading && <p className="muted">{t('लोड होत आहे…')}</p>}

      {tab === 'workers' ? (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>{t('कर्मचारी')}</th><th>{t('प्रभाग / विभाग')}</th><th>{t('स्टार')}</th><th>{t('वेळेत')}</th><th>{t('उशिरा')}</th><th>{t('पुन्हा उघडले')}</th><th>{t('हजेरी')}</th><th>{t('नागरिक ★')}</th><th>{t('गुण')}</th></tr></thead>
            <tbody>
              {data?.workers.map((x) => (
                <tr key={x.id}>
                  <td className="leader-rank">{x.rank <= 3 ? MEDAL[x.rank - 1] : x.rank}</td>
                  <td><b>{x.name}</b><br /><small className="muted">{t(x.designation)}</small></td>
                  <td>{t(x.ward_name)}<br /><small className="muted">{t(x.department_name)}</small></td>
                  <td><Stars value={x.stars} size={15} /></td>
                  <td>{x.on_time}</td><td>{x.late}</td><td className={x.reopened ? 'text-danger' : ''}>{x.reopened}</td>
                  <td>{x.attendance_days}</td><td>{x.avg_rating ?? '—'}</td><td><b>{x.points}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>{t('प्रभाग')}</th><th>{t('स्टार')}</th><th>{t('निकाली')}</th><th>{t('SLA पालन')}</th><th>{t('हजेरी')}</th><th>{t('नागरिक ★')}</th><th>{t('प्रलंबित')}</th><th>{t('गुण')}</th></tr></thead>
            <tbody>
              {data?.wards.map((x) => (
                <tr key={x.id}>
                  <td className="leader-rank">{x.rank <= 3 ? MEDAL[x.rank - 1] : x.rank}</td>
                  <td><b>{t(x.name)}</b></td><td><Stars value={x.stars} size={15} /></td>
                  <td>{x.resolved}</td><td>{x.sla_pct}%</td><td>{x.attendance_pct}%</td><td>{x.avg_rating ?? '—'}</td><td>{x.pending}</td><td><b>{x.score}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">{t('कर्मचारी गुण: वेळेत काम ×१० + उशिरा ×४ + हजेरी दिवस ×२ + नागरिक रेटिंग बोनस − पुन्हा उघडलेले ×५. प्रभाग गुण: SLA ६०% + हजेरी २०% + नागरिक रेटिंग २०%.')}</p>
      {cert && <Certificate {...cert} month={month} onClose={() => setCert(null)} />}
    </div>
  );
}
