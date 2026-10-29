// /connect 딥 모드 연결 (F8·F9, docs/prd.md 6절): QR 발급 → 연결 승인 → 측면 배치 → 양쪽 기준 등록 → 딥 모드 탐지 시작
// QR을 만드는 것만으로는 촬영하지 않는다. 휴대폰 요청 뒤 이 화면의 승인으로만 연결한다.
import QRCode from 'qrcode';
import { app, camera, onLive, onView, pcLink, placeCamera, sideInput } from '../ctx.js';
import { LINK_STATUS_LABELS, SIDE_QUALITY_LABELS, phoneUrl } from '../deep-link.js';
import { $, show } from '../format.js';
import { beginRegistration, turnOnCamera } from './setup.js';
import { startSession } from './watch.js';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

let issueWanted = true; // 화면을 처음 열면 연결 서버 접속 뒤 QR을 바로 만든다
let drawnToken = null;
let startPending = false;

/** 지금 연결로 양쪽 기준을 등록했는지. 다른 연결(다른 측면 배치)의 기준으로는 시작하지 않는다. */
const deepBaselineReady = () => Boolean(app.link?.linkId)
  && app.baseline?.kind === 'deep' && app.deepBaselineLinkId === app.link.linkId;

const sessionActive = () => Boolean(app.session && app.session.state !== 'ended');

async function drawQr(link) {
  if (link.token === drawnToken) return;
  drawnToken = link.token;
  const url = phoneUrl(location.origin, link.token);
  $('connect-qr-url').textContent = url;
  try {
    await QRCode.toCanvas($('connect-qr'), url, { width: 220, margin: 1 });
  } catch (error) {
    console.error(error);
    $('connect-qr-url').textContent = `${url} (QR을 그리지 못했어요. 이 주소를 휴대폰에서 열어 주세요)`;
  }
}

function connectMessage(link, now) {
  const status = link?.status ?? 'connecting';
  if (status === 'connecting' || status === 'idle') return '연결 서버에 접속하고 있어요…';
  if (status === 'offline') {
    // 한 번도 접속하지 못했으면 연결 서버가 없는 실행 환경이다(예: 정적 파일만 제공하는 배포).
    return link.clock.offset === null
      ? '연결 서버에 접속할 수 없어요. 딥 모드는 연결 서버가 함께 실행되는 환경(npm run dev 또는 npm start)에서만 쓸 수 있어요'
      : link.notice;
  }
  if (link.qrExpired(now)) return "QR이 만료됐어요. 'QR 다시 만들기'를 눌러 주세요";
  if (status === 'issued') return '휴대폰 카메라로 QR을 찍어 연결을 요청해 주세요. QR을 만들기만 해서는 촬영하지 않아요';
  if (status === 'requested') return "휴대폰이 연결을 요청했어요. 내 휴대폰이 맞으면 '연결 승인'을 눌러 주세요";
  if (status === 'lost') return "휴대폰 연결이 끊겼어요. 다시 연결하려면 'QR 다시 만들기'를 누르고 새로 승인해 주세요";
  if (status === 'stopped') return "휴대폰 촬영이 끝났어요. 다시 연결하려면 'QR 다시 만들기'를 누르고 새로 승인해 주세요";
  if (status === 'linked') {
    if (sessionActive()) return '진행 중인 세션이 있어요. 세션을 종료한 뒤 딥 모드를 시작해 주세요';
    return deepBaselineReady()
      ? "양쪽 기준이 등록됐어요. '딥 모드 탐지 시작'을 눌러 주세요"
      : "연결됐어요. 휴대폰을 옆에 세워 귀·어깨가 옆모습으로 보이게 한 뒤 '카메라 켜기'와 '기준 자세 등록'을 눌러 주세요";
  }
  return link.notice;
}

function tryStart(now) {
  if (app.frame.quality !== 'valid' || sideInput(now).quality !== 'valid') return false;
  startPending = false;
  startSession(now, 'deep');
  return true;
}

$('connect-qr-new').onclick = () => {
  const link = pcLink();
  // 접속 중이면 접속이 끝난 뒤(ready) 만든다.
  if (link.status === 'connecting') issueWanted = true;
  else link.issueQr();
};
$('connect-approve').onclick = () => app.link?.approve();
$('connect-reject').onclick = () => app.link?.reject();

$('connect-camera-on').onclick = async () => {
  $('connect-camera-on').disabled = true;
  $('connect-reg-msg').textContent = '카메라와 분석 모델을 준비하고 있어요…';
  const error = await turnOnCamera();
  $('connect-camera-on').disabled = false;
  $('connect-reg-msg').textContent = '';
  $('connect-camera-error').textContent = error ?? '';
  show($('connect-camera-error'), Boolean(error));
  placeCamera();
};

$('connect-register').onclick = () => {
  const linkId = app.link?.linkId;
  beginRegistration($('connect-reg-msg'), () => { app.deepBaselineLinkId = linkId; }, { deep: true });
};

$('connect-start').onclick = () => {
  if (tryStart(Date.now())) return;
  startPending = true;
  $('connect-reg-msg').textContent = '정면·측면 입력이 모두 유효해지면 바로 시작해요';
};

function liveConnect(now = Date.now()) {
  if (app.view !== '/connect' || !app.link) return;
  const link = app.link;
  const status = link?.status ?? 'idle';
  if (issueWanted && status === 'ready') {
    issueWanted = false;
    link.issueQr();
  }
  const showQr = status === 'issued' && !link.qrExpired(now);
  show($('connect-qr-box'), showQr);
  if (showQr) {
    drawQr(link);
    const left = Math.max(0, Math.ceil((link.expiresAt - link.serverNow(now)) / 1000));
    $('connect-qr-expiry').textContent = `QR 유효 시간 ${left}초 남음`;
  }
  show($('connect-host-warning'), showQr && LOCAL_HOSTS.includes(location.hostname));
  $('connect-host-warning').textContent = `지금 주소(${location.host})는 휴대폰에서 열 수 없어요. 휴대폰과 같은 네트워크에서 이 PC의 주소(예: https://192.168.0.10:5173)로 이 화면을 다시 열어 주세요`;
  show($('connect-approve'), status === 'requested');
  show($('connect-reject'), status === 'requested');
  $('connect-qr-new').disabled = ['idle', 'connecting', 'requested', 'linked'].includes(status);
  $('connect-msg').textContent = connectMessage(link, now);

  const side = sideInput(now);
  const linked = Boolean(link?.linked);
  $('connect-state').textContent = LINK_STATUS_LABELS[status];
  $('connect-side').textContent = linked ? SIDE_QUALITY_LABELS[side.quality] : '-';
  $('connect-angle').textContent = linked && side.side?.valid ? `${side.side.angleDeg.toFixed(1)}°` : '-';
  $('connect-baseline').textContent = deepBaselineReady() ? `ID ${app.baseline.id}` : '없음';
  $('connect-chk-front').classList.toggle('ok', camera.on && app.frame.faceFound && app.frame.sample?.shoulder_vis >= 0.5);
  $('connect-chk-side').classList.toggle('ok', linked && side.quality === 'valid');

  $('connect-register').disabled = !camera.on || !linked || Boolean(app.registration);
  const canStart = deepBaselineReady() && camera.on && linked && !app.registration && !sessionActive();
  $('connect-start').disabled = !canStart;
  if (!canStart) startPending = false;
  else if (startPending) tryStart(now);
}

let preparing = null;

/** 분석 모델을 먼저 불러온 뒤 연결 서버에 붙는다. 모델 첫 로딩이 메인 스레드를 막아 연결이 끊기지 않게 한다. */
async function openLink() {
  if (!app.link) {
    $('connect-msg').textContent = '분석 모델을 준비하고 있어요…';
    preparing ??= camera.prepare().catch((error) => {
      console.error(error);
      preparing = null;
    });
    await preparing;
  }
  pcLink();
  liveConnect();
}

onView('/connect', () => {
  placeCamera();
  openLink();
});
onLive(liveConnect);
