// पाणी मीटरच्या फोटोतून आकडे ओळखणे (OCR) — tesseract.js, मोबाईलवरच चालते.
// सर्व फाईल्स app सोबत /ocr मध्ये (CDN लागत नाही; पहिल्यांदा ~१२ MB, नंतर cache).
let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const w = await createWorker('eng', 1, { workerPath: '/ocr/worker.min.js', corePath: '/ocr/', langPath: '/ocr', gzip: true });
      await w.setParameters({ tessedit_char_whitelist: '0123456789.', tessedit_pageseg_mode: '11' }); // विखुरलेला मजकूर
      return w;
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

export const preloadOcr = () => getWorker().catch(() => null);

function loadImage(src) {
  return new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
}

// मीटरचा आकडा सहसा मध्यभागी असतो — मधला भाग कापून, मोठा करून, काळा-पांढरा (Otsu) करा व कडेला पांढरी जागा ठेवा
async function prepare(dataUrl) {
  const img = await loadImage(dataUrl);
  const cw = img.width * 0.8; const ch = img.height * 0.5;
  const scale = Math.min(2.5, 1400 / cw);
  const pad = 60;
  const c = document.createElement('canvas');
  c.width = Math.round(cw * scale) + pad * 2; c.height = Math.round(ch * scale) + pad * 2;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(img, img.width * 0.1, img.height * 0.25, cw, ch, pad, pad, c.width - pad * 2, c.height - pad * 2);
  const d = x.getImageData(0, 0, c.width, c.height);
  const hist = new Array(256).fill(0);
  const gray = new Uint8Array(d.data.length / 4);
  for (let i = 0, k = 0; i < d.data.length; i += 4, k++) { const g = Math.round(d.data[i] * 0.3 + d.data[i + 1] * 0.59 + d.data[i + 2] * 0.11); gray[k] = g; hist[g]++; }
  // Otsu threshold
  const total = gray.length; let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0; let wB = 0; let best = 0; let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue; const wF = total - wB; if (!wF) break;
    sumB += t * hist[t]; const mB = sumB / wB; const mF = (sum - sumB) / wF; const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  for (let i = 0, k = 0; i < d.data.length; i += 4, k++) { const v = gray[k] < thr ? 0 : 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; }
  x.putImageData(d, 0, 0);
  return c.toDataURL('image/png');
}

// परत: { value: '01777', confidence: 0–100 } किंवा { error }
export async function readMeter(dataUrl) {
  try {
    const w = await getWorker();
    const { data } = await w.recognize(await prepare(dataUrl), {}, { blocks: true });
    // मीटरच्या चाकावरचे आकडे फोटोत सर्वात मोठे असतात — सर्वात उंच अंकांचा शब्द निवडा (इतर छोटे क्रमांक वगळा)
    const words = (data.blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)))
      .map((x) => ({ text: (x.text.match(/\d+(?:\.\d+)?/) || [''])[0], h: x.bbox.y1 - x.bbox.y0, conf: x.confidence }))
      .filter((x) => x.text.replace('.', '').length >= 3);
    words.sort((a, b) => b.h - a.h || b.text.length - a.text.length);
    if (!words[0]) return { error: 'not_found', raw: data.text };
    return { value: words[0].text, confidence: Math.round(words[0].conf || data.confidence || 0) };
  } catch (e) {
    return { error: 'unavailable', message: e.message };
  }
}
