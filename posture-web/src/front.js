import './style.css';
import { connectRelay, createFace, createFpsMeter, createPose, drawPoints, poseModelFromUrl, startCamera } from './vision.js';
import { POSE, frontSignals, pitchFromMatrix } from './signals.js';
import { createRecorder, timestampForFile } from './recorder.js';
import { setupPhoneQr } from './phoneQr.js';

const COLUMNS = [
  't_ms', 'participant', 'label',
  'head_forward', 'neck_len', 'pitch_deg', 'shoulder_tilt',
  'ear_vis', 'shoulder_vis', 'infer_ms', 'fps',
  'side_angle', 'side_vis', 'side_age_ms',
];
const SIGNALS = [
  ['head_forward', '① 머리 내밂 (귀 너비 ÷ 어깨 너비)'],
  ['neck_len', '② 목 길이 (귀–어깨 높이 ÷ 어깨 너비)'],
  ['pitch_deg', '③ 고개 pitch (°)'],
  ['shoulder_tilt', '④ 어깨 기울기'],
];
const INTERVAL_MS = 250; // 초당 4회
const BASELINE_MS = 5000;

const $ = (id) => document.getElementById(id);
const video = $('video');
const canvas = $('overlay');
const ctx = canvas.getContext('2d');
const recorder = createRecorder(COLUMNS);
const fpsMeter = createFpsMeter();

let pose;
let face;
let side = null;           // 폰에서 받은 최신 옆모습 값
let baseline = null;       // 신호별 기준 평균
let baselineRows = null;   // 기준 잡는 동안 모으는 행

connectRelay(
  (msg) => { if (msg.type === 'side') side = { ...msg, received: Date.now() }; },
  (ok) => { $('relay').textContent = ok ? '· 중계 연결됨' : '· 중계 끊김'; },
);

setupPhoneQr({ select: $('lan'), canvas: $('qr'), link: $('qr-url') });

$('start').onclick = async () => {
  $('start').disabled = true;
  $('status').textContent = '모델 불러오는 중...';
  try {
    [pose, face] = await Promise.all([createPose(poseModelFromUrl()), createFace()]);
    await startCamera(video, 'user');
  } catch (e) {
    $('status').textContent = `오류: ${e.message}`;
    $('start').disabled = false;
    return;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  $('status').textContent = `실행 중 (pose ${poseModelFromUrl()})`;
  setInterval(tick, INTERVAL_MS);
};

function tick() {
  if (video.readyState < 2) return;
  const w = video.videoWidth;
  const h = video.videoHeight;

  const t0 = performance.now();
  const poseResult = pose.detectForVideo(video, t0);
  const faceResult = face.detectForVideo(video, t0);
  const inferMs = performance.now() - t0;

  const landmarks = poseResult.landmarks?.[0];
  const signals = landmarks ? frontSignals(landmarks, w, h) : null;
  const matrix = faceResult.facialTransformationMatrixes?.[0]?.data;
  const now = Date.now();

  const row = {
    t_ms: now,
    participant: $('participant').value.trim(),
    label: $('label').value,
    ...signals,
    pitch_deg: matrix ? pitchFromMatrix(matrix) : null,
    infer_ms: inferMs,
    fps: fpsMeter(),
    side_angle: side?.angle_deg ?? null,
    side_vis: side ? Math.min(side.ear_vis, side.shoulder_vis) : null,
    side_age_ms: side ? now - side.received : null,
  };

  recorder.push(row);
  collectBaseline(row);
  draw(landmarks, w, h);
  render(row);
}

function collectBaseline(row) {
  if (!baselineRows) return;
  baselineRows.push(row);
  if (row.t_ms - baselineRows[0].t_ms < BASELINE_MS) return;

  baseline = {};
  for (const [key] of SIGNALS) {
    const values = baselineRows.map((r) => r[key]).filter((v) => typeof v === 'number');
    baseline[key] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }
  baselineRows = null;
  $('baseline').disabled = false;
  $('baseline').textContent = '기준 다시 잡기';
}

function draw(landmarks, w, h) {
  ctx.drawImage(video, 0, 0, w, h);
  if (!landmarks) return;
  drawPoints(ctx, [landmarks[POSE.L_EAR], landmarks[POSE.R_EAR]], w, h, '#ef4444');
  drawPoints(ctx, [landmarks[POSE.L_SHOULDER], landmarks[POSE.R_SHOULDER]], w, h, '#3b82f6');
}

const fmt = (v, d = 3) => (typeof v === 'number' ? v.toFixed(d) : '-');

function render(row) {
  $('values').innerHTML = SIGNALS.map(([key, name]) => {
    const base = baseline?.[key];
    const delta = typeof row[key] === 'number' && typeof base === 'number' ? row[key] - base : null;
    return `<tr><td>${name}</td><td>${fmt(row[key])}</td><td>${fmt(base)}</td><td>${fmt(delta)}</td></tr>`;
  }).join('');

  const sideText = row.side_angle === null ? '옆모습 없음' : `옆모습 ${fmt(row.side_angle, 1)}° (${row.side_age_ms}ms 전)`;
  $('meta').textContent =
    `어깨 인식 ${fmt(row.shoulder_vis, 2)} · 귀 인식 ${fmt(row.ear_vis, 2)} · ` +
    `추론 ${fmt(row.infer_ms, 0)}ms · ${row.fps}fps · ${sideText}`;
  $('count').textContent = `${recorder.count}행`;
}

$('baseline').onclick = () => {
  baselineRows = [];
  $('baseline').disabled = true;
  $('baseline').textContent = '바르게 앉아 5초 유지...';
};

$('record').onclick = () => {
  if (recorder.recording) {
    recorder.stop();
    $('record').textContent = '기록 시작';
    $('record').className = '';
  } else {
    recorder.start();
    $('record').textContent = '기록 중지';
    $('record').className = 'danger';
  }
};

$('download').onclick = () => {
  const who = $('participant').value.trim() || 'anon';
  recorder.download(`front_${who}_${timestampForFile()}.csv`);
};

$('clear').onclick = () => {
  if (confirm('기록을 모두 지울까요?')) recorder.clear();
  $('count').textContent = `${recorder.count}행`;
};
