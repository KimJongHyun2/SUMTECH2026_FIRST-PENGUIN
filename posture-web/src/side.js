import './style.css';
import { connectRelay, createFpsMeter, createPose, drawPoints, poseModelFromUrl, startCamera } from './vision.js';
import { POSE, sideAngle } from './signals.js';
import { createRecorder, timestampForFile } from './recorder.js';

const COLUMNS = [
  't_ms', 'participant', 'label', 'condition',
  'angle_deg', 'side', 'ear_vis', 'shoulder_vis', 'infer_ms', 'fps',
];
const INTERVAL_MS = 250; // 초당 4회
const AVG_WINDOW = 4;    // 약 1초 이동평균 (화면 표시용, 기록은 원본값)

const $ = (id) => document.getElementById(id);
const video = $('video');
const canvas = $('overlay');
const ctx = canvas.getContext('2d');
const recorder = createRecorder(COLUMNS);
const fpsMeter = createFpsMeter();
const recent = [];

let pose;
let timer;
let last = null;

const relay = connectRelay(null, (ok) => {
  $('relay').textContent = ok ? '· 노트북으로 전송 중' : '· 중계 끊김';
});

$('start').onclick = async () => {
  $('start').disabled = true;
  $('status').textContent = '모델 불러오는 중...';
  try {
    pose ??= await createPose(poseModelFromUrl());
    await startCamera(video, $('facing').value);
  } catch (e) {
    $('status').textContent = `오류: ${e.message}`;
    $('start').disabled = false;
    return;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  $('status').textContent = `실행 중 (pose ${poseModelFromUrl()})`;
  $('start').disabled = false;
  $('start').textContent = '카메라 다시 시작';
  clearInterval(timer);
  timer = setInterval(tick, INTERVAL_MS);
};

function tick() {
  if (video.readyState < 2) return;
  const w = video.videoWidth;
  const h = video.videoHeight;

  const t0 = performance.now();
  const result = pose.detectForVideo(video, t0);
  const inferMs = performance.now() - t0;
  const landmarks = result.landmarks?.[0];

  ctx.drawImage(video, 0, 0, w, h);
  const s = landmarks ? sideAngle(landmarks, w, h) : null;
  const row = {
    t_ms: Date.now(),
    participant: $('participant').value.trim(),
    label: $('label').value,
    condition: $('condition').value.trim(),
    ...s,
    infer_ms: inferMs,
    fps: fpsMeter(),
  };
  // 인식 실패 프레임도 빈 값으로 남겨야 T2에서 인식률(귀 가림 등)을 계산할 수 있다.
  recorder.push(row);
  $('count').textContent = `${recorder.count}행`;
  if (!s) {
    $('angle').textContent = '-';
    $('meta').textContent = '사람이 인식되지 않음';
    return;
  }

  last = s;
  relay.send({ type: 'side', angle_deg: s.angle_deg, ear_vis: s.ear_vis, shoulder_vis: s.shoulder_vis });

  const ear = landmarks[s.side === 'left' ? POSE.L_EAR : POSE.R_EAR];
  const sh = landmarks[s.side === 'left' ? POSE.L_SHOULDER : POSE.R_SHOULDER];
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(ear.x * w, ear.y * h);
  ctx.lineTo(sh.x * w, sh.y * h);
  ctx.stroke();
  drawPoints(ctx, [ear], w, h, '#ef4444');
  drawPoints(ctx, [sh], w, h, '#3b82f6');

  recent.push(s.angle_deg);
  if (recent.length > AVG_WINDOW) recent.shift();
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  $('angle').textContent = `${s.angle_deg.toFixed(1)}°`;
  $('avg').textContent = `1초 평균 ${avg.toFixed(1)}°`;
  $('meta').textContent =
    `${s.side === 'left' ? '왼쪽' : '오른쪽'} · 귀 인식 ${s.ear_vis.toFixed(2)} · 어깨 인식 ${s.shoulder_vis.toFixed(2)} · ` +
    `추론 ${inferMs.toFixed(0)}ms · ${row.fps}fps`;
}

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
  recorder.download(`side_${who}_${timestampForFile()}.csv`);
};

$('clear').onclick = () => {
  if (confirm('기록을 모두 지울까요?')) recorder.clear();
  $('count').textContent = `${recorder.count}행`;
};

// 점·선 없이 원본 프레임만 저장한다. 파일명의 app-값을 사진 수동 측정 페이지가 읽는다.
$('snapshot').onclick = () => {
  if (!last || video.readyState < 2) return;
  const raw = document.createElement('canvas');
  raw.width = video.videoWidth;
  raw.height = video.videoHeight;
  raw.getContext('2d').drawImage(video, 0, 0);
  raw.toBlob((blob) => {
    const who = $('participant').value.trim() || 'anon';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `side_${who}_${timestampForFile()}_app-${last.angle_deg.toFixed(1)}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/png');
};
