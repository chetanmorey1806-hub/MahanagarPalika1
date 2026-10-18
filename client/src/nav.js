// भूमिकेनुसार मेनू (BK पद्धत: आडवा मेनू + dropdown गट). लेबल मराठीत — t() ने भाषांतर होते.
import {
  LayoutDashboard, Megaphone, FileSignature, IndianRupee, Users, ClipboardCheck, Wrench, Trophy, FolderOpen, Truck,
  FileText, UserCheck, Palmtree, Wallet, Bell, Package, Contact, HelpCircle, Settings, Home, PlusCircle, Search,
  KanbanSquare, MapPinned, Siren, PiggyBank, HandCoins, Building2, UserCog, BriefcaseBusiness, Droplets, AlertOctagon,
} from 'lucide-react';

const MY = {
  label: 'माझे', icon: UserCog, items: [
    ['/attendance', 'माझी हजेरी', UserCheck], ['/leave', 'रजा', Palmtree], ['/advance', 'अग्रीम / कर्ज अर्ज', HandCoins],
    ['/payslip', 'पगार स्लिप', Wallet], ['/notices', 'परिपत्रके', Bell], ['/materials', 'साहित्य मागणी', Package],
    ['/directory', 'संपर्क यादी', Contact], ['/help', 'मदत व प्रशिक्षण', HelpCircle],
  ],
};

export function navFor(role) {
  if (role === 'clerk') {
    return [
      { label: 'मुख्य (काउंटर)', icon: Home, to: '/' },
      { label: 'नागरिक सेवा', icon: Megaphone, items: [
        ['/complaint/new', 'नवीन तक्रार', PlusCircle], ['/grievances', 'तक्रारी', Search],
        ['/approvals', 'दाखले अर्ज', FileSignature], ['/tax', 'मालमत्ता कर', IndianRupee],
        ['/defaulters', 'कर थकबाकीदार', AlertOctagon], ['/water', 'पाणीपुरवठा (टँकर / बिले)', Droplets],
      ] },
      { label: 'कार्यालय', icon: Building2, items: [
        ['/efiles', 'ई-ऑफिस फाईल्स', FolderOpen], ['/work-orders', 'मला दिलेली कामे', Wrench], ['/emergencies', 'आपत्कालीन घटना', Siren],
      ] },
      MY,
    ];
  }
  const nav = [
    { label: 'डॅशबोर्ड', icon: LayoutDashboard, to: '/' },
    { label: 'नागरिक सेवा', icon: Megaphone, items: [
      ['/grievances', 'तक्रारी', Megaphone], ['/kanban', 'काम फलक (Kanban)', KanbanSquare], ['/approvals', 'दाखले व मंजुरी', FileSignature],
      ['/tax', 'मालमत्ता कर', IndianRupee], ['/defaulters', 'कर थकबाकीदार', AlertOctagon], ['/water', 'पाणीपुरवठा (टँकर / बिले)', Droplets],
      ['/emergencies', 'आपत्कालीन घटना', Siren],
    ] },
    { label: 'कर्मचारी', icon: Users, items: [
      ['/attendance-report', 'हजेरी अहवाल', ClipboardCheck], ['/roster', 'ड्युटी व लाईव्ह लोकेशन', MapPinned],
      ['/approvals-hr', 'रजा / अग्रीम / साहित्य मंजुरी', BriefcaseBusiness], ['/work-orders', 'कामाचे आदेश', Wrench],
      ['/inspections', 'तपासणी भेटी', ClipboardCheck], ['/leaderboard', 'लीडरबोर्ड', Trophy],
    ] },
    { label: 'कार्यालय', icon: Building2, items: [
      ['/efiles', 'ई-ऑफिस फाईल्स', FolderOpen], ['/fleet', 'वाहन ट्रॅकिंग', Truck], ['/budget', 'बजेट व खर्च', PiggyBank],
      ['/reports', 'दैनिक अहवाल', FileText],
    ] },
    MY,
  ];
  if (role === 'admin') nav.push({ label: 'प्रशासन', icon: Settings, items: [['/users', 'कर्मचारी व मास्टर', Settings]] });
  return nav;
}
