// कर्मचाऱ्यांसाठी मुख्य स्क्रीन — मोठे आयकॉन, कमी मजकूर
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth.jsx';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { fmtTime, useFetch } from '../../utils.js';
import InboxPanel from '../../components/InboxPanel.jsx';

const MORE = [
  ['/work-orders', '🛠️', 'कामाचे आदेश'], ['/leave', '🏖️', 'रजा'], ['/advance', '💰', 'अग्रीम'], ['/payslip', '💵', 'पगार'],
  ['/materials', '📦', 'साहित्य'], ['/notices', '📢', 'परिपत्रके'], ['/emergencies', '🚨', 'आपत्कालीन'], ['/directory', '📇', 'संपर्क'],
  ['/help', '❓', 'मदत'], ['/notifications', '🔔', 'सूचना'],
];

export default function WorkerHome() {
  const t = useT();
  const { user } = useAuth();
  const att = useFetch(() => api.getCached('/attendance/today'));
  const tasks = useFetch(() => api.getCached('/grievances/my-tasks'));
  const perf = useFetch(() => api.getCached('/performance/me'));
  const overdue = (tasks.data || []).filter((x) => x.overdue).length;
  const a = att.data;

  return (
    <div>
      <div className="hello">
        <div>{t('नमस्कार,')} <b>{user.name}</b></div>
        <small className="muted">{t(user.designation)} · {t(user.ward_name)}</small>
      </div>

      {user.department_code === 'water' && (
        <div className="big-tiles">
          <Link to="/meter" className="big-tile water-tile">
            <span className="tile-icon">💧</span>
            <b>{t('मीटर रीडिंग')}</b>
            <small>{t('फोटो काढा → बिल')}</small>
          </Link>
          <Link to="/tanker" className="big-tile water-tile">
            <span className="tile-icon">🚰</span>
            <b>{t('टँकर फेरी')}</b>
            <small>{t('OTP ने नोंद')}</small>
          </Link>
        </div>
      )}

      <div className="big-tiles">
        <Link to="/attendance" className={`big-tile ${a?.check_in_at ? 'ok' : 'warn'}`}>
          <span className="tile-icon">{a?.check_in_at ? '✅' : '🧑'}</span>
          <b>{t('हजेरी')}</b>
          <small>{a?.check_in_at ? `${t('आले: {time}', { time: fmtTime(a.check_in_at) })}${a.check_out_at ? ` · ${t('गेले: {time}', { time: fmtTime(a.check_out_at) })}` : ''}` : t('अजून हजेरी नाही')}</small>
        </Link>
        <Link to="/tasks" className={`big-tile ${overdue ? 'danger' : ''}`}>
          <span className="tile-icon">📋</span>
          <b>{t('माझी कामे')}</b>
          <small>{tasks.data ? `${t('{n} प्रलंबित', { n: tasks.data.length })}${overdue ? ` · ${t('{n} उशीर', { n: overdue })}` : ''}` : '…'}</small>
        </Link>
        <Link to="/report" className="big-tile">
          <span className="tile-icon">🎤</span>
          <b>{t('बोलून रिपोर्ट')}</b>
          <small>{t('मराठीत बोला')}</small>
        </Link>
        <Link to="/my-stars" className="big-tile">
          <span className="tile-icon">🏆</span>
          <b>{t('माझे स्टार')}</b>
          <small>{perf.data?.me ? `#${perf.data.me.rank} · ${t('{n} गुण', { n: perf.data.me.points })}` : t('लीडरबोर्ड')}</small>
        </Link>
      </div>

      <InboxPanel showAttendance={false} />

      <div className="small-tiles">
        {MORE.map(([to, icon, label]) => (
          <Link key={to} to={to} className="small-tile"><span>{icon}</span>{t(label)}</Link>
        ))}
      </div>

      {tasks.data?.slice(0, 3).map((task) => (
        <Link key={task.id} to={`/tasks/${task.id}`} className={`card task-card ${task.overdue ? 'late' : ''}`}>
          <span className="task-icon">{task.icon}</span>
          <div><b>{t(task.category)}</b><small>{task.address}</small></div>
          <span className="chev">›</span>
        </Link>
      ))}
    </div>
  );
}
