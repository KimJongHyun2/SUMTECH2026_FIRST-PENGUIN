// /phone 휴대폰 측면 카메라 (F8·F10): QR 토큰으로 연결을 요청하고, PC 승인 뒤 옆모습 각도·품질·시각만 보낸다.
// 촬영 종료 요청을 받으면 카메라를 끈 뒤에만 확인을 보낸다. PC와 연결이 끊기면 스스로 촬영을 멈춘다.
// 휴대폰에는 기록을 저장하지 않는다.
import { CONNECTION_PILOT } from '../../../shared/deep-protocol.js';
import { largestPose, sideAngle } from '../../signals.js';
import { createPose, startCamera } from '../../vision.js';
import { relayUrl } from '../deeplink.js';
import { onView } from '../ctx.js';
import { $ } from '../format.js';

const SEND_EVERY_MS = 400;
const MIN_VISIBILITY = 0.5;
const video = $('phone-video');

const phone = {
  ws: null,
  offset: 0,
  state: '요청 전',
  linked: false,
  seq: 0,
  pose: null,
  timer: null,
  pinger: null,
  lastServerAt: 0,
};

const token = () => new URLSearchParams(location.search).get('token');

function render(message) {
  if (message !== undefined) $('phone-msg').textContent = message;
  $('phone-state').textContent = phone.state;
  $('phone-camera-state').textContent = phone.timer ? '켜짐' : '꺼짐';
  $('phone-request').disabled = Boolean(phone.ws) || !token();
  $('phone-camera').disabled = !phone.linked || Boolean(phone.timer);
}

function send(message) {
  if (phone.ws?.readyState === 1) phone.ws.send(JSON.stringify(message));
}

/** 카메라를 끄고 전송을 멈춘다. 종료 확인은 이 함수가 끝난 뒤에만 보낸다. */
function stopCamera() {
  clearInterval(phone.timer);
  phone.timer = null;
  video.srcObject?.getTracks().forEach((track) => track.stop());
  video.srcObject = null;
}

function unlink(state, message) {
  phone.linked = false;
  phone.state = state;
  stopCamera();
  render(message);
}

function receive(m) {
  phone.lastServerAt = Date.now();
  if (m.type === 'hello' || m.type === 'pong') phone.offset = m.serverTime - Date.now();
  if (m.type === 'hello') {
    send({ type: 'connect.request', token: token() });
  } else if (m.type === 'connect.pending') {
    phone.state = 'PC 승인 대기';
    render('PC 화면에서 연결 승인을 눌러 주세요');
  } else if (m.type === 'connect.rejected') {
    phone.state = '연결 거부';
    render(m.message);
  } else if (m.type === 'link.approved') {
    phone.linked = true;
    phone.state = '연결됨';
    render("연결됐어요. '카메라 켜기'를 누르고 귀와 어깨가 옆에서 보이게 휴대폰을 세워 주세요");
  } else if (m.type === 'stop.request') {
    stopCamera();
    send({ type: 'stop.done', stopId: m.stopId });
    unlink('종료됨', 'PC 요청으로 촬영을 껐어요');
  } else if (m.type === 'link.revoked' || m.type === 'link.closed') {
    unlink('연결 끊김', 'PC와의 연결이 끝나 촬영을 멈췄어요. 다시 쓰려면 PC의 새 QR로 연결해 주세요');
  } else if (m.type === 'error') {
    render(m.message);
  }
}

function sample() {
  const now = performance.now();
  const landmarks = video.readyState >= 2 ? largestPose(phone.pose.detectForVideo(video, now).landmarks) : null;
  // 더 잘 보이는 쪽의 귀–어깨 각도. 좌표는 보내지 않는다.
  const s = landmarks ? sideAngle(landmarks, video.videoWidth, video.videoHeight) : null;
  const valid = Boolean(s && s.ear_vis >= MIN_VISIBILITY && s.shoulder_vis >= MIN_VISIBILITY);
  phone.seq += 1;
  send({
    type: 'side',
    seq: phone.seq,
    t: Date.now() + phone.offset,
    valid,
    angleDeg: valid ? s.angle_deg : null,
    earVis: s?.ear_vis ?? 0,
    shoulderVis: s?.shoulder_vis ?? 0,
  });
  $('phone-angle').textContent = valid ? `${s.angle_deg.toFixed(1)}°` : '인식 안 됨';
}

$('phone-request').onclick = () => {
  const ws = new WebSocket(relayUrl('phone'));
  phone.ws = ws;
  phone.state = '연결 중';
  ws.onmessage = (event) => receive(JSON.parse(event.data));
  ws.onclose = () => {
    if (phone.ws !== ws) return;
    clearInterval(phone.pinger);
    phone.ws = null;
    if (phone.state === '종료됨') render();
    else unlink('연결 끊김', '서버와 연결이 끊겨 촬영을 멈췄어요');
  };
  phone.pinger = setInterval(() => {
    send({ type: 'ping' });
    // PC·서버에서 아무 응답이 없으면 휴대폰이 스스로 촬영을 멈춘다(파일럿 시간).
    if (phone.timer && Date.now() - phone.lastServerAt > CONNECTION_PILOT.phoneStopSeconds * 1000) {
      unlink('연결 끊김', '응답이 없어 촬영을 스스로 멈췄어요');
    }
  }, CONNECTION_PILOT.heartbeatSeconds * 1000);
  render('연결 서버에 접속하고 있어요…');
};

$('phone-camera').onclick = async () => {
  $('phone-camera').disabled = true;
  try {
    phone.pose ??= await createPose();
    await startCamera(video, 'environment');
    phone.timer = setInterval(sample, SEND_EVERY_MS);
    render('옆모습의 각도와 인식 품질을 PC로 보내고 있어요');
  } catch (error) {
    stopCamera();
    render(`카메라를 쓸 수 없어요. 권한을 허용한 뒤 다시 눌러 주세요. (${error?.message ?? error})`);
  }
};

onView('/phone', () => {
  render(token() ? "PC 화면의 QR로 열었어요. '연결 요청'을 눌러 주세요" : 'PC 화면의 딥 모드 QR로 열어 주세요');
});
