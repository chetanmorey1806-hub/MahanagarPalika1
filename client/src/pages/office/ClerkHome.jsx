// लिपिक / कार्यालयीन कर्मचारी — काउंटरवरील रोजची कामे मोठ्या बटणांवर
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth.jsx';
import InboxPanel from '../../components/InboxPanel.jsx';
import { useT } from '../../i18n/index.jsx';

const ACTIONS = [
  ['/complaint/new', '📢', 'नवीन तक्रार नोंद', 'फोन / WhatsApp / प्रत्यक्ष'],
  ['/approvals?new=1', '📝', 'दाखला / परवाना अर्ज', 'जन्म, मृत्यू, बांधकाम, व्यापार, नळ'],
  ['/tax', '💰', 'मालमत्ता कर भरणा', 'शोधा → भरणा → पावती'],
  ['/efiles', '📁', 'ई-ऑफिस फाईल्स', 'नवीन फाईल / पुढे पाठवा'],
  ['/grievances', '🔎', 'तक्रार स्थिती', 'नागरिकाला माहिती द्या'],
  ['/work-orders', '🛠️', 'मला दिलेली कामे', 'अधिकाऱ्यांचे आदेश'],
];

export default function ClerkHome() {
  const { user } = useAuth();
  const t = useT();
  return (
    <div>
      <div className="hello">
        <div>{t('नमस्कार,')} <b>{user.name}</b></div>
        <small className="muted">{t(user.designation)} · {t(user.department_name)} · {t(user.ward_name) || t('मुख्यालय')}</small>
      </div>
      <InboxPanel />
      <h3 className="section-title">{t('आजची कामे')}</h3>
      <div className="action-grid">
        {ACTIONS.map(([to, icon, label, sub]) => (
          <Link key={to} to={to} className="big-tile">
            <span className="tile-icon">{icon}</span>
            <b>{t(label)}</b>
            <small>{t(sub)}</small>
          </Link>
        ))}
      </div>
    </div>
  );
}
