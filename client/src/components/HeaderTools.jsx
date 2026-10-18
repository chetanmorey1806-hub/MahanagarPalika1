// Header मधील साधने: भाषा, Light/Dark, Push सूचना
import { useEffect, useRef, useState } from 'react';
import { Languages, Moon, Sun, BellRing } from 'lucide-react';
import { LANGS, useLang } from '../i18n/index.jsx';
import { useTheme } from '../theme.js';
import { enablePush, pushSupported, refreshPush } from '../push.js';

export function useClickAway(ref, onAway) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onAway(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onAway]);
}

export function LangSwitch({ variant = 'pill' }) {
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useClickAway(ref, () => setOpen(false));
  const cur = LANGS.find((l) => l.code === lang);
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className={variant === 'pill' ? 'pill-btn' : 'theme-chip'} onClick={() => setOpen(!open)} title={t('भाषा निवडा')}>
        <Languages size={15} /> <span>{cur.label}</span>
      </button>
      {open && (
        <div className="pop-menu">
          {LANGS.map((l) => (
            <button key={l.code} type="button" className={`pop-item ${l.code === lang ? 'active' : ''}`} onClick={() => { setLang(l.code); setOpen(false); }}>
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ThemeToggle({ variant = 'tool' }) {
  const [theme, toggle] = useTheme();
  const { t } = useLang();
  const dark = theme === 'dark';
  if (variant === 'chip') {
    return <button type="button" className="theme-chip" onClick={toggle}>{dark ? <Sun size={15} /> : <Moon size={15} />} {dark ? t('Light') : t('Dark')}</button>;
  }
  return <button type="button" className="tool-btn" onClick={toggle} title={dark ? t('Light') : t('Dark')}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>;
}

export function PushButton() {
  const { t } = useLang();
  const [state, setState] = useState(() => (pushSupported() ? Notification.permission : 'unsupported'));
  useEffect(() => { refreshPush(); }, []);
  if (state !== 'default') return null;
  const on = async () => {
    try { await enablePush(); setState('granted'); } catch (e) { alert(e.message); setState(Notification.permission); }
  };
  return <button type="button" className="pill-btn hide-md" onClick={on} title={t('अ‍ॅप बंद असतानाही सूचना मिळवा')}><BellRing size={15} /><span>{t('सूचना चालू करा')}</span></button>;
}
