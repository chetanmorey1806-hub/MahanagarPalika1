// कोणत्याही यादी / विजेटचा डेटा एका क्लिकवर CSV, Excel (.xlsx) किंवा PDF मध्ये
import { FileDown, FileSpreadsheet, Printer } from 'lucide-react';
import { useT } from '../i18n/index.jsx';

// columns: [[key | (row) => value, 'शीर्षक'], ...]
function table(rows, columns, t) {
  const head = columns.map(([, label]) => t(label));
  const body = rows.map((r) => columns.map(([k]) => {
    const v = typeof k === 'function' ? k(r) : r[k];
    return v == null ? '' : typeof v === 'string' ? t(v) : v;
  }));
  return { head, body };
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function ExportButtons({ rows, columns, filename = 'report', title }) {
  const t = useT();
  if (!rows?.length) return null;
  const stamp = new Date().toISOString().slice(0, 10);

  const csv = () => {
    const { head, body } = table(rows, columns, t);
    const esc = (c) => `"${String(c).replace(/"/g, '""')}"`;
    download(new Blob(['﻿' + [head, ...body].map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }), `${filename}-${stamp}.csv`);
  };
  const xlsx = async () => {
    const XLSX = await import('xlsx');
    const { head, body } = table(rows, columns, t);
    const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
    ws['!cols'] = head.map((h, i) => ({ wch: Math.min(40, Math.max(10, ...[h, ...body.map((r) => r[i])].map((c) => String(c ?? '').length + 2))) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${filename}-${stamp}.xlsx`);
  };
  const pdf = () => {
    const { head, body } = table(rows, columns, t);
    const w = window.open('', '_blank');
    if (!w) return;
    const cell = (c) => String(c).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${cell(t(title || filename))}</title>
      <link href="https://fonts.googleapis.com/css2?family=Mukta:wght@400;700&display=swap" rel="stylesheet">
      <style>body{font-family:Mukta,Roboto,sans-serif;padding:24px;color:#171a1f}header{display:flex;align-items:center;gap:12px;border-bottom:3px solid #d9480f;padding-bottom:10px;margin-bottom:14px}
      header img{width:54px}h1{margin:0;font-size:20px;color:#5c1608}h2{margin:2px 0 0;font-size:15px;font-weight:600}table{border-collapse:collapse;width:100%;font-size:13px}
      th{background:#fff0e6;text-align:left}th,td{border:1px solid #e6e9ed;padding:6px 8px}small{color:#6b7385}</style></head><body>
      <header><img src="${location.origin}/logo.png"><div><h1>${cell(t('अमरावती महानगरपालिका'))}</h1><h2>${cell(t(title || filename))}</h2><small>${new Date().toLocaleString()}</small></div></header>
      <table><thead><tr>${head.map((h) => `<th>${cell(h)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${cell(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <script>setTimeout(()=>print(),600)</script></body></html>`);
    w.document.close();
  };

  return (
    <span className="export-btns no-print">
      <button type="button" className="btn btn-sm btn-light" onClick={csv} title="CSV"><FileDown size={14} />CSV</button>
      <button type="button" className="btn btn-sm btn-light" onClick={xlsx} title="Excel"><FileSpreadsheet size={14} />Excel</button>
      <button type="button" className="btn btn-sm btn-light" onClick={pdf} title="PDF"><Printer size={14} />PDF</button>
    </span>
  );
}
