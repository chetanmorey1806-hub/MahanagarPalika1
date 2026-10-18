// चेहरा ओळख (Face Recognition) — मोबाईलवरच चालते. सेल्फीतून १२८ अंकी "चेहऱ्याची ओळख" (descriptor) काढली जाते;
// server ती आधी नोंदवलेल्या चेहऱ्याशी जुळवतो. Models: /models (पहिल्यांदा ~६.५ MB, नंतर cache).
let ready = null;
let faceapi = null;

async function load() {
  faceapi = await import('@vladmandic/face-api');
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
    faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
  ]);
}

export function preloadFace() {
  if (!ready) ready = load().catch((e) => { ready = null; throw e; });
  return ready;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// परत: { descriptor: number[128] } | { error: 'no_face' | 'unavailable' }
export async function faceDescriptor(dataUrl) {
  try {
    await preloadFace();
  } catch {
    return { error: 'unavailable' };
  }
  const img = await loadImage(dataUrl);
  const det = await faceapi
    .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.45 }))
    .withFaceLandmarks(true)
    .withFaceDescriptor();
  if (!det) return { error: 'no_face' };
  return { descriptor: Array.from(det.descriptor) };
}
