import './app.css';
import { createFace, createPose, startCamera } from './vision.js';
import { POSE, frontSignals, pitchFromMatrix } from './signals.js';
import { baselineFrom, classify, createAlertTracker, deltaFrom } from './posture.js';
import { addTime, dayKey, loadDay, markSlouch, saveDay, startSession, summarize } from './report.js';

const TICK_MS = 500;                 // 초당 2회 측정
const WINDOW = 4;                    // 최근 2초 평균으로 판정 (순간 흔들림 무시)
const CALIBRATE_MS = 5000;
const NEW_SESSION_AFTER_AWAY_MS = 2 * 60_000;
const SAVE_EVERY_MS = 10_000;

const STATE_TEXT = {
  good: ['기준 범위 안에 있어요', '등록한 기준과 비슷한 자세예요'],
  warn: ['기준 대비 머리가 조금 앞으로 나왔어요', '자세를 확인해 주세요'],
  bad: ['거북목이에요', '자세를 확인해 주세요'],
  bow: ['기준 대비 고개를 숙이고 있어요', '작업 상황과 자세를 확인해 주세요'],
  away: ['자리를 비웠어요', '돌아오면 다시 측정해요'],
};
const ALERT_TEXT = {
  warn: ['자세 변화가 지속되고 있어요', '30초째 기준보다 머리가 앞으로 나와 있어요. 자세를 확인해 주세요.'],
  bad: ['자세 확인 알림', '30초째 기준보다 머리가 많이 앞으로 나와 있어요. 자세를 확인해 주세요.'],
  bow: ['고개를 오래 숙이고 있어요', '1분 30초째 고개를 숙이고 있어요. 잠깐 고개를 들어 쉬어 주세요.'],
};

const $ = (id) => document.getElementById(id);
const video = $('video');
const canvas = $('preview');
const ctx = canvas.getContext('2d');

let pose;
let face;
let mode = 'idle'; // idle | setup | calibrating | monitoring | paused
let baseline = null;
let calibSamples = [];
let calibStart = 0;
let recent = [];
const tracker = createAlertTracker();
let today = dayKey(Date.now());
let day = loadDay(today);
let lastTick = 0;
let lastSave = 0;
let awaySince = null;
let current = { cls: null, since: 0 };
let showCam = false;
let audio;

// ---------------------------------------------------------------- 화면 전환

function show(section) {
  for (const id of ['intro', 'setup', 'monitor']) $(id).hidden = id !== section;
  placeCamera();
}

function placeCamera() {
  const box = $('cam-box');
  const inSetup = mode === 'setup' || mode === 'calibrating';
  (inSetup ? $('cam-slot-setup') : $('cam-slot-monitor')).append(box);
  box.hidden = !inSetup && !showCam;
}

// ---------------------------------------------------------------- 시작

$('start').onclick = async () => {
  $('start').disabled = true;
  $('start-msg').textContent = '카메라와 AI 모델을 준비하고 있어요. 처음엔 10초쯤 걸려요.';
  try {
    [pose, face] = await Promise.all([createPose('lite'), createFace()]);
    await startCamera(video, 'user');
  } catch (e) {
    $('start').disabled = false;
    $('start-msg').textContent = e.name === 'NotAllowedError'
      ? '카메라 권한이 필요해요. 주소창 왼쪽 아이콘에서 카메라를 허용한 뒤 다시 눌러 주세요.'
      : `시작하지 못했어요: ${e.message}`;
    return;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  audio = new AudioContext();
  mode = 'setup';
  show('setup');
  startTicker();
};

// 탭이 뒤로 가도 측정이 덜 느려지도록 타이머를 워커에서 돌린다.
function startTicker() {
  const src = `setInterval(() => postMessage(0), ${TICK_MS});`;
  const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  worker.onmessage = tick;
}

// ---------------------------------------------------------------- 측정

function sample() {
  const t = performance.now();
  const landmarks = pose.detectForVideo(video, t).landmarks?.[0];
  const matrix = face.detectForVideo(video, t).facialTransformationMatrixes?.[0]?.data;
  const signals = landmarks ? frontSignals(landmarks, video.videoWidth, video.videoHeight) : null;
  return {
    landmarks,
    faceFound: Boolean(matrix),
    s: signals && { ...signals, pitch_deg: matrix ? pitchFromMatrix(matrix) : null },
  };
}

function tick() {
  if (video.readyState < 2 || mode === 'idle' || mode === 'paused') return;
  const now = Date.now();
  const { landmarks, faceFound, s } = sample();
  if (mode !== 'monitoring' || showCam) draw(landmarks);
  if (mode === 'monitoring') monitorTick(now, s);
  else setupTick(now, s, faceFound);
}

function setupTick(now, s, faceFound) {
  const shoulders = Boolean(s && s.shoulder_vis >= 0.5);
  $('chk-face').classList.toggle('ok', faceFound);
  $('chk-shoulder').classList.toggle('ok', shoulders);

  if (mode === 'setup') {
    $('calibrate').disabled = !(faceFound && shoulders);
    if (!shoulders) $('calib-msg').textContent = '어깨까지 보이도록 화면을 살짝 뒤로 젖혀 주세요.';
    else if ($('calib-msg').textContent.startsWith('어깨')) $('calib-msg').textContent = '';
    return;
  }

  if (s) calibSamples.push(s);
  const left = Math.ceil((CALIBRATE_MS - (now - calibStart)) / 1000);
  $('calib-msg').textContent = `움직이지 마세요... ${Math.max(left, 0)}`;
  if (now - calibStart < CALIBRATE_MS) return;

  baseline = baselineFrom(calibSamples);
  if (!baseline) {
    mode = 'setup';
    $('calib-msg').textContent = '어깨가 잘 안 보였어요. 화면 각도를 조정하고 다시 해 주세요.';
    return;
  }
  $('calib-msg').textContent = '';
  beginMonitoring(now);
}

$('calibrate').onclick = () => {
  calibSamples = [];
  calibStart = Date.now();
  mode = 'calibrating';
  $('calibrate').disabled = true;
};

function beginMonitoring(now) {
  mode = 'monitoring';
  recent = [];
  tracker.reset();
  lastTick = now;
  awaySince = null;
  startSession(day, now);
  saveDay(today, day);
  show('monitor');
}

function monitorTick(now, s) {
  rollOverDay(now);
  if (s && s.shoulder_vis >= 0.5) {
    recent.push(s);
    if (recent.length > WINDOW) recent.shift();
  } else {
    recent = [];
  }
  const cls = recent.length ? classify(deltaFrom(recent, baseline)) : 'away';

  if (cls === 'away') {
    awaySince ??= now;
  } else {
    // 오래 자리를 비웠다 돌아오면 "새로 앉은 것"으로 본다.
    if (awaySince !== null && now - awaySince >= NEW_SESSION_AFTER_AWAY_MS) {
      startSession(day, now);
      tracker.reset();
    }
    awaySince = null;
  }

  addTime(day, now, cls, Math.min(now - lastTick, 2000));
  lastTick = now;

  const alert = tracker.update(now, cls);
  if (alert) {
    if (alert.level !== 'bow') markSlouch(day, alert.since);
    notify(alert.level);
  }

  renderState(cls, now);
  if (now - lastSave >= SAVE_EVERY_MS) {
    saveDay(today, day);
    renderReport();
    lastSave = now;
  }
}

function rollOverDay(now) {
  const key = dayKey(now);
  if (key === today) return;
  saveDay(today, day);
  today = key;
  day = loadDay(today);
  startSession(day, now);
}

// ---------------------------------------------------------------- 표시

function draw(landmarks) {
  const w = canvas.width;
  const h = canvas.height;
  // 거울처럼 좌우를 뒤집어 보여준다.
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();
  if (!landmarks) return;
  const dot = (i, color) => {
    const p = landmarks[i];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc((1 - p.x) * w, p.y * h, 6, 0, Math.PI * 2);
    ctx.fill();
  };
  dot(POSE.L_EAR, '#e46a55');
  dot(POSE.R_EAR, '#e46a55');
  dot(POSE.L_SHOULDER, '#4f8fe4');
  dot(POSE.R_SHOULDER, '#4f8fe4');
}

const fmtDuration = (ms) => {
  const sec = Math.floor(ms / 1000);
  return sec < 60 ? `${sec}초` : `${Math.floor(sec / 60)}분 ${sec % 60}초`;
};

const fmtMinutes = (m) => {
  if (m < 1) return `${Math.round(m * 60)}초`;
  if (m < 60) return `${Math.round(m)}분`;
  return `${Math.floor(m / 60)}시간 ${Math.round(m % 60)}분`;
};

function renderState(cls, now) {
  if (current.cls !== cls) current = { cls, since: now };
  const [title, sub] = STATE_TEXT[cls];
  $('status-card').dataset.state = cls;
  $('state-text').textContent = title;
  $('state-sub').textContent = `${sub} · ${fmtDuration(now - current.since)}째`;
  document.title = cls === 'warn' || cls === 'bad' ? '🐢 자세 확인 · 패스트거북이' : '패스트거북이';
}

function renderReport() {
  const s = summarize(day);
  const has = s.minutes > 0;
  $('r-minutes').textContent = has ? fmtMinutes(s.minutes) : '-';
  $('r-good').textContent = has ? `${Math.round(s.goodRatio * 100)}%` : '-';
  $('r-turtle').textContent = has ? fmtMinutes(s.turtleMinutes) : '-';
  $('r-first').textContent = s.avgFirstSlouchMinutes === null ? '-' : fmtMinutes(s.avgFirstSlouchMinutes);

  $('hourly').innerHTML = s.hourly.length
    ? s.hourly.map((h) => {
        const pct = Math.round((h.goodRatio ?? 0) * 100);
        return `<div class="bar" title="${h.hour}시 · 기준 범위 내 ${pct}% · ${fmtMinutes(h.minutes)} 측정">
          <div class="fill${pct < 60 ? ' low' : ''}" style="height:${pct}%"></div><span>${h.hour}시</span></div>`;
      }).join('')
    : '<p class="empty">아직 오늘 기록이 없어요. 측정을 시작해 보세요.</p>';

  const tips = [];
  if (s.avgFirstSlouchMinutes !== null) {
    const every = Math.max(10, Math.floor(s.avgFirstSlouchMinutes / 5) * 5);
    tips.push(`앉은 뒤 평균 ${fmtMinutes(s.avgFirstSlouchMinutes)} 만에 머리 전방 이탈이 감지됐어요. ${every}분마다 한 번씩 일어나 목을 풀어 주세요.`);
  }
  const counted = s.hourly.filter((h) => h.minutes >= 5);
  if (counted.length >= 2) {
    const worst = counted.reduce((a, b) => (b.goodRatio < a.goodRatio ? b : a));
    tips.push(`${worst.hour}시대에 기준 범위를 벗어난 비율이 가장 높았어요.`);
  }
  $('insight').textContent = tips.join(' ');
}

// ---------------------------------------------------------------- 알림

function notify(level) {
  const [title, body] = ALERT_TEXT[level];
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, tag: 'barunmok' });
  }
  beep(level === 'bad' ? 880 : 660);
}

function beep(freq) {
  if (!audio) return;
  audio.resume();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.15, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.4);
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + 0.4);
}

function renderNotifyButton() {
  if (!('Notification' in window)) {
    $('notify').hidden = true;
    $('notify-msg').textContent = '이 브라우저는 알림을 지원하지 않아요. 소리와 화면으로만 알려드려요.';
    return;
  }
  const state = Notification.permission;
  $('notify').textContent = state === 'granted' ? '알림 켜짐 ✓' : '알림 받기';
  $('notify').disabled = state === 'granted';
  $('notify-msg').textContent = state === 'denied'
    ? '알림이 차단돼 있어요. 주소창 왼쪽 아이콘에서 알림을 허용해 주세요.'
    : '';
}

$('notify').onclick = async () => {
  await Notification.requestPermission();
  renderNotifyButton();
};

$('pause').onclick = () => {
  if (mode === 'paused') {
    mode = 'monitoring';
    lastTick = Date.now();
    startSession(day, lastTick); // 쉬었다 돌아오면 새로 앉은 것으로 본다
    tracker.reset();
    $('pause').textContent = '일시정지';
  } else {
    mode = 'paused';
    saveDay(today, day);
    renderReport();
    $('status-card').dataset.state = 'away';
    $('state-text').textContent = '일시정지 중';
    $('state-sub').textContent = '다시 시작을 누르면 측정을 이어가요';
    $('pause').textContent = '다시 시작';
  }
};

$('recal').onclick = () => {
  mode = 'setup';
  $('calibrate').disabled = true;
  $('calib-msg').textContent = '';
  show('setup');
};

$('toggle-cam').onclick = () => {
  showCam = !showCam;
  $('toggle-cam').textContent = showCam ? '카메라 숨기기' : '카메라 보기';
  placeCamera();
};

window.addEventListener('pagehide', () => saveDay(today, day));

renderNotifyButton();
renderReport();
