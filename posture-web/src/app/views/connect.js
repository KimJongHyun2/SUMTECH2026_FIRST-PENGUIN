// /connect 딥 모드 PC 연결 화면: QR·연결 승인(F8), 양쪽 기준 등록(F9), 딥 모드 탐지 시작(F3)
import QRCode from 'qrcode';
import { DeepBaselineCollector, sideUsable } from '../../core/deep.js';
import { app, camera, link, onLive, onView, placeCamera } from '../ctx.js';
import { $, show } from '../format.js';
import { baselineRecord, beginRegistration, turnOnCamera } from './setup.js';
import { startSession } from './watch.js';

let shownToken = null;
let startPending = false;

const phoneUrl = (token) => `${location.origin}/phone?token=${encodeURIComponent(token)}`;
const usableSide = () => (link.linked && !link.idle ? link.side : null);

/** 측면 입력이 정면 입력과 결합할 수 있는 상태인지 (서버 시각 기준 나이·품질) */
export const sideReady = () => sideUsable(usableSide(), link.serverNow());

async function renderQr() {
  const token = link.qr?.token ?? null;
  if (token === shownToken) return;
  shownToken = token;
  if (!token) return;
  await QRCode.toCanvas($('connect-qr'), phoneUrl(token), { width: 180, margin: 1 });
  $('connect-qr-link').textContent = phoneUrl(token);
}

function connectionText() {
  if (link.linked) return '연결됨';
  if (link.request) return '연결 요청 있음';
  if (link.lostReason) return '연결 끊김';
  if (link.stop.status === 'confirmed') return '종료됨';
  return link.status === 'open' ? '대기' : '연결 서버 확인 중';
}

function qrText() {
  if (!link.qr) return '-';
  if (link.linked) return '사용됨';
  const left = Math.ceil((link.qr.expiresAt - link.serverNow()) / 1000);
  return left > 0 ? `${left}초 남음` : '만료됨 · 새 QR을 만들어 주세요';
}

function sideText() {
  if (!link.linked) return '-';
  if (link.idle) return '입력 중단';
  const side = link.side;
  if (!side) return '받는 중';
  return sideReady() ? `유효 · ${side.angleDeg.toFixed(1)}°` : '무효 · 판정 보류';
}

function tryStart() {
  if (app.frame.quality !== 'valid' || !sideReady()) return false;
  startPending = false;
  startSession(Date.now(), 'deep');
  return true;
}

$('connect-approve').onclick = () => link.approve();
$('connect-reject').onclick = () => link.reject();
$('connect-qr-new').onclick = () => link.issue();

$('connect-camera-on').onclick = async () => {
  $('connect-camera-on').disabled = true;
  $('connect-msg').textContent = '카메라와 분석 모델을 준비하고 있어요…';
  const error = await turnOnCamera();
  $('connect-camera-on').disabled = false;
  $('connect-msg').textContent = '';
  $('connect-error').textContent = error ?? '';
  show($('connect-error'), Boolean(error));
  placeCamera();
};

$('connect-register').onclick = () => {
  const deep = new DeepBaselineCollector();
  beginRegistration($('connect-msg'), () => {
    $('connect-msg').textContent = '양쪽 기준 자세가 등록됐어요';
  }, {
    collector: { push: (t, front) => deep.push(t, front, usableSide(), link.serverNow()) },
    toRecord: (features, now, result) => ({ ...baselineRecord(features, now), kind: 'deep', side: result.side }),
  });
};

$('connect-start').onclick = () => {
  if (tryStart()) return;
  startPending = true;
  $('connect-msg').textContent = '정면·측면 입력이 모두 유효하면 바로 시작해요';
};

function liveConnect() {
  if (app.view !== '/connect') return;
  renderQr();
  const active = app.session && app.session.state !== 'ended';
  show($('connect-approve'), Boolean(link.request));
  show($('connect-reject'), Boolean(link.request));
  show($('connect-qr-box'), Boolean(link.qr) && !link.linked);
  $('connect-qr-new').disabled = link.linked || link.status !== 'open';
  $('connect-state').textContent = connectionText();
  $('connect-qr-state').textContent = qrText();
  $('connect-side').textContent = sideText();
  $('connect-camera').textContent = camera.on ? '켜짐' : '꺼짐';
  $('connect-baseline').textContent = app.baseline?.kind === 'deep' ? `ID ${app.baseline.id}` : '없음';
  $('connect-register').disabled = !link.linked || !camera.on || Boolean(app.registration);
  const canStart = app.baseline?.kind === 'deep' && link.linked && camera.on && !app.registration && !active;
  $('connect-start').disabled = !canStart;
  if (!canStart) startPending = false;
  else if (startPending) tryStart();
  if (link.error) {
    $('connect-error').textContent = link.error;
    show($('connect-error'), true);
  }
}

onView('/connect', () => {
  link.open();
  liveConnect();
});
link.onChange(liveConnect);
onLive(liveConnect);
