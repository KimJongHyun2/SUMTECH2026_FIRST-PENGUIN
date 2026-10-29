// 평가 전용 빌드의 입력·테스트 도구 (docs/prd.md 7절).
// EVAL_ENABLED=true로 빌드하고 첫 주소가 /?mode=eval일 때만 켠다. 같은 탭(context) 안에서는 이동·새로고침에도 유지하고,
// 탭을 닫으면 사라진다. 일반 빌드에서는 주소·로컬 저장만으로 켤 수 없다.
// 녹화 영상은 공통 추론·등록·판정·집계·저장 경로로 들어간다. 기준·세션·리포트를 직접 만들지 않는다.

const KEY = 'fast-turtle-eval';
const BASE = '/eval/';
// 모든 흐름이 쓰는 구간. 하나라도 사람 라벨·추론 확인이 안 됐으면 평가 입력을 쓰지 않는다.
const REQUIRED = ['good', 'turtle', 'away'];
const STEP_TIMEOUT_MS = 60_000;

export const EVAL_INPUT_ERROR = '평가 입력을 불러올 수 없어요';

export function evalActive() {
  if (!__EVAL_ENABLED__) return false;
  try {
    if (new URLSearchParams(location.search).get('mode') === 'eval') sessionStorage.setItem(KEY, '1');
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export class EvalInputError extends Error {
  constructor(detail) {
    super(`${EVAL_INPUT_ERROR} (${detail})`);
    this.name = 'EvalInputError';
  }
}

async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** e2e/fixtures/test-pose.webm을 구간 단위로 재생하는 정면 입력 */
export class RecordedInput {
  constructor() {
    this.manifest = null;
    this.url = null;
    this.video = null;
    this.segment = null;
  }

  async #load() {
    if (this.url) return;
    const res = await fetch(`${BASE}test-pose.manifest.json`, { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) throw new EvalInputError('구간 명세 없음');
    const manifest = await res.json();
    for (const label of REQUIRED) {
      const seg = manifest.segments?.find((s) => s.label === label);
      if (!seg?.verified) throw new EvalInputError(`'${label}' 구간 미검증`);
    }
    const video = await fetch(BASE + manifest.file).catch(() => null);
    if (!video?.ok) throw new EvalInputError('영상 파일 없음');
    const buffer = await video.arrayBuffer();
    // 보안 문맥이 아니면(https·localhost 외) 해시를 계산할 수 없어 크기로 확인한다.
    const same = crypto.subtle ? (await sha256(buffer)) === manifest.sha256 : buffer.byteLength === manifest.bytes;
    if (!same) throw new EvalInputError('영상이 구간 명세와 다름');
    this.manifest = manifest;
    this.url = URL.createObjectURL(new Blob([buffer], { type: 'video/webm' }));
  }

  get label() {
    return `${this.manifest?.file ?? 'test-pose.webm'} (평가 녹화 입력)`;
  }

  async start(video) {
    await this.#load();
    this.video = video;
    video.srcObject = null;
    video.muted = true;
    video.src = this.url;
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = () => reject(new EvalInputError('영상 디코딩 실패'));
    });
    this.show('good');
    await video.play();
    // 구간 끝에 닿으면 같은 구간 처음으로 돌아간다. 이동 시간은 유효 시간에 더하지 않는다(엔진은 실제 시각으로 센다).
    const loop = (now, meta) => {
      if (this.video !== video) return;
      const seg = this.segment;
      if (meta.mediaTime >= seg.end - 0.05 || meta.mediaTime < seg.start - 0.5) video.currentTime = seg.start;
      video.requestVideoFrameCallback(loop);
    };
    video.requestVideoFrameCallback(loop);
  }

  /** 카메라 앞의 자세를 바꾼다: 'good' | 'turtle' | 'away' */
  show(label) {
    this.segment = this.manifest.segments.find((s) => s.label === label);
    if (this.video) this.video.currentTime = this.segment.start;
  }

  stop() {
    const video = this.video;
    if (!video) return;
    this.video = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}

/**
 * 녹화 입력 연속 재생. 각 단계는 앱이 실제로 센 유효 시간으로 끝난다
 * (예: '이탈 10초'는 최초 경고가 날 때까지, '복귀 3초'는 경고가 풀릴 때까지 같은 자세를 유지).
 */
export const REPLAYS = {
  front: {
    name: '정면 이탈·복귀 재생',
    steps: [
      { clip: 'turtle', label: '이탈 10초', done: (s) => s.warningActive },
      { clip: 'good', label: '복귀 3초', done: (s) => !s.warningActive },
    ],
  },
  // 딥 모드: 정면 녹화 구간을 바꾸면 테스트 휴대폰(SimPhone)의 측면 입력도 같은 자세로 바뀐다.
  both: {
    name: '양쪽 이탈·복귀 재생',
    steps: [
      { clip: 'turtle', label: '이탈 10초', done: (s) => s.warningActive },
      { clip: 'good', label: '복귀 3초', done: (s) => !s.warningActive },
    ],
  },
  away: {
    name: '자리 비움·재이탈 재생',
    steps: [
      { clip: 'turtle', label: '이탈 6초', done: (s) => s.candidateMs >= 6000 },
      { clip: 'away', label: '자리 비움 5초', awayMs: 5000 },
      { clip: 'turtle', label: '새 이탈 10초', done: (s) => s.warningActive },
      { clip: 'good', label: '복귀 3초', done: (s) => !s.warningActive },
    ],
  },
};

// 정면 녹화 구간별 측면 입력. 측면 영상이 없어 같은 자세의 측면 특징값을 정해 둔 것이다(실측 아님).
const SIDE_BY_CLIP = {
  good: { valid: true, angleDeg: 75 },
  brief_touch: { valid: true, angleDeg: 75 },
  turtle: { valid: true, angleDeg: 63 },
  away: { valid: false, angleDeg: null },
};
const SIDE_EVERY_MS = 400;

/**
 * '[테스트용] 측면 데이터 주입'의 테스트 휴대폰 1대. 실제 휴대폰과 같은 연결 서버(/relay?role=phone)에
 * 같은 메시지로 연결 요청·측면 입력·종료 응답을 보낸다. PC 승인·판정·집계는 공통 경로가 한다.
 * silence()는 '[테스트용] 측면 연결 끊기': 입력·응답을 모두 멈춰 서버가 입력 중단·연결 유실을 판정하게 한다.
 */
export class SimPhone {
  constructor(clipLabel, relayUrl) {
    this.clipLabel = clipLabel;
    this.relayUrl = relayUrl;
    this.status = 'idle'; // idle | requested | linked | stopped | silent | rejected
    this.seq = 0;
  }

  start(token) {
    const ws = new WebSocket(this.relayUrl);
    this.ws = ws;
    ws.onmessage = (event) => this.#receive(JSON.parse(event.data), token);
  }

  #send(message) {
    if (this.status !== 'silent' && this.ws?.readyState === 1) this.ws.send(JSON.stringify(message));
  }

  #receive(m, token) {
    if (this.status === 'silent') return;
    if (m.type === 'hello') {
      this.offset = m.serverTime - Date.now();
      this.#send({ type: 'connect.request', token });
      this.status = 'requested';
    } else if (m.type === 'connect.rejected') {
      this.status = 'rejected';
    } else if (m.type === 'link.approved') {
      this.status = 'linked';
      this.timer = setInterval(() => this.#sendSide(), SIDE_EVERY_MS);
    } else if (m.type === 'stop.request') {
      // 모의 종료 응답: 테스트 휴대폰은 촬영 장치가 없으므로 입력 전송을 멈춘 뒤 확인을 보낸다.
      clearInterval(this.timer);
      this.#send({ type: 'stop.done', stopId: m.stopId });
      this.status = 'stopped';
    } else if (m.type === 'link.revoked' || m.type === 'link.closed') {
      clearInterval(this.timer);
    }
  }

  #sendSide() {
    const side = SIDE_BY_CLIP[this.clipLabel()] ?? SIDE_BY_CLIP.good;
    this.seq += 1;
    this.#send({
      type: 'side',
      seq: this.seq,
      t: Date.now() + this.offset,
      valid: side.valid,
      angleDeg: side.angleDeg,
      earVis: side.valid ? 0.9 : 0.1,
      shoulderVis: side.valid ? 0.9 : 0.1,
    });
  }

  silence() {
    clearInterval(this.timer);
    this.status = 'silent';
  }

  close() {
    clearInterval(this.timer);
    this.ws?.close();
  }
}

export class Replay {
  constructor(kind, show) {
    this.plan = REPLAYS[kind];
    this.show = show;
    this.index = -1;
    this.status = 'running';
  }

  get text() {
    if (this.status === 'done') return `${this.plan.name} 완료`;
    if (this.status === 'failed') return `${this.plan.name} 실패: ${this.reason}`;
    return `${this.plan.name} 중: ${this.plan.steps[this.index]?.label ?? ''}`;
  }

  #next(now) {
    this.index += 1;
    const step = this.plan.steps[this.index];
    if (!step) {
      this.status = 'done';
      return;
    }
    this.stepSince = now;
    this.awaySince = null;
    this.show(step.clip);
  }

  /** 측정 주기마다 부른다. 세션이 진행 중이 아니면 멈춘다. */
  tick(now, session) {
    if (this.status !== 'running') return;
    if (session?.state !== 'running') {
      this.status = 'failed';
      this.reason = '탐지가 진행 중이 아니에요';
      return;
    }
    if (this.index < 0) {
      this.#next(now);
      return;
    }
    const step = this.plan.steps[this.index];
    let done;
    if (step.awayMs) {
      if (session.recognition === 'away') this.awaySince ??= now;
      done = this.awaySince !== null && now - this.awaySince >= step.awayMs;
    } else {
      done = step.done(session);
    }
    if (done) this.#next(now);
    else if (now - this.stepSince > STEP_TIMEOUT_MS) {
      this.status = 'failed';
      this.reason = `${step.label} 입력이 판정되지 않았어요`;
    }
  }
}
