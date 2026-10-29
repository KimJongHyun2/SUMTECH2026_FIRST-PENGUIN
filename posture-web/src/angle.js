import './style.css';
import { angleFromPoints } from './signals.js';
import { createRecorder, timestampForFile } from './recorder.js';

const $ = (id) => document.getElementById(id);
const canvas = $('photo');
const ctx = canvas.getContext('2d');
const recorder = createRecorder(['photo', 'app_angle', 'manual_angle', 'diff']);
recorder.start();

let files = [];
let index = 0;
let image = null;
let clicks = [];

// side.html이 저장한 파일명(..._app-72.4.png)에서 앱 각도를 읽는다.
const appAngleFromName = (name) => {
  const m = name.match(/_app-(-?\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};

$('files').onchange = (e) => {
  files = [...e.target.files];
  index = 0;
  load();
};

function load() {
  clicks = [];
  $('save').disabled = true;
  $('angle').textContent = '-';
  if (index >= files.length) {
    $('progress').textContent = files.length ? '모든 사진 완료' : '';
    image = null;
    return;
  }
  const file = files[index];
  $('progress').textContent = `${index + 1} / ${files.length} · ${file.name}`;
  const app = appAngleFromName(file.name);
  $('app').textContent = app === null ? '파일명에 앱 각도 없음' : `앱 각도 ${app}°`;

  const img = new Image();
  img.onload = () => {
    image = img;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    redraw();
  };
  img.src = URL.createObjectURL(file);
}

function redraw() {
  if (!image) return;
  ctx.drawImage(image, 0, 0);
  const colors = ['#ef4444', '#3b82f6'];
  clicks.forEach((p, i) => {
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(4, canvas.width / 150), 0, Math.PI * 2);
    ctx.fill();
  });
  if (clicks.length === 2) {
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = Math.max(2, canvas.width / 300);
    ctx.beginPath();
    ctx.moveTo(clicks[0].x, clicks[0].y);
    ctx.lineTo(clicks[1].x, clicks[1].y);
    ctx.stroke();
  }
}

canvas.onclick = (e) => {
  if (!image || clicks.length >= 2) return;
  // 화면에 축소돼 보이므로 실제 사진 픽셀 좌표로 바꾼다.
  const rect = canvas.getBoundingClientRect();
  clicks.push({
    x: ((e.clientX - rect.left) / rect.width) * canvas.width,
    y: ((e.clientY - rect.top) / rect.height) * canvas.height,
  });
  redraw();
  if (clicks.length === 2) {
    $('angle').textContent = `${angleFromPoints(clicks[0], clicks[1]).toFixed(1)}°`;
    $('save').disabled = false;
  }
};

$('reset').onclick = () => { clicks = []; $('save').disabled = true; $('angle').textContent = '-'; redraw(); };

$('save').onclick = () => {
  const manual = angleFromPoints(clicks[0], clicks[1]);
  const app = appAngleFromName(files[index].name);
  recorder.push({
    photo: files[index].name,
    app_angle: app,
    manual_angle: manual,
    diff: app === null ? null : app - manual,
  });
  $('count').textContent = `${recorder.count}장`;
  index += 1;
  load();
};

$('download').onclick = () => recorder.download(`compare_${timestampForFile()}.csv`);
