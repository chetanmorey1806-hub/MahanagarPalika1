// कर्मचारी: माझे स्टार, गुण, क्रमांक व विभागाचा लीडरबोर्ड
import { api } from '../../api.js';
import { currentLocale, useT } from '../../i18n/index.jsx';
import { useFetch } from '../../utils.js';
import Stars from '../../components/Stars.jsx';

const MEDAL = ['🥇', '🥈', '🥉'];

export default function MyStars() {
  const t = useT();
  const { data, loading } = useFetch(() => api.getCached('/performance/me'));
  const board = useFetch(() => api.getCached('/performance/leaderboard'));
  if (loading) return <p className="muted">{t('लोड होत आहे…')}</p>;
  const me = data?.me;
  const monthName = data && new Date(`${data.month}-01`).toLocaleDateString(currentLocale(), { month: 'long', year: 'numeric' });

  return (
    <div>
      <h2 className="page-title">🏆 {t('माझी कामगिरी')}</h2>
      {me && (
        <div className="card center-card perf-card">
          <small className="muted">{monthName}</small>
          <div className="rank-big">{me.rank <= 3 ? MEDAL[me.rank - 1] : `#${me.rank}`}</div>
          <b>{t('{total} पैकी {rank} वा क्रमांक', { total: data.total, rank: me.rank })}</b>
          <Stars value={me.stars} size={34} />
          <div className="perf-grid">
            <div><b>{me.points}</b><small>{t('गुण')}</small></div>
            <div><b>{me.on_time}</b><small>{t('वेळेत काम')}</small></div>
            <div><b>{me.attendance_days}</b><small>{t('हजेरी दिवस')}</small></div>
            <div><b>{me.avg_rating ?? '—'}</b><small>{t('नागरिक रेटिंग')}</small></div>
          </div>
          <small className="muted">{t('वेळेत काम = १० गुण · उशिरा = ४ · हजेरी = २ · पुन्हा उघडलेले काम = −५')}</small>
        </div>
      )}

      <h3 className="section-title">🏅 {t('विभागातील टॉप कर्मचारी')}</h3>
      <div className="card">
        {board.data?.workers.slice(0, 10).map((w) => (
          <div key={w.id} className={`leader-row ${w.id === me?.id ? 'me' : ''}`}>
            <span className="leader-rank">{w.rank <= 3 ? MEDAL[w.rank - 1] : w.rank}</span>
            <div><b>{w.name}</b><small className="muted">{t(w.ward_name)}</small></div>
            <Stars value={w.stars} size={14} />
            <b>{w.points}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
