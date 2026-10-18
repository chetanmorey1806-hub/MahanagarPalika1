// भाषा: मराठी (मूळ) · English · हिंदी
//
// वापर:  const t = useT();   t('हजेरी')   t('{n} दिवस', { n: 3 })
// मूळ मजकूर मराठीतच लिहिला आहे आणि तोच key आहे. भाषांतरे src/i18n/dict/*.js मध्ये:
//   export default { en: { 'हजेरी': 'Attendance' }, hi: { 'हजेरी': 'हाज़िरी' } };
// भाषांतर नसल्यास मराठी मजकूर दिसतो — त्यामुळे काहीही तुटत नाही.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const modules = import.meta.glob('./dict/*.js', { eager: true });
const DICT = { en: {}, hi: {} };
for (const m of Object.values(modules)) {
  for (const lang of ['en', 'hi']) Object.assign(DICT[lang], m.default?.[lang] || {});
}

export const LANGS = [
  { code: 'mr', label: 'मराठी', short: 'मरा', locale: 'mr-IN' },
  { code: 'en', label: 'English', short: 'EN', locale: 'en-IN' },
  { code: 'hi', label: 'हिंदी', short: 'हिं', locale: 'hi-IN' },
];

const read = () => {
  try { const l = localStorage.getItem('mnp_lang'); return LANGS.some((x) => x.code === l) ? l : 'mr'; } catch { return 'mr'; }
};
let current = read();
export const currentLang = () => current;
export const currentLocale = () => LANGS.find((l) => l.code === current).locale;

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s);

// Hook नसलेल्या ठिकाणी (api.js, utils) वापरण्यासाठी
export function tr(text, vars) {
  if (text == null || typeof text !== 'string') return text;
  if (current === 'mr') return fill(text, vars);
  return fill(DICT[current][text] ?? text, vars);
}

const LangContext = createContext({ lang: current, setLang: () => {}, t: tr });

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(current);
  const setLang = useCallback((l) => {
    current = l;
    try { localStorage.setItem('mnp_lang', l); } catch { /* खाजगी मोड */ }
    setLangState(l);
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  // lang बदलल्यावर t नवीन बनतो → सर्व components पुन्हा render होतात
  const t = useCallback((text, vars) => tr(text, vars), [lang]); // eslint-disable-line react-hooks/exhaustive-deps
  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
export const useT = () => useContext(LangContext).t;
