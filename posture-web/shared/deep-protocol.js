// 딥 모드 PC–휴대폰 연결 프로토콜 (docs/prd.md 6절). 서버(shared/relay.js)와 브라우저가 같은 값·형식을 쓴다.
// 서버는 연결 요청·승인·전달·유실·종료 확인만 다룬다. 자세 판정·세션·기록은 PC 브라우저가 한다.

// QR 120초는 확정값이다. 나머지는 실기기 확인 전 파일럿 값이며 확정 정책·보장 성능이 아니다.
export const CONNECTION_PILOT = Object.freeze({
  qrExpirySeconds: 120,
  heartbeatSeconds: 2,   // 양쪽 ping 주기. 측면 입력이 이 시간 넘게 없으면 '입력 갱신 중단'
  disconnectSeconds: 6,  // 이 시간 넘게 아무 메시지가 없으면 연결 유실로 보고 승인을 무효화
  phoneStopSeconds: 10,  // 촬영 종료 요청 뒤 이 시간 안에 확인이 없으면 '종료 요청·확인 안 됨'
  sideMaxAgeSeconds: 1,  // PC가 정면 입력과 결합할 수 있는 측면 입력의 최대 나이(동기화 허용 오차)
});

export const MAX_MESSAGE_BYTES = 2048;
// 측면 영상 연결 정보(SDP)는 2KB를 넘으므로 'rtc' 메시지에만 더 큰 한도를 둔다.
export const MAX_RTC_MESSAGE_BYTES = 16384;
export const MAX_MESSAGES_PER_SECOND = 20;
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24}$/;

/** 오류 코드와 사용자 안내 문구. 브라우저는 code로 분기하고 message를 그대로 보여 줄 수 있다. */
export const ERRORS = Object.freeze({
  bad_message: '형식이 맞지 않는 메시지예요.',
  rate_limited: '메시지를 너무 자주 보냈어요.',
  invalid_token: '연결 QR이 올바르지 않아요. PC에서 새 QR을 확인해 주세요.',
  expired: '연결 QR이 만료됐어요. PC에서 새 QR을 확인해 주세요.',
  used: '이미 사용된 연결 QR이에요. PC에서 새 QR을 확인해 주세요.',
  reissued: 'PC에서 QR을 새로 만들어 이전 QR은 쓸 수 없어요.',
  pc_offline: 'PC 화면이 연결돼 있지 않아요.',
  already_linked: '이 PC에는 이미 연결된 휴대폰이 있어요.',
  duplicate: '이미 연결을 요청했거나 연결된 상태예요.',
  rejected: 'PC에서 연결을 거절했어요.',
  no_request: '승인할 연결 요청이 없어요.',
  not_approved: 'PC 승인 전에는 측면 입력을 보낼 수 없어요.',
  not_linked: '연결된 휴대폰이 없어요.',
  stale_input: '측면 입력이 너무 오래돼 전달하지 않았어요.',
  bad_side: '측면 입력 값이 올바르지 않아요.',
  bad_rtc: '측면 영상 연결 정보가 올바르지 않아요.',
});

const isFiniteIn = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

/**
 * 휴대폰의 측면 입력: { type:'side', seq, t, valid, angleDeg, earVis, shoulderVis }
 * - t: 측정 시각(서버 시각 기준 ms). 휴대폰은 hello·pong의 serverTime으로 자기 시계와의 차이를 보정한다.
 * - valid=false이면 각도 없이(null) 품질만 보낸다. 원본 영상·좌표는 보내지 않는다.
 * @returns 정규화한 입력 또는 null
 */
export function parseSide(msg) {
  if (!Number.isInteger(msg.seq) || msg.seq < 0) return null;
  if (!isFiniteIn(msg.t, 0, Number.MAX_SAFE_INTEGER) || typeof msg.valid !== 'boolean') return null;
  if (!isFiniteIn(msg.earVis, 0, 1) || !isFiniteIn(msg.shoulderVis, 0, 1)) return null;
  if (msg.valid ? !isFiniteIn(msg.angleDeg, 0, 180) : msg.angleDeg !== null) return null;
  return {
    seq: msg.seq, t: msg.t, valid: msg.valid, angleDeg: msg.angleDeg, earVis: msg.earVis, shoulderVis: msg.shoulderVis,
  };
}

/**
 * 측면 영상 연결 신호: { type:'rtc', kind:'offer'|'answer', sdp }
 * 휴대폰이 offer, PC가 answer를 보낸다. 서버는 연결된 상대에게 전달만 하며 영상은 서버를 거치지 않는다.
 * @returns 정규화한 신호 또는 null
 */
export function parseRtc(msg, kind) {
  if (msg.kind !== kind || typeof msg.sdp !== 'string' || !msg.sdp.startsWith('v=0')) return null;
  return { kind, sdp: msg.sdp };
}
