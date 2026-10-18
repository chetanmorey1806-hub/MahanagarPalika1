// तक्रार काम फलक (Kanban): करायची | काम सुरू | तपासणी बाकी (फोटो आले) | बंद
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCheck, RotateCcw } from 'lucide-react';
import { api } from '../../api.js';
import { useT } from '../../i18n/index.jsx';
import { useLive } from '../../live.js';
import { timeLeft, useFetch } from '../../utils.js';
import ExportButtons from '../../components/Export.jsx';

const COLS = [
  ['todo', 'करायची (To-Do)', (g) => ['new', 'assigned'].includes(g.status)],
  ['doing', 'काम सुरू', (g) => g.status === 'in_progress'],
  ['review', 'तपासणी बाकी (फोटो आले)', (g) => g.status === 'resolved'],
  ['closed', 'बंद', (g) => g.status === 'closed'],
];

export default function Kanban() {
  const t = useT();
  const { data, reload } = useFetch(() => api.get('/grievances'));
  const [sel, setSel] = useState(new Set());
  const [msg, setMsg] = useState('');
  useLive('grievance', useCallback(() => reload(), [reload]));

  const cols = useMemo(() => COLS.map(([key, label, fn]) => [key, label, (data || []).filter(fn).slice(0, key === 'closed' ? 30 : 200)]), [data]);
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const bulk = async (action) => {
    setMsg('');
    const r = await api.post('/grievances/bulk-review', { ids: [...sel], action });
    setMsg(t('✔ {n} तक्रारी अपडेट झाल्या', { n: r.done }) + (r.failed.length ? ` · ✖ ${r.failed.length}` : ''));
    setSel(new Set());
    reload();
  };

  return (
    <div>
      <div className="page-head">
        <h2 className="page-title">🗂️ {t('काम फलक (Kanban)')}</h2>
        <ExportButtons rows={data || []} filename="grievances" title="तक्रारी"
          columns={[['ticket_no', 'तिकीट'], ['category', 'प्रकार'], ['ward_name', 'प्रभाग'], ['address', 'ठिकाण'], ['assigned_name', 'कर्मचारी'], ['status', 'स्थिती'], ['sla_due_at', 'SLA मुदत']]} />
      </div>
      {sel.size > 0 && (
        <div className="card bulk-bar">
          <b>{t('{n} निवडल्या', { n: sel.size })}</b>
          <button className="btn btn-success" onClick={() => bulk('close')}><CheckCheck size={16} /> {t('सर्व मान्य करून बंद करा')}</button>
          <button className="btn btn-warn" onClick={() => bulk('reopen')}><RotateCcw size={16} /> {t('पुन्हा करायला सांगा')}</button>
          <button className="btn btn-light" onClick={() => setSel(new Set())}>{t('रद्द')}</button>
        </div>
      )}
      {msg && <div className="alert alert-ok">{msg}</div>}
      <div className="kanban">
        {cols.map(([key, label, items]) => (
          <div key={key} className={`kb-col kb-${key}`}>
            <div className="kb-head">
              <span>{t(label)}</span><b>{items.length}</b>
              {key === 'review' && items.length > 0 && (
                <button className="btn btn-sm btn-light" onClick={() => setSel(new Set(items.map((g) => g.id)))}>{t('सर्व निवडा')}</button>
              )}
            </div>
            <div className="kb-body">
              {items.map((g) => {
                const tl = timeLeft(g.sla_due_at);
                const open = key !== 'closed';
                return (
                  <div key={g.id} className={`kb-card ${g.overdue ? 'late' : ''} ${sel.has(g.id) ? 'sel' : ''}`}>
                    {key === 'review' && <input type="checkbox" checked={sel.has(g.id)} onChange={() => toggle(g.id)} />}
                    <Link to={`/grievances/${g.id}`} className="kb-link">
                      <div className="kb-title">{g.icon} {t(g.category)} {g.priority === 'high' && <span className="badge b-rejected">{t('तातडीचे')}</span>}</div>
                      <small>{g.ticket_no} · {t(g.ward_name)}</small>
                      <small>👷 {g.assigned_name || <span className="text-danger">{t('नेमणूक नाही')}</span>}</small>
                      {open && key !== 'review' && <small className={tl.late ? 'text-danger' : 'muted'}>⏱ {tl.text}</small>}
                      {key === 'review' && (g.before_photo || g.after_photo) && (
                        <div className="kb-photos">{g.before_photo && <img src={g.before_photo} alt="before" />}{g.after_photo && <img src={g.after_photo} alt="after" />}</div>
                      )}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
