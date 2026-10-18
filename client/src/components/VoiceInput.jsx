// मराठी Voice-to-Text (Browser Web Speech API, lang = mr-IN).
// Chrome / Android Chrome मध्ये चालते (इंटरनेट आवश्यक). उपलब्ध नसल्यास बटण दिसत नाही.
import { useEffect, useRef, useState } from 'react';
import { currentLocale, useT } from '../i18n/index.jsx';

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
export const voiceSupported = !!SR;

export default function VoiceInput({ value, onChange, placeholder = 'माईक दाबा आणि मराठीत बोला…', rows = 3, big = false, onVoiceUsed }) {
  const t = useT();
  const rec = useRef(null);
  const base = useRef('');
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');

  useEffect(() => () => rec.current?.abort(), []);

  const start = () => {
    setError('');
    const r = new SR();
    r.lang = currentLocale(); // मराठी mr-IN · हिंदी hi-IN · English en-IN
    r.interimResults = true;
    r.continuous = true;
    base.current = value ? value.trim() + ' ' : '';
    r.onresult = (e) => {
      let final = '';
      let temp = '';
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else temp += e.results[i][0].transcript;
      }
      onChange((base.current + final).trimStart());
      setInterim(temp);
      onVoiceUsed?.();
    };
    r.onerror = (e) => {
      setError(t(e.error === 'not-allowed' ? 'माईक परवानगी द्या' : e.error === 'network' ? 'इंटरनेट आवश्यक आहे' : e.error === 'no-speech' ? 'आवाज ऐकू आला नाही, पुन्हा बोला' : 'आवाज ओळखता आला नाही'));
    };
    r.onend = () => { setListening(false); setInterim(''); };
    rec.current = r;
    r.start();
    setListening(true);
  };
  const stop = () => rec.current?.stop();

  return (
    <div className="voice-input">
      <div className="voice-row">
        <textarea rows={rows} value={value + (interim ? (value ? ' ' : '') + interim : '')} onChange={(e) => onChange(e.target.value)} placeholder={t(placeholder)} />
        {voiceSupported && (
          <button type="button" className={`mic-btn ${listening ? 'on' : ''} ${big ? 'big' : ''}`} onClick={listening ? stop : start} title={t('बोलून लिहा')}>
            {listening ? '⏹' : '🎤'}
          </button>
        )}
      </div>
      {listening && <small className="listening">{t('● ऐकत आहे… बोलून झाल्यावर ⏹ दाबा')}</small>}
      {error && <small className="text-danger">{error}</small>}
    </div>
  );
}
