// अमरावती महानगरपालिका — App shell (BK पोर्टल पद्धत): gradient header + आडवा मेनू; मोबाईलवर drawer.
// क्षेत्रीय कर्मचाऱ्यांसाठी मोठ्या बटणांचा खालचा मेनू.
import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu, PlusCircle, X, UserCircle2 } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { onQueueChange, queueCount, syncQueue } from '../offline.js';
import { ROLE } from '../utils.js';
import { useT } from '../i18n/index.jsx';
import { navFor } from '../nav.js';
import { LangSwitch, PushButton, ThemeToggle, useClickAway } from './HeaderTools.jsx';
import { useLive } from '../live.js';

const WORKER_NAV = [
  ['/', '🏠', 'मुख्य'],
  ['/attendance', '🧑', 'हजेरी'],
  ['/tasks', '📋', 'कामे'],
  ['/report', '🎤', 'रिपोर्ट'],
  ['/my-stars', '🏆', 'स्टार'],
];

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    queueCount().then(setPending);
    const unsub = onQueueChange(setPending);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); unsub(); };
  }, []);
  return { online, pending };
}

function OfflineBar() {
  const t = useT();
  const { online, pending } = useOnline();
  if (online && !pending) return null;
  return (
    <div className={`offline-bar ${online ? 'syncing' : ''}`}>
      {online ? t('🔄 {n} नोंदी Sync होत आहेत…', { n: pending })
        : t('📴 इंटरनेट नाही — काम सुरू ठेवा, नेटवर्क आल्यावर आपोआप Sync होईल') + (pending ? ` (${pending})` : '')}
      {online && <button className="btn btn-sm btn-light" onClick={syncQueue}>{t('आता Sync करा')}</button>}
    </div>
  );
}

function BellLink() {
  const [n, setN] = useState(0);
  const load = useCallback(() => api.get('/notifications').then((d) => setN(d.unread)).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  useLive('notification', load);
  return <NavLink to="/notifications" className="tool-btn"><Bell size={18} />{n > 0 && <span className="bell-n">{n}</span>}</NavLink>;
}

function Brand({ subtitle }) {
  const t = useT();
  return (
    <NavLink to="/" className="brand-link">
      <span className="header-mark"><img src="/logo.png" alt="" /></span>
      <span className="header-title">
        <h1>{t('अमरावती महानगरपालिका')}</h1>
        <p>{subtitle}</p>
      </span>
    </NavLink>
  );
}

function UserMenu({ user, onLogout }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useClickAway(ref, () => setOpen(false));
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="user-chip" onClick={() => setOpen(!open)}>
        <UserCircle2 size={20} /><span className="hide-sm">{user.name}</span><ChevronDown size={14} />
      </button>
      {open && (
        <div className="pop-menu right">
          <div className="pop-head"><b>{user.name}</b><small>{t(user.designation || ROLE[user.role])}</small>
            <small>{[t(user.department_name || ''), t(user.ward_name || '')].filter(Boolean).join(' · ') || t('सर्व विभाग')}</small></div>
          <button type="button" className="pop-item danger" onClick={onLogout}><LogOut size={15} /> {t('बाहेर पडा')}</button>
        </div>
      )}
    </div>
  );
}

// आडवा मेनू — गटावर क्लिक केल्यावर dropdown
function TopNav({ items }) {
  const t = useT();
  const loc = useLocation();
  const [open, setOpen] = useState(null);
  const ref = useRef();
  useClickAway(ref, () => setOpen(null));
  useEffect(() => setOpen(null), [loc.pathname]);
  const isActive = (g) => (g.to ? (g.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(g.to)) : g.items.some(([to]) => loc.pathname.startsWith(to.split('?')[0])));
  return (
    <nav className="topnav hide-lg-down" ref={ref}>
      <div className="topnav-inner">
        {items.map((g) => {
          const Icon = g.icon;
          if (g.to) return <NavLink key={g.label} to={g.to} end={g.to === '/'} className={`nav-link ${isActive(g) ? 'active' : ''}`}><Icon size={17} className="nav-link-icon" /><span>{t(g.label)}</span></NavLink>;
          return (
            <div key={g.label} className={`nav-group ${open === g.label ? 'open' : ''}`}>
              <button type="button" className={`nav-link ${isActive(g) ? 'active' : ''}`} onClick={() => setOpen(open === g.label ? null : g.label)}>
                <Icon size={17} className="nav-link-icon" /><span>{t(g.label)}</span><ChevronDown size={14} className="nav-caret" />
              </button>
              {open === g.label && (
                <div className="dropdown" data-cols={g.items.length > 5 ? 2 : 1}>
                  {g.items.map(([to, label, ItemIcon]) => (
                    <NavLink key={to} to={to} className={({ isActive: a }) => `dropdown-item ${a ? 'active' : ''}`}><ItemIcon size={16} className="dropdown-icon" />{t(label)}</NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function Drawer({ items, open, onClose }) {
  const t = useT();
  return (
    <>
      <div className={`drawer-scrim ${open ? 'show' : ''}`} onClick={onClose} />
      <aside className={`drawer ${open ? 'open' : ''}`}>
        <div className="drawer-head">
          <span className="header-mark"><img src="/logo.png" alt="" /></span>
          <b>{t('अमरावती महानगरपालिका')}</b>
          <button type="button" className="tool-btn dark" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="drawer-scroll" onClick={onClose}>
          {items.map((g) => (g.to
            ? <NavLink key={g.label} to={g.to} end className="drawer-link"><g.icon size={18} />{t(g.label)}</NavLink>
            : (
              <div key={g.label}>
                <div className="drawer-sec">{t(g.label)}</div>
                {g.items.map(([to, label, Icon]) => <NavLink key={to} to={to} className="drawer-link"><Icon size={18} />{t(label)}</NavLink>)}
              </div>
            )))}
        </div>
      </aside>
    </>
  );
}

// ड्युटीवर असताना दर ५ मिनिटांनी लोकेशन — सुपरवायझरच्या नकाशावर दिसते (हजेरीनंतरच server स्वीकारतो)
function useDutyPing(enabled) {
  useEffect(() => {
    if (!enabled || !navigator.geolocation) return undefined;
    const ping = () => navigator.geolocation.getCurrentPosition(
      (p) => api.post('/attendance/ping', { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }).catch(() => {}),
      () => {}, { enableHighAccuracy: true, maximumAge: 60000, timeout: 20000 });
    ping();
    const i = setInterval(ping, 5 * 60e3);
    return () => clearInterval(i);
  }, [enabled]);
}

export default function Layout() {
  const t = useT();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const doLogout = () => { logout(); nav('/login'); };
  const subtitle = `${t('ई-गव्हर्नन्स प्रणाली')} · ${t(ROLE[user.role])}`;
  useDutyPing(user.role === 'worker');

  if (user.role === 'worker') {
    return (
      <div className="app-page worker-shell">
        <header className="app-header compact">
          <Brand subtitle={subtitle} />
          <div className="header-tools">
            <LangSwitch />
            <ThemeToggle />
            <BellLink />
            <UserMenu user={user} onLogout={doLogout} />
          </div>
        </header>
        <OfflineBar />
        <main className="worker-main"><Outlet /></main>
        <nav className="bottom-nav">
          {WORKER_NAV.map(([to, icon, label]) => (
            <NavLink key={to} to={to} end={to === '/'}><span className="bn-icon">{icon}</span><span>{t(label)}</span></NavLink>
          ))}
        </nav>
      </div>
    );
  }

  const items = navFor(user.role);
  return (
    <div className="app-page app-shell">
      <Drawer items={items} open={drawer} onClose={() => setDrawer(false)} />
      <header className="app-header">
        <button type="button" className="tool-btn menu-btn" onClick={() => setDrawer(true)}><Menu size={20} /></button>
        <Brand subtitle={subtitle} />
        <div className="header-tools">
          <PushButton />
          <NavLink to="/complaint/new" className="pill-btn hide-sm"><PlusCircle size={15} /><span>{t('नवीन तक्रार')}</span></NavLink>
          <LangSwitch />
          <ThemeToggle />
          <BellLink />
          <UserMenu user={user} onLogout={doLogout} />
        </div>
      </header>
      <TopNav items={items} />
      <OfflineBar />
      <main className="app-main content"><Outlet /></main>
      <footer className="app-footer no-print">© {new Date().getFullYear()} {t('अमरावती महानगरपालिका')} — {t('ई-गव्हर्नन्स प्रणाली')}</footer>
    </div>
  );
}
