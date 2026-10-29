// PC·휴대폰 연결 클라이언트를 실제 /relay 서버(shared/relay.js)에 붙여 확인한다.
import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { CONNECTION_PILOT } from '../../shared/deep-protocol.js';
import { ConnectionHub, attachRelay } from '../../shared/relay.js';
import { PcLink, PhoneLink, phoneUrl, relayUrl } from './deep-link.js';

const SIDE = { valid: true, angleDeg: 78, earVis: 0.9, shoulderVis: 0.9 };

let server;
let relay;
let url;
const links = [];

async function start(pilot = CONNECTION_PILOT) {
  server = createServer((req, res) => res.end());
  relay = attachRelay(server, { hub: new ConnectionHub({ pilot }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = (role) => `ws://127.0.0.1:${server.address().port}/relay?role=${role}`;
}

function open(Link) {
  const link = new Link({ url: url(Link === PcLink ? 'pc' : 'phone'), WebSocketImpl: WebSocket });
  link.open();
  links.push(link);
  return link;
}

async function until(check, label) {
  for (let i = 0; i < 300; i += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`${label} 상태가 되지 않았어요`);
}

/** QR 발급 → 휴대폰 요청 → PC 승인까지 */
async function linkPair() {
  const pc = open(PcLink);
  const phone = open(PhoneLink);
  await until(() => pc.status === 'ready' && phone.status === 'ready', 'ready');
  pc.issueQr();
  await until(() => pc.status === 'issued', 'issued');
  phone.requestConnect(pc.token);
  await until(() => pc.status === 'requested' && phone.status === 'pending', 'requested');
  pc.approve();
  await until(() => pc.status === 'linked' && phone.status === 'linked', 'linked');
  return { pc, phone };
}

afterEach(async () => {
  links.splice(0).forEach((link) => link.close());
  relay.close();
  await new Promise((resolve) => server.close(resolve));
});

describe('주소', () => {
  beforeEach(() => start());

  it('https 페이지는 wss로, QR은 /phone?token= 주소로 만든다', () => {
    expect(relayUrl('pc', { protocol: 'https:', host: 'a.example:5173' })).toBe('wss://a.example:5173/relay?role=pc');
    expect(relayUrl('phone', { protocol: 'http:', host: 'localhost:3000' })).toBe('ws://localhost:3000/relay?role=phone');
    expect(phoneUrl('https://a.example', 'tok_en')).toBe('https://a.example/phone?token=tok_en');
  });
});

describe('heartbeat (워커 tick)', () => {
  beforeEach(() => start());

  it('tick마다 불러도 heartbeat 주기마다 한 번만 ping을 보낸다', () => {
    const sent = [];
    class FakeSocket {
      constructor() { this.readyState = 1; }
      send(raw) { sent.push(JSON.parse(raw).type); }
      close() {}
    }
    const link = new PcLink({ url: 'ws://fake', WebSocketImpl: FakeSocket });
    link.open();
    const step = CONNECTION_PILOT.heartbeatSeconds * 1000;
    for (let t = 0; t <= step * 2; t += 400) link.heartbeat(t);
    expect(sent).toEqual(['ping', 'ping', 'ping']);
    link.close();
  });
});

describe('PcLink·PhoneLink (실제 /relay 연결)', () => {
  beforeEach(() => start());

  it('승인 뒤 측면 입력이 서버 시각으로 동기화돼 PC 판정에 쓰인다', async () => {
    const { pc, phone } = await linkPair();
    phone.sendSide(SIDE);
    await until(() => pc.side?.seq === 0, 'side');
    expect(pc.side).toMatchObject({ angleDeg: 78, valid: true });
    expect(pc.sideInput(Date.now()).quality).toBe('valid');
    // 1초보다 오래된 측면 입력은 결합하지 않는다.
    expect(pc.sideInput(Date.now() + 1500).quality).toBe('side_stale');
  });

  it('승인 전에는 측면 입력을 보내지 않고, 거절되면 휴대폰에 알린다', async () => {
    const pc = open(PcLink);
    const phone = open(PhoneLink);
    await until(() => pc.status === 'ready' && phone.status === 'ready', 'ready');
    expect(phone.sendSide(SIDE)).toBe(false);
    pc.issueQr();
    await until(() => pc.status === 'issued', 'issued');
    phone.requestConnect(pc.token);
    await until(() => pc.status === 'requested', 'requested');
    pc.reject();
    await until(() => phone.status === 'rejected', 'rejected');
    expect(phone.notice).toBe('PC에서 연결을 거절했어요.');
    expect(pc.status).toBe('ready');
  });

  it('PC 종료 요청에 휴대폰이 촬영 종료로 답하면 종료 확인으로 남는다', async () => {
    const { pc, phone } = await linkPair();
    phone.on((type, stopId) => { if (type === 'stop') phone.confirmStop(stopId); });
    pc.requestStop();
    await until(() => pc.stop?.status === 'confirmed', 'confirmed');
    await until(() => phone.status === 'stopped', 'stopped');
  });

  it('휴대폰 연결이 끊기면 PC에 유실 이벤트를 알리고 측면 입력을 무효로 본다', async () => {
    const { pc, phone } = await linkPair();
    const events = [];
    pc.on((type, detail) => events.push([type, detail]));
    phone.sendSide(SIDE);
    await until(() => pc.side, 'side');
    phone.close();
    await until(() => pc.status === 'lost', 'lost');
    expect(events).toContainEqual(['lost', 'phone_closed']);
    expect(pc.sideInput(Date.now()).quality).toBe('side_stale');
  });

  it('연결 서버에 닿지 못하면 offline으로 바꾸고 화면이 다시 그리도록 알린다', async () => {
    const phone = new PhoneLink({ url: 'ws://127.0.0.1:1/relay?role=phone', WebSocketImpl: WebSocket });
    const events = [];
    phone.on((type) => events.push(type));
    phone.open();
    links.push(phone);
    await until(() => phone.status === 'offline', 'offline');
    expect(events).toContain('change');
  });

  it('연결이 없을 때 종료를 요청하면 확인 안 됨으로 남긴다', () => {
    const pc = new PcLink({ url: url('pc'), WebSocketImpl: WebSocket });
    pc.requestStop();
    expect(pc.stop).toMatchObject({ status: 'unconfirmed', reason: 'not_linked' });
  });
});

describe('종료 무응답', () => {
  beforeEach(() => start({ ...CONNECTION_PILOT, phoneStopSeconds: 0.2 }));

  it('휴대폰이 종료 요청에 답하지 않으면 확인 안 됨으로 남긴다', async () => {
    const { pc } = await linkPair();
    pc.requestStop();
    await until(() => pc.stop?.status === 'unconfirmed', 'unconfirmed');
    expect(pc.stop.reason).toBe('timeout');
  });
});

// 실제 BroadcastChannel로 같은 브라우저의 별도 탭과 같은 메시지 전달을 검증한다.
describe('서버 없는 환경의 BroadcastChannel 폴백', () => {
  beforeEach(() => start());

  class FailedSocket {
    constructor() { queueMicrotask(() => this.onerror?.()); }
    close() {}
  }
  class HangingSocket {
    constructor() {}
    close() {}
  }
  function local(Link, WebSocketImpl = FailedSocket, extra = {}) {
    const link = new Link({ url: 'ws://no-relay/relay', WebSocketImpl,
      BroadcastChannelImpl: BroadcastChannel, connectTimeoutMs: 30, ...extra });
    links.push(link);
    link.open();
    return link;
  }
  async function pair() {
    const pc = local(PcLink);
    const phone = local(PhoneLink);
    await until(() => pc.status === 'ready' && phone.status === 'ready', '폴백 준비');
    pc.issueQr();
    await until(() => pc.token, 'QR');
    phone.requestConnect(pc.token);
    await until(() => pc.status === 'requested' && phone.status === 'pending', '승인 대기');
    pc.approve();
    await until(() => pc.linked && phone.status === 'linked', '폴백 연결');
    return { pc, phone };
  }

  it('연결 오류 뒤 자동 전환하여 승인·측면 각도·촬영 종료 확인을 전달한다', async () => {
    const { pc, phone } = await pair();
    expect(pc.transport).toBe('broadcast');
    expect(phone.transport).toBe('broadcast');
    phone.sendSide(SIDE);
    await until(() => pc.side?.angleDeg === 78, '측면 각도');
    expect(pc.sideInput(Date.now()).quality).toBe('valid');
    phone.on((type, id) => { if (type === 'stop') phone.confirmStop(id); });
    pc.requestStop();
    await until(() => pc.stop?.status === 'confirmed' && phone.status === 'stopped', '촬영 종료');
  });

  it('응답 없는 소켓도 연결 제한 시간 뒤 전환한다', async () => {
    const pc = local(PcLink, HangingSocket);
    await until(() => pc.status === 'ready', '시간 초과 폴백');
    expect(pc.transport).toBe('broadcast');
  });

  it('WebSocket 생성 예외도 폴백하고 미지원이면 offline으로 종료한다', async () => {
    class ThrowingSocket { constructor() { throw new Error('접속 실패'); } }
    const pc = local(PcLink, ThrowingSocket);
    const phone = local(PhoneLink, ThrowingSocket, { BroadcastChannelImpl: null });
    await until(() => pc.status === 'ready' && phone.status === 'offline', '생성 예외');
  });

  it('휴대폰 종료 뒤 PC는 유실 처리하고 다른 PC의 QR에는 반응하지 않는다', async () => {
    const other = local(PcLink);
    const { pc, phone } = await pair();
    expect(other.status).toBe('ready');
    expect(phone.sendSide(SIDE)).toBe(true);
    await until(() => pc.side, '측면 입력');
    phone.close();
    await until(() => pc.status === 'lost', '휴대폰 종료');
    expect(pc.sideInput(Date.now()).quality).toBe('side_stale');
  });

  it('PC가 없는 토큰 요청은 무한 대기하지 않고 거절된다', async () => {
    let now = Date.now();
    const phone = local(PhoneLink, FailedSocket, { now: () => now });
    await until(() => phone.status === 'ready', '휴대폰 준비');
    phone.requestConnect('x'.repeat(24));
    now += 7000;
    await until(() => phone.status === 'rejected', '없는 PC 요청 만료');
    expect(phone.reason).toBe('pc_offline');
  });

  it('PC 승인 전 거절 및 사용한 QR 재요청을 기존 정책대로 차단한다', async () => {
    const pc = local(PcLink);
    const phone = local(PhoneLink);
    await until(() => pc.status === 'ready' && phone.status === 'ready', '폴백 준비');
    pc.issueQr();
    await until(() => pc.token, 'QR');
    const token = pc.token;
    expect(phone.sendSide(SIDE)).toBe(false);
    phone.requestConnect(token);
    await until(() => pc.status === 'requested', '승인 요청');
    pc.reject();
    await until(() => phone.status === 'rejected', '연결 거절');
    expect(phone.reason).toBe('rejected');
    const other = local(PhoneLink);
    await until(() => other.status === 'ready', '다른 휴대폰');
    other.requestConnect(token);
    await until(() => other.status === 'rejected', '사용된 QR 거절');
    expect(other.reason).toBe('used');
  });

  it('수동 종료한 연결은 늦은 오류로 다시 열리지 않는다', async () => {
    const pc = local(PcLink, HangingSocket);
    const ws = pc.ws;
    pc.close();
    ws.onerror?.();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pc.status).toBe('idle');
    expect(pc.ws).toBeNull();
  });
});
