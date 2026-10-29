import '../app.css';
import { averageSamples, frameQuality } from '../core/detector.js';
import { openStore } from '../core/store.js';
import { app, camera, navigate, onView, renderLive, route } from './ctx.js';
import { $, show } from './format.js';
import './views/history.js';
import './views/report.js';
import './views/setup.js';
import { sessionTick } from './views/watch.js';

const TICK_MS = 400;
const SMOOTH_FRAMES = 3;

// 탭이 뒤로 가도 측정이 덜 느려지도록 타이머를 워커에서 돌린다.
function startTicker() {
  const src = `setInterval(() => postMessage(0), ${TICK_MS});`;
  const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  worker.onmessage = tick;
}

function tick() {
  const now = Date.now();
  if (camera.on) {
    const frame = camera.analyze();
    // 기준 등록 중이 아니면 기준 등록 때와 같은 자리·크기인지도 확인한다.
    const quality = frameQuality(frame.sample, app.registration ? null : app.baseline?.features);
    if (quality === 'valid') {
      app.recent.push(frame.sample);
      if (app.recent.length > SMOOTH_FRAMES) app.recent.shift();
    } else {
      app.recent = [];
    }
    app.frame = { quality, faceFound: frame.faceFound, sample: frame.sample, smoothed: averageSamples(app.recent) };
    if (!$('cam-box').hidden) camera.draw(frame.landmarks);
    if (app.registration) registrationTick(now, frame.sample);
  } else {
    app.frame = { quality: 'away', faceFound: false, sample: null, smoothed: null };
  }
  if (app.session) sessionTick(now);
  renderLive(now);
}

function registrationTick(now, sample) {
  const reg = app.registration;
  const result = reg.collector.push(now, sample);
  reg.onProgress(result);
  if (result.status === 'done') {
    app.registration = null;
    reg.onDone(result.baseline, now);
  }
}

// ------------------------------------------------------------ 첫 화면

$('home-start').onclick = () => navigate('/setup');
$('home-deep').onclick = () => navigate('/connect');
$('home-history').onclick = () => navigate('/history');

onView('/', () => {
  show($('home-active'), Boolean(app.session && app.session.state !== 'ended'));
});

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-link]');
  if (!link) return;
  event.preventDefault();
  navigate(link.getAttribute('href'));
});
window.addEventListener('popstate', () => route(location.pathname));

async function init() {
  try {
    app.store = await openStore();
    // 새로고침 등으로 끝나지 않은 세션은 마지막 저장 구간까지만 중단 세션으로 남긴다 (F3).
    await app.store.closeUnfinished();
    app.baseline = await app.store.currentBaseline();
    app.settingsVersion = await app.store.currentSettings();
  } catch (error) {
    console.error(error);
    app.storageError = '기록을 저장할 수 없는 브라우저 상태예요. 기록·기준이 저장되지 않을 수 있어요.';
  }
  startTicker();
  route(location.pathname);
}

init();
