import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { STATUS, timeLeft, useFetch } from '../../utils.js';

export default function Tasks() {
  const t = useT();
  const [done, setDone] = useState(false);
  const { data, loading, error } = useFetch(() => api.getCached(`/grievances/my-tasks${done ? '?done=1' : ''}`), [done]);

  return (
    <div>
      <h2 className="page-title">📋 {t('माझी कामे')}</h2>
      <div className="tabs">
        <button className={!done ? 'active' : ''} onClick={() => setDone(false)}>⏳ {t('बाकी')}</button>
        <button className={done ? 'active' : ''} onClick={() => setDone(true)}>✅ {t('पूर्ण')}</button>
      </div>
      {loading && <p className="muted">{t('लोड होत आहे…')}</p>}
      {error && <div className="alert alert-error">{error.message}</div>}
      {data?.length === 0 && <div className="card empty">{done ? t('अजून पूर्ण काम नाही') : t('🎉 सर्व कामे पूर्ण!')}</div>}
      {data?.map((task) => {
        const tl = timeLeft(task.sla_due_at);
        return (
          <Link key={task.id} to={`/tasks/${task.id}`} className={`card task-card ${task.overdue ? 'late' : ''}`}>
            <span className="task-icon">{task.icon}</span>
            <div>
              <b>{t(task.category)}</b>
              <small>{task.address}</small>
              <small>
                <span className={`badge ${STATUS[task.status].cls}`}>{t(STATUS[task.status].label)}</span>{' '}
                {!done && <span className={tl.late ? 'text-danger' : 'muted'}>⏱ {tl.text}</span>}
              </small>
            </div>
            <span className="chev">›</span>
          </Link>
        );
      })}
    </div>
  );
}
