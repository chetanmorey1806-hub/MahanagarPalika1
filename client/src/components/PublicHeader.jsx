// नागरिकांसाठीच्या सार्वजनिक पानांचा header — लोगो, नाव, पानाचे शीर्षक, भाषा
import { Link } from 'react-router-dom';
import { useT } from '../i18n/index.jsx';
import { LangSwitch, ThemeToggle } from './HeaderTools.jsx';

export default function PublicHeader({ title }) {
  const t = useT();
  return (
    <header className="public-head">
      <Link to="/login"><img src="/logo.png" alt="" /></Link>
      <span>{t('अमरावती महानगरपालिका')}{title ? ` — ${t(title)}` : ''}</span>
      <span className="spacer" />
      <LangSwitch />
      <ThemeToggle />
    </header>
  );
}
