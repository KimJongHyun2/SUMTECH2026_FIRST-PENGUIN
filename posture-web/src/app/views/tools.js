// 평가 전용 빌드의 '테스트 도구' (docs/prd.md 7절). 설정·감지·딥 연결 화면 아래에 같은 도구를 옮겨 붙인다.
// 버튼은 녹화 입력·측면 모의 입력·리포트 주기만 바꾸고, 경고·복귀·리포트는 공통 엔진이 만든다.
import { REPLAYS, Replay } from '../eval.js';
import { EVAL, app, onLive, onRoute, recorded, saveSession } from '../ctx.js';
import { $, show } from '../format.js';
import { MockPhone } from '../mock-phone.js';

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

// 딥 모드 (S5·S6): 측면 모의 입력은 실제 연결 서버를 거친다. 승인·양쪽 등록·기본 전환은 UI로 한다.
$('tt-side-inject').onclick = () => {
  const link = app.link;
  if (link?.status !== 'issued' || link.qrExpired()) {
    message = '딥 모드 연결 화면에서 QR이 준비된 뒤에 눌러 주세요';
    return;
  }
  app.mockPhone?.close();
  app.mockPhone = new MockPhone();
  app.mockPhone.connect(link.token);
  message = "측면 모의 입력이 연결을 요청해요. '연결 승인'을 눌러 주세요";
};

$('tt-deep').onclick = () => {
  if (!running() || app.session.mode !== 'deep' || !app.mockPhone) {
    message = '측면 모의 입력으로 딥 모드 탐지가 진행 중일 때 쓸 수 있어요';
    return;
  }
  app.session.markTest(REPLAYS.deep.name);
  app.replay = new Replay('deep', (clip) => {
    recorded.show(clip);
    app.mockPhone.lean(clip === 'turtle');
  });
};

$('tt-side-cut').onclick = () => {
  if (!app.mockPhone) {
    message = '측면 모의 입력이 연결돼 있지 않아요';
    return;
  }
  if (app.session && app.session.state !== 'ended') app.session.markTest('측면 연결 끊기');
  app.mockPhone.cutConnection();
  message = '측면 입력을 멈추고 3초 뒤 연결을 끊어요. 종료 요청에는 응답하지 않아요';
};

onRoute(place);
onLive(() => {
  if (!EVAL) return;
  $('test-tools-status').textContent = app.replay?.text ?? message;
});

export function initTools() {
  show($('eval-badge'), EVAL);
}
