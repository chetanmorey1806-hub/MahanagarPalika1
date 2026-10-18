// प्रशिक्षण व्हिडिओ — पहा व डाऊनलोड करा (मराठी / हिंदी / English)
import { useState } from 'react';
import { Download, PlayCircle } from 'lucide-react';
import { api } from '../api.js';
import { useLang, useT } from '../i18n/index.jsx';
import { useFetch } from '../utils.js';

const LABEL = { mr: 'मराठी', hi: 'हिंदी', en: 'English' };

export default function TrainingVideo() {
  const t = useT();
  const { lang } = useLang();
  const { data } = useFetch(() => api.get('/training'));
  const available = (data || []).filter((v) => v.available);
  const [sel, setSel] = useState(null);
  if (!data) return null;
  const cur = available.find((v) => v.lang === (sel || lang)) || available[0];

  return (
    <div className="card training-card">
      <h3 className="card-title"><PlayCircle size={20} color="#d9480f" /> {t('प्रशिक्षण व्हिडिओ — software कसे वापरायचे')}</h3>
      {!cur ? (
        <p className="muted">{t('व्हिडिओ अजून तयार होत आहे — थोड्या वेळाने पहा.')}</p>
      ) : (
        <>
          {available.length > 1 && (
            <div className="tabs small" style={{ marginBottom: 10 }}>
              {available.map((v) => <button key={v.lang} className={cur.lang === v.lang ? 'active' : ''} onClick={() => setSel(v.lang)}>{LABEL[v.lang]}</button>)}
            </div>
          )}
          <video key={cur.lang} className="training-video" controls preload="metadata" playsInline src={`/api/training/${cur.lang}.mp4`}>
            <track kind="subtitles" srcLang={cur.lang} label={LABEL[cur.lang]} src={`/api/training/${cur.lang}.srt`} />
          </video>
          <div className="row-gap" style={{ marginTop: 10 }}>
            <a className="btn btn-primary" href={`/api/training/${cur.lang}.mp4?download=1`} download><Download size={16} /> {t('व्हिडिओ डाऊनलोड करा')} ({LABEL[cur.lang]} · {cur.size_mb} MB)</a>
            <a className="btn btn-light" href={`/api/training/${cur.lang}.srt?download=1`} download>{t('सबटायटल (.srt)')}</a>
          </div>
          <p className="muted small">{t('डाऊनलोड केलेला व्हिडिओ WhatsApp वर पाठवता येतो किंवा प्रशिक्षण कार्यशाळेत प्रोजेक्टरवर दाखवता येतो.')}</p>
        </>
      )}
    </div>
  );
}
