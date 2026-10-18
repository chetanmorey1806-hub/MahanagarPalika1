import { useCallback, useEffect, useState } from 'react';
import { currentLocale, tr } from './i18n/index.jsx';

// टीप: खालील labels मराठीत आहेत — दाखवताना t(STATUS[x].label) वापरा.

export const STATUS = {
  new: { label: 'नवीन', cls: 'b-new' },
  assigned: { label: 'नेमणूक झाली', cls: 'b-assigned' },
  in_progress: { label: 'काम सुरू', cls: 'b-progress' },
  resolved: { label: 'काम पूर्ण', cls: 'b-resolved' },
  closed: { label: 'बंद', cls: 'b-closed' },
  rejected: { label: 'नाकारली', cls: 'b-rejected' },
  pending: { label: 'प्रलंबित', cls: 'b-new' },
  approved: { label: 'मंजूर', cls: 'b-resolved' },
  open: { label: 'चालू', cls: 'b-assigned' },
  running: { label: 'चालू', cls: 'b-resolved' },
  idle: { label: 'उभे', cls: 'b-new' },
  maintenance: { label: 'दुरुस्ती', cls: 'b-rejected' },
};

export const ROLE = { worker: 'क्षेत्रीय कर्मचारी', clerk: 'लिपिक (कार्यालयीन)', officer: 'अधिकारी', admin: 'प्रशासक / आयुक्त' };
export const VEHICLE = { garbage: '🚛 कचरा गाडी', tanker: '🚰 पाणी टँकर', jcb: '🚜 जेसीबी', car: '🚗 कार', ambulance: '🚑 रुग्णवाहिका' };

// तारीख / संख्या — निवडलेल्या भाषेनुसार (मराठी: देवनागरी अंक)
export const fmtDate = (d) => (d ? new Date(d).toLocaleString(currentLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtDay = (d) => (d ? new Date(d).toLocaleDateString(currentLocale(), { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtMoney = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
export const num = (n) => (n || 0).toLocaleString(currentLocale());

export function timeLeft(due) {
  const ms = Date.parse(due) - Date.now();
  const h = Math.floor(Math.abs(ms) / 3600e3);
  const m = Math.floor((Math.abs(ms) % 3600e3) / 60e3);
  const t = h >= 24 ? tr('{d} दिवस {h} तास', { d: Math.floor(h / 24), h: h % 24 }) : tr('{h} तास {m} मि.', { h, m });
  return ms < 0 ? { text: tr('{t} उशीर', { t }), late: true } : { text: tr('{t} बाकी', { t }), late: false };
}

export function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error(tr('या डिव्हाइसवर GPS उपलब्ध नाही')));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (e) => reject(new Error(tr(e.code === 1 ? 'कृपया लोकेशन (GPS) परवानगी द्या' : 'GPS लोकेशन मिळाले नाही, पुन्हा प्रयत्न करा'))),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 }
    );
  });
}

// साधा data-fetching hook
export function useFetch(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return Promise.resolve(fn())
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => setState({ data: null, loading: false, error }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}
