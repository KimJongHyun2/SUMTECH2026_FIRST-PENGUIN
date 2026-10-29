// /phone 휴대폰 측면 카메라 (F8·F10, docs/prd.md 6절): 연결 요청 → PC 승인 → 측면 촬영·전송 → 종료 요청 시 촬영 종료·확인
// 이 화면은 저장소를 열지 않고 기록을 남기지 않는다. 승인 전에는 카메라를 켜지 않는다.
import { ERRORS, TOKEN_PATTERN } from '../../../shared/deep-protocol.js';
import { cameraErrorMessage } from '../camera.js';
import { onView } from '../ctx.js';
import { PhoneLink } from '../deep-link.js';
import { $, show } from '../format.js';
import { SideCamera } from '../side-camera.js';

// 초당 4회 + heartbeat. 서버 한도(초당 20개) 안에서 PC의 1초 동기화 허용 오차를 넉넉히 채운다.
const SEND_MS = 250;

const STATE_LABELS = {
  idle: '-',
  connecting: '연결 서버 접속 중',
  ready: '연결 요청 전',
  requesting: '연결 요청 중',
  pending: 'PC 승인 대기',
  linked: '연결됨',
  stopped: '촬영 종료',
  revoked: '연결 끊김',
  rejected: '연결 거절됨',
  offline: '연결 서버 끊김',
};

const STATUS_TEXT = {
  connecting: '연결 서버에 접속하고 있어요…',
  ready: "'연결 요청'을 누르면 PC 화면에 요청이 표시돼요",
  requesting: '연결을 요청하고 있어요…',
  pending: "PC 화면에서 '연결 승인'을 눌러 주세요",
  linked: "PC에서 승인했어요. '측면 촬영 시작'을 누르고 휴대폰을 옆에 세워 귀와 어깨가 옆모습으로 보이게 해 주세요",
  offline: '연결 서버에 접속할 수 없어요. PC 화면의 QR 주소로 열었는지 확인해 주세요',
};

const END_TEXT = {
  stopped: '촬영을 종료했어요. 이 창을 닫아도 돼요',
  pc_closed: 'PC 화면이 닫혀 연결이 끊겼어요. 촬영을 멈췄어요. 다시 쓰려면 PC의 새 QR을 찍어 주세요',
  pc_timeout: 'PC 응답이 끊겨 연결을 해제했어요. 촬영을 멈췄어요. 다시 쓰려면 PC의 새 QR을 찍어 주세요',
  stop_timeout: '종료 확인이 늦어 연결을 해제했어요. 촬영을 멈췄어요',
  closed: '연결 서버와 연결이 끊겨 촬영을 멈췄어요. 다시 쓰려면 PC의 새 QR을 찍어 주세요',
};

let link = null;
let camera = null;
let token = null;
let timer = null;
let wakeLock = null;
let last = null;
let message = '';
let error = '';
let ended = false; // 종료 요청·연결 해제를 받았으면 다시 촬영하지 않는다

function stopCapture() {
  clearInterval(timer);
  timer = null;
  camera?.stop();
  wakeLock?.release().catch(() => {});
  wakeLock = null;
  last = null;
}

function capture() {
  last = camera.analyze();
  link.sendSide(last);
  camera.draw(last.landmarks);
  render();
}

async function startCapture(facing) {
  error = '';
  message = '카메라와 분석 모델을 준비하고 있어요…';
  render();
  stopCapture();
  try {
    await camera.start(facing);
  } catch (err) {
    camera.stop();
    message = '';
    error = cameraErrorMessage(err).replace("'카메라 켜기'", "'측면 촬영 시작'");
    render();
    return;
  }
  // 카메라를 준비하는 사이 종료 요청을 받았거나 연결이 끝났으면 촬영하지 않는다.
  if (ended || link.status !== 'linked') {
    stopCapture();
    render();
    return;
  }
  try {
    // 휴대폰 화면이 꺼지면 촬영이 멈추므로, 지원하는 브라우저에서는 화면 꺼짐을 막는다.
    wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    wakeLock = null;
  }
  if (ended || link.status !== 'linked') {
    stopCapture();
    render();
    return;
  }
  timer = setInterval(capture, SEND_MS);
  message = '측면 입력을 PC로 보내고 있어요. 귀와 어깨가 옆모습으로 보이게 휴대폰을 고정해 주세요';
  render();
}

function onLinkEvent(type, detail) {
  if (type === 'stop' || type === 'end') ended = true;
  if (type === 'stop') {
    // 실제로 카메라를 끈 뒤에만 종료 확인을 보낸다.
    stopCapture();
    link.confirmStop(detail);
    message = END_TEXT.stopped;
  } else if (type === 'end') {
    stopCapture();
    message = END_TEXT[detail] ?? END_TEXT.closed;
  }
  render();
}

$('phone-request').onclick = () => {
  error = '';
  link.requestConnect(token);
  render();
};
$('phone-camera').onclick = () => startCapture(camera.facing);
$('phone-flip').onclick = () => startCapture(camera.facing === 'user' ? 'environment' : 'user');

function render() {
  const status = link?.status ?? 'idle';
  const capturing = Boolean(camera?.on);
  $('phone-state').textContent = STATE_LABELS[status];
  $('phone-capture').textContent = capturing ? '켜짐' : '꺼짐';
  $('phone-angle').textContent = last?.valid ? `${last.angleDeg.toFixed(1)}°` : (capturing ? '귀·어깨를 찾는 중' : '-');
  const done = ['linked', 'stopped', 'revoked'].includes(status);
  show($('phone-request'), !done);
  $('phone-request').disabled = status !== 'ready';
  show($('phone-camera'), status === 'linked' && !capturing && !timer && !ended);
  show($('phone-flip'), status === 'linked' && capturing);
  show($('phone-preview'), capturing);
  $('phone-msg').textContent = message || STATUS_TEXT[status] || '';
  const shown = error || (status === 'rejected' ? link.notice : '');
  $('phone-error').textContent = shown;
  show($('phone-error'), Boolean(shown));
}

onView('/phone', () => {
  if (link) {
    render();
    return;
  }
  camera = new SideCamera($('phone-video'), $('phone-preview'));
  token = new URLSearchParams(location.search).get('token');
  if (!token || !TOKEN_PATTERN.test(token)) {
    error = ERRORS.invalid_token;
    render();
    return;
  }
  link = new PhoneLink();
  link.on((type, detail) => {
    if (type === 'change') render();
    else onLinkEvent(type, detail);
  });
  openLink();
});

/** 분석 모델을 먼저 불러온 뒤 연결 서버에 붙는다. 승인 뒤 모델 로딩으로 heartbeat가 끊겨 연결이 해제되지 않게 한다. */
async function openLink() {
  message = '분석 모델을 준비하고 있어요…';
  render();
  try {
    await camera.prepare();
  } catch (err) {
    console.error(err);
    message = '';
    error = `분석 모델을 불러오지 못했어요. 페이지를 새로고침해 주세요. (${err?.message ?? err})`;
    render();
    return;
  }
  message = '';
  link.open();
  render();
}
