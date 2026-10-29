// 평가 전용 빌드의 '테스트 도구' (docs/prd.md 7절). 설정·감지·딥 연결 화면 아래에 같은 도구를 옮겨 붙인다.
// 버튼은 녹화 입력·리포트 주기만 바꾸고, 경고·복귀·리포트는 공통 엔진이 만든다.
import { relayUrl } from '../deeplink.js';
import { REPLAYS, Replay, SimPhone } from '../eval.js';
import { EVAL, app, link, onLive, onRoute, recorded, saveSession } from '../ctx.js';
import { $, show } from '../format.js';

const SLOTS = { '/setup': 'setup-tools', '/watch': 'watch-tools', '/connect': 'connect-tools' };
const ACCEL_SECONDS = 3;

let open = false;
let message = '';

const running = () => app.session?.state === 'running';

function place() {
  const box = $('test-tools');
  const slot = EVAL && SLOTS[app.view] ? $(SLOTS[app.view]) : null;
  if (slot) slot.append(box);
  show(box, Boolean(slot));
}

$('test-tools-toggle').onclick = () => {
  open = !open;
  $('test-tools-toggle').setAttribute('aria-expanded', String(open));
  show($('test-tools-body'), open);
};

$('tt-accel').onclick = () => {
  const session = app.session;
  if (session && session.state !== 'ended') {
    if (session.reports.length) {
      message = '이미 자동 리포트가 있어 가속할 수 없어요';
      return;
    }
    session.accelerateFirstReport(Date.now(), ACCEL_SECONDS);
    saveSession();
    message = `첫 자동 리포트를 유효 ${ACCEL_SECONDS}초에 만들어요. 만든 뒤에는 1800초 주기로 돌아가요`;
    return;
  }
  app.reportAccelPending = ACCEL_SECONDS;
  message = `탐지를 시작하면 첫 자동 리포트를 유효 ${ACCEL_SECONDS}초에 만들어요. 만든 뒤에는 1800초 주기로 돌아가요`;
};

function startReplay(kind) {
  if (!running()) {
    message = '탐지가 진행 중일 때 쓸 수 있어요';
    return;
  }
  app.session.markTest(REPLAYS[kind].name);
  app.replay = new Replay(kind, (clip) => recorded.show(clip));
}

$('tt-front').onclick = () => startReplay('front');
$('tt-away').onclick = () => startReplay('away');

// 테스트 휴대폰 1대가 실제 연결 서버에 휴대폰 역할로 연결을 요청한다. PC 승인은 화면의 '연결 승인'으로 한다.
$('tt-side').onclick = () => {
  if (!link.qr || link.linked || link.request) {
    message = '연결 화면에 유효한 QR이 있고 대기 중일 때 쓸 수 있어요';
    return;
  }
  app.simPhone?.close();
  app.simPhone = new SimPhone(() => recorded.segment?.label, relayUrl('phone'));
  app.simPhone.start(link.qr.token);
  message = '테스트 휴대폰 1대가 연결을 요청했어요 (측면 모의 입력). PC에서 승인해 주세요';
};

$('tt-both').onclick = () => {
  if (app.session?.mode !== 'deep') {
    message = '딥 모드 탐지 중일 때 쓸 수 있어요';
    return;
  }
  startReplay('both');
};

// 측면 입력·연결 신호·종료 응답을 모두 멈춘다. 끊김 판정은 서버·PC가 실제 시간으로 한다.
$('tt-disconnect').onclick = () => {
  if (!app.simPhone || !link.linked) {
    message = '테스트 휴대폰이 연결돼 있을 때 쓸 수 있어요';
    return;
  }
  app.simPhone.silence();
  app.session?.markTest('측면 연결 끊기');
  message = '테스트 휴대폰의 측면 입력·연결 신호·종료 응답을 끊었어요';
};

onRoute(place);
onLive(() => {
  if (!EVAL) return;
  $('test-tools-status').textContent = app.replay?.text ?? message;
});

export function initTools() {
  show($('eval-badge'), EVAL);
}
