import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { ConnectionHub, attachRelay } from './relay.js';

let t;
let hub;
let tokens;

function fakeSocket() {
  return {
    sent: [],
    closed: null,
    send(message) { this.sent.push(message); },
    close(code, reason) { this.closed = { code, reason }; },
  };
}

/** 마지막으로 받은 type 메시지 */
const last = (client, type) => client.socket.sent.filter((m) => m.type === type).at(-1);
const all = (client, type) => client.socket.sent.filter((m) => m.type === type);
const send = (client, message) => hub.receive(client, JSON.stringify(message));
const join = (role) => hub.connect(fakeSocket(), role);

function issue(pc) {
  send(pc, { type: 'qr.issue' });
  return last(pc, 'qr.issued').token;
}

function request(phone, token) {
  send(phone, { type: 'connect.request', token });
  return last(phone, 'connect.pending')?.requestId;
}

function linkPair() {
  const pc = join('pc');
  const phone = join('phone');
  const requestId = request(phone, issue(pc));
  send(pc, { type: 'connect.approve', requestId });
  return { pc, phone };
}

const side = (seq, extra = {}) => ({
  type: 'side', seq, t, valid: true, angleDeg: 72.5, earVis: 0.9, shoulderVis: 0.8, ...extra,
});

/** ms만큼 시간을 보내며 sweep한다. alive에 넣은 쪽은 그 사이 ping으로 살아 있다고 알린다. */
function advance(ms, alive = []) {
  const end = t + ms;
  while (t < end) {
    t = Math.min(t + 500, end);
    alive.forEach((client) => send(client, { type: 'ping' }));
    hub.sweep();
  }
}

beforeEach(() => {
  t = 1_000_000;
  tokens = 0;
  hub = new ConnectionHub({
    now: () => t,
    token: () => `tok-${String((tokens += 1)).padStart(20, '0')}`,
  });
});

describe('QR 발급·만료 (F8, QR 120초)', () => {
  it('발급 후 120초 미만 요청은 받고, 120초가 되면 만료로 거부한다', () => {
    const pc = join('pc');
    const token = issue(pc);
    expect(last(pc, 'qr.issued')).toMatchObject({ issuedAt: t, expiresAt: t + 120_000 });

    t += 119_999;
    const early = join('phone');
    expect(request(early, token)).toBeTruthy();
    expect(last(pc, 'connect.requested')).toBeTruthy();

    const pc2 = join('pc');
    const token2 = issue(pc2);
    t += 120_000;
    const late = join('phone');
    request(late, token2);
    expect(last(late, 'connect.rejected').code).toBe('expired');
    expect(all(pc2, 'connect.requested')).toHaveLength(0);
  });

  it('승인 시점에도 만료를 다시 확인한다: 요청은 만료 전이어도 120초가 지난 승인은 거부', () => {
    const pc = join('pc');
    const phone = join('phone');
    const token = issue(pc);
    t += 100_000;
    const requestId = request(phone, token);
    t += 20_000; // 발급 후 120초
    send(pc, { type: 'connect.approve', requestId });
    expect(last(pc, 'error').code).toBe('expired');
    expect(last(phone, 'connect.rejected').code).toBe('expired');
    expect(all(phone, 'link.approved')).toHaveLength(0);
    expect(hub.stats().links).toBe(0);
  });

  it('승인 전 대기 중 만료되면 sweep이 요청을 거부하고 PC에 취소를 알린다', () => {
    const pc = join('pc');
    const phone = join('phone');
    const token = issue(pc);
    request(phone, token);
    advance(120_000, [pc, phone]);
    expect(last(phone, 'connect.rejected').code).toBe('expired');
    expect(last(pc, 'connect.canceled').reason).toBe('expired');
  });

  it('재발급하면 이전 QR은 거부하고, 대기 중이던 요청도 거부한다', () => {
    const pc = join('pc');
    const first = issue(pc);
    const waiting = join('phone');
    request(waiting, first);
    const second = issue(pc);
    expect(second).not.toBe(first);
    expect(last(waiting, 'connect.rejected').code).toBe('reissued');
    const phone = join('phone');
    request(phone, first);
    expect(last(phone, 'connect.rejected').code).toBe('reissued');
    expect(request(join('phone'), second)).toBeTruthy();
  });

  it('형식이 다르거나 모르는 토큰은 거부한다', () => {
    const phone = join('phone');
    request(phone, 'short');
    expect(last(phone, 'connect.rejected').code).toBe('invalid_token');
    request(phone, 'x'.repeat(24));
    expect(all(phone, 'connect.rejected').at(-1).code).toBe('invalid_token');
  });
});

describe('PC 승인·재사용·중복 휴대폰', () => {
  it('PC 승인 전에는 연결로 처리하지 않고 측면 입력도 전달하지 않는다', () => {
    const pc = join('pc');
    const phone = join('phone');
    request(phone, issue(pc));
    send(phone, side(0));
    expect(last(phone, 'error').code).toBe('not_approved');
    expect(all(pc, 'side')).toHaveLength(0);
    expect(hub.stats().links).toBe(0);
  });

  it('승인되면 양쪽에 같은 연결 ID를 알리고, 사용한 QR은 다시 쓸 수 없다', () => {
    const pc = join('pc');
    const phone = join('phone');
    const token = issue(pc);
    send(pc, { type: 'connect.approve', requestId: request(phone, token) });
    expect(last(pc, 'link.approved').linkId).toBe(last(phone, 'link.approved').linkId);
    const other = join('phone');
    request(other, token);
    expect(last(other, 'connect.rejected').code).toBe('used');
  });

  it('대기 중인 QR을 다른 휴대폰이 요청해도 자동으로 바꾸지 않는다', () => {
    const pc = join('pc');
    const token = issue(pc);
    const first = join('phone');
    const requestId = request(first, token);
    const second = join('phone');
    request(second, token);
    expect(last(second, 'connect.rejected').code).toBe('used');
    send(pc, { type: 'connect.approve', requestId });
    expect(last(first, 'link.approved')).toBeTruthy();
    expect(all(second, 'link.approved')).toHaveLength(0);
  });

  it('연결된 PC는 새 QR을 만들 수 없고, 같은 휴대폰의 중복 요청은 거부한다', () => {
    const { pc, phone } = linkPair();
    send(pc, { type: 'qr.issue' });
    expect(last(pc, 'error').code).toBe('already_linked');
    const pc2 = join('pc');
    request(phone, issue(pc2));
    expect(last(phone, 'connect.rejected').code).toBe('duplicate');
  });

  it('거절한 요청의 QR은 다시 쓸 수 없다', () => {
    const pc = join('pc');
    const phone = join('phone');
    const token = issue(pc);
    send(pc, { type: 'connect.reject', requestId: request(phone, token) });
    expect(last(phone, 'connect.rejected').code).toBe('rejected');
    request(phone, token);
    expect(all(phone, 'connect.rejected').at(-1).code).toBe('used');
  });

  it('없는 요청 ID 승인은 거부한다', () => {
    const pc = join('pc');
    send(pc, { type: 'connect.approve', requestId: 'req-x' });
    expect(last(pc, 'error').code).toBe('no_request');
  });

  it('요청 뒤 휴대폰이 새로고침(재접속)하면 그 요청과 QR을 무효로 하고 PC에 알린다', () => {
    const pc = join('pc');
    const phone = join('phone');
    const token = issue(pc);
    request(phone, token);
    hub.disconnect(phone, 'closed');
    expect(last(pc, 'connect.canceled').reason).toBe('phone_closed');
    const again = join('phone');
    request(again, token);
    expect(last(again, 'connect.rejected').code).toBe('used');
  });

  it('PC가 새로고침하면 QR·대기 요청·연결이 모두 무효가 된다', () => {
    const pc = join('pc');
    const token = issue(pc);
    const phone = join('phone');
    request(phone, token);
    hub.disconnect(pc, 'closed');
    expect(last(phone, 'connect.rejected').code).toBe('pc_offline');
    const late = join('phone');
    request(late, token);
    expect(last(late, 'connect.rejected').code).toBe('pc_offline');

    const pair = linkPair();
    hub.disconnect(pair.pc, 'closed');
    expect(last(pair.phone, 'link.revoked').reason).toBe('pc_closed');
    send(pair.phone, side(0));
    expect(last(pair.phone, 'error').code).toBe('not_approved');
  });
});

describe('측면 입력 전달·검증', () => {
  it('승인된 휴대폰의 입력만 그 PC로 전달하고 다른 연결과 섞지 않는다', () => {
    const a = linkPair();
    const b = linkPair();
    send(a.phone, side(0, { angleDeg: 70 }));
    send(b.phone, side(0, { angleDeg: 55 }));
    expect(all(a.pc, 'side').map((m) => m.angleDeg)).toEqual([70]);
    expect(all(b.pc, 'side').map((m) => m.angleDeg)).toEqual([55]);
    expect(last(a.pc, 'side')).toMatchObject({ seq: 0, t, valid: true, earVis: 0.9, shoulderVis: 0.8, receivedAt: t });
  });

  it.each([
    ['각도 범위 밖', { angleDeg: 190 }],
    ['품질 범위 밖', { earVis: 1.5 }],
    ['valid 누락', { valid: undefined }],
    ['무효 입력인데 각도 있음', { valid: false }],
    ['미래 시각', { t: 1_000_000 + 5_000 }],
    ['숫자가 아닌 시각', { t: 'now' }],
  ])('잘못된 측면 입력은 전달하지 않는다: %s', (_, extra) => {
    const { pc, phone } = linkPair();
    send(phone, side(0, extra));
    expect(last(phone, 'error').code).toBe('bad_side');
    expect(all(pc, 'side')).toHaveLength(0);
  });

  it('무효 입력은 각도 없이 품질만 전달한다', () => {
    const { pc, phone } = linkPair();
    send(phone, side(0, { valid: false, angleDeg: null, earVis: 0.1 }));
    expect(last(pc, 'side')).toMatchObject({ valid: false, angleDeg: null, earVis: 0.1 });
  });

  it('순서가 거꾸로이거나 같은 번호는 버린다', () => {
    const { pc, phone } = linkPair();
    send(phone, side(5));
    send(phone, side(5));
    send(phone, side(3));
    expect(all(pc, 'side').map((m) => m.seq)).toEqual([5]);
  });

  it('2초보다 오래된 입력은 전달하지 않고 PC에 오래된 입력으로 알린다', () => {
    const { pc, phone } = linkPair();
    send(phone, side(0, { t: t - 2_500 }));
    expect(last(phone, 'error').code).toBe('stale_input');
    expect(last(pc, 'side.stale')).toEqual({ type: 'side.stale', seq: 0, ageMs: 2_500 });
    expect(all(pc, 'side')).toHaveLength(0);
  });

  it('형식이 잘못된 메시지·큰 메시지·모르는 종류는 거부한다', () => {
    const pc = join('pc');
    hub.receive(pc, '{not json');
    hub.receive(pc, JSON.stringify({ type: 'qr.issue', pad: 'x'.repeat(3000) }));
    hub.receive(pc, JSON.stringify({ type: 'side' })); // PC는 측면 입력을 보낼 수 없다
    hub.receive(pc, JSON.stringify({ nope: 1 }));
    expect(all(pc, 'error').map((m) => m.code)).toEqual(['bad_message', 'bad_message', 'bad_message', 'bad_message']);
    expect(all(pc, 'qr.issued')).toHaveLength(0);
  });

  it.each(['__defineGetter__', '__lookupGetter__', 'constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf'])(
    '상속 속성 이름(%s)은 처리기로 쓰지 않고 형식 오류로 거부한다',
    (type) => {
      for (const role of ['pc', 'phone']) {
        const client = join(role);
        expect(() => send(client, { type })).not.toThrow();
        expect(last(client, 'error').code).toBe('bad_message');
      }
    },
  );

  it('초당 20개를 넘게 보내면 끊는다', () => {
    const pc = join('pc');
    for (let i = 0; i < 21; i += 1) send(pc, { type: 'ping' });
    expect(last(pc, 'error').code).toBe('rate_limited');
    expect(pc.socket.closed.code).toBe(1008);
    expect(hub.stats().pcs).toBe(0);
  });
});

describe('측면 영상 연결 신호 전달', () => {
  const sdp = `v=0\r\n${'a=candidate:x\r\n'.repeat(300)}`; // 2KB보다 큰 실제 크기의 SDP

  it('휴대폰 offer는 연결된 PC로, PC answer는 그 휴대폰으로만 전달한다', () => {
    const { pc, phone } = linkPair();
    const other = linkPair();
    send(phone, { type: 'rtc', kind: 'offer', sdp });
    expect(last(pc, 'rtc')).toEqual({ type: 'rtc', kind: 'offer', sdp });
    send(pc, { type: 'rtc', kind: 'answer', sdp: 'v=0\r\n' });
    expect(last(phone, 'rtc')).toEqual({ type: 'rtc', kind: 'answer', sdp: 'v=0\r\n' });
    expect(all(other.pc, 'rtc')).toHaveLength(0);
    expect(all(other.phone, 'rtc')).toHaveLength(0);
  });

  it('승인 전 신호와 역할에 맞지 않는 신호·형식이 잘못된 신호는 거부한다', () => {
    const pc = join('pc');
    const phone = join('phone');
    request(phone, issue(pc));
    send(phone, { type: 'rtc', kind: 'offer', sdp });
    expect(last(phone, 'error').code).toBe('not_approved');
    expect(all(pc, 'rtc')).toHaveLength(0);

    const linked = linkPair();
    send(linked.pc, { type: 'rtc', kind: 'offer', sdp });
    send(linked.phone, { type: 'rtc', kind: 'answer', sdp });
    send(linked.phone, { type: 'rtc', kind: 'offer', sdp: 'nope' });
    expect(last(linked.pc, 'error').code).toBe('bad_rtc');
    expect(all(linked.phone, 'error').map((m) => m.code)).toEqual(['bad_rtc', 'bad_rtc']);
    expect(all(linked.pc, 'rtc')).toHaveLength(0);
    expect(all(linked.phone, 'rtc')).toHaveLength(0);
  });

  it('신호도 16KB를 넘으면 거부하고, 다른 메시지는 계속 2KB로 제한한다', () => {
    const { pc, phone } = linkPair();
    send(phone, { type: 'rtc', kind: 'offer', sdp: `v=0\r\n${'x'.repeat(17_000)}` });
    expect(last(phone, 'error').code).toBe('bad_message');
    send(phone, side(0, { pad: 'x'.repeat(3000) }));
    expect(last(phone, 'error').code).toBe('bad_message');
    expect(all(pc, 'rtc')).toHaveLength(0);
    expect(all(pc, 'side')).toHaveLength(0);
  });
});

describe('입력 중단·연결 유실 (F10)', () => {
  it('측면 입력이 2초 넘게 없으면 입력 중단, 다시 오면 재개를 알린다', () => {
    const { pc, phone } = linkPair();
    send(phone, side(0));
    advance(2_000, [pc, phone]);
    expect(all(pc, 'link.input-idle')).toHaveLength(0);
    advance(500, [pc, phone]);
    expect(all(pc, 'link.input-idle')).toHaveLength(1);
    advance(1_000, [pc, phone]);
    expect(all(pc, 'link.input-idle')).toHaveLength(1); // 한 번만 알린다
    send(phone, side(1));
    expect(last(pc, 'link.input-resumed')).toBeTruthy();
    expect(hub.stats().links).toBe(1); // 입력 중단은 연결 유실이 아니다
  });

  it('휴대폰이 6초 넘게 아무 응답이 없으면 연결 유실로 보고 승인을 무효화한다', () => {
    const { pc, phone } = linkPair();
    advance(6_000, [pc]);
    expect(all(pc, 'link.lost')).toHaveLength(0);
    advance(500, [pc]);
    expect(last(pc, 'link.lost').reason).toBe('phone_timeout');
    expect(phone.socket.closed.code).toBe(4000);
    expect(hub.stats()).toMatchObject({ links: 0, phones: 0 });
  });

  it('휴대폰 연결이 닫히면 바로 연결 유실을 알린다', () => {
    const { pc, phone } = linkPair();
    hub.disconnect(phone, 'closed');
    expect(last(pc, 'link.lost').reason).toBe('phone_closed');
  });

  it('QR 만료만으로 승인된 연결을 끊지 않는다', () => {
    const { pc, phone } = linkPair();
    for (let i = 0; i < 300; i += 1) {
      advance(1_000, [pc]);
      send(phone, side(i));
    }
    expect(hub.stats().links).toBe(1);
    expect(all(pc, 'side')).toHaveLength(300);
  });
});

describe('촬영 종료 요청·확인', () => {
  it('휴대폰이 종료를 확인하면 PC에 확인을 알리고 연결을 닫는다', () => {
    const { pc, phone } = linkPair();
    send(pc, { type: 'stop.request' });
    const { stopId } = last(phone, 'stop.request');
    expect(last(pc, 'stop.requested')).toMatchObject({ stopId, deadline: t + 10_000 });
    send(phone, { type: 'stop.done', stopId });
    expect(last(pc, 'stop.confirmed').stopId).toBe(stopId);
    expect(last(phone, 'link.closed').reason).toBe('stopped');
    expect(hub.stats().links).toBe(0);
  });

  it('10초 안에 확인이 없으면 완료로 처리하지 않고 확인 안 됨을 알린다', () => {
    const { pc, phone } = linkPair();
    send(pc, { type: 'stop.request' });
    advance(9_500, [pc, phone]);
    expect(all(pc, 'stop.unconfirmed')).toHaveLength(0);
    advance(500, [pc, phone]);
    expect(all(pc, 'stop.confirmed')).toHaveLength(0);
    expect(last(pc, 'stop.unconfirmed')).toBeTruthy();
    expect(last(phone, 'link.revoked').reason).toBe('stop_timeout');
    send(phone, { type: 'stop.done', stopId: last(phone, 'stop.request').stopId });
    expect(all(pc, 'stop.confirmed')).toHaveLength(0);
  });

  it('종료 확인 전에 휴대폰 연결이 끊기면 확인 안 됨으로 알린다 (끊김은 카메라 종료가 아니다)', () => {
    const { pc, phone } = linkPair();
    send(pc, { type: 'stop.request' });
    const { stopId } = last(phone, 'stop.request');
    hub.disconnect(phone, 'closed');
    expect(last(pc, 'stop.unconfirmed')).toEqual({ type: 'stop.unconfirmed', stopId, reason: 'phone_closed' });
    expect(all(pc, 'stop.confirmed')).toHaveLength(0);
    expect(last(pc, 'link.lost').reason).toBe('phone_closed');
  });

  it('PC가 연결을 무효화해도 휴대폰에는 종료 요청이 아니라 무효화로만 알린다', () => {
    const { pc, phone } = linkPair();
    hub.disconnect(pc, 'closed');
    expect(last(phone, 'link.revoked').reason).toBe('pc_closed');
    expect(all(phone, 'stop.request')).toHaveLength(0);
  });

  it('틀린 종료 ID는 확인으로 보지 않는다', () => {
    const { pc, phone } = linkPair();
    send(pc, { type: 'stop.request' });
    send(phone, { type: 'stop.done', stopId: 'stop-x' });
    expect(all(pc, 'stop.confirmed')).toHaveLength(0);
    expect(hub.stats().links).toBe(1);
  });
});

describe('자원 정리', () => {
  it('끝난 연결·토큰을 메모리에서 지운다', () => {
    const pc = join('pc');
    issue(pc);
    const pair = linkPair();
    hub.disconnect(pc, 'closed');
    hub.disconnect(pair.phone, 'closed');
    hub.disconnect(pair.pc, 'closed');
    expect(hub.stats()).toMatchObject({ pcs: 0, phones: 0, links: 0, liveTokens: 0 });
    advance(10 * 60 * 1000 + 1_000);
    expect(hub.stats().tokens).toBe(0);
  });
});

describe('WebSocket /relay (실제 연결)', () => {
  let server;
  let relay;
  let base;

  beforeEach(async () => {
    server = createServer((req, res) => res.end());
    relay = attachRelay(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `ws://127.0.0.1:${server.address().port}/relay`;
  });

  afterEach(async () => {
    relay.close();
    await new Promise((resolve) => server.close(resolve));
  });

  function open(role, headers = {}) {
    const ws = new WebSocket(`${base}?role=${role}`, { headers });
    ws.inbox = [];
    ws.on('message', (data) => ws.inbox.push(JSON.parse(data.toString())));
    return new Promise((resolve, reject) => {
      ws.on('open', () => resolve(ws));
      ws.on('unexpected-response', (req, res) => reject(new Error(String(res.statusCode))));
      ws.on('error', reject);
    });
  }

  async function next(ws, type) {
    for (let i = 0; i < 100; i += 1) {
      const found = ws.inbox.find((m) => m.type === type);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`${type}을 받지 못했어요`);
  }

  it('QR 발급 → 요청 → 승인 → 측면 입력 → 종료 확인이 실제 연결로 이어진다', async () => {
    const pc = await open('pc');
    const phone = await open('phone');
    const { serverTime } = await next(phone, 'hello');
    pc.send(JSON.stringify({ type: 'qr.issue' }));
    const { token } = await next(pc, 'qr.issued');
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    phone.send(JSON.stringify({ type: 'connect.request', token }));
    const { requestId } = await next(pc, 'connect.requested');
    pc.send(JSON.stringify({ type: 'connect.approve', requestId }));
    await next(phone, 'link.approved');
    phone.send(JSON.stringify({ type: 'side', seq: 0, t: serverTime, valid: true, angleDeg: 70, earVis: 0.9, shoulderVis: 0.9 }));
    expect(await next(pc, 'side')).toMatchObject({ seq: 0, angleDeg: 70 });
    pc.send(JSON.stringify({ type: 'stop.request' }));
    const { stopId } = await next(phone, 'stop.request');
    phone.send(JSON.stringify({ type: 'stop.done', stopId }));
    expect((await next(pc, 'stop.confirmed')).stopId).toBe(stopId);
    pc.close();
    phone.close();
  });

  it('다른 사이트에서 연 페이지와 잘못된 역할은 연결하지 않는다', async () => {
    await expect(open('pc', { Origin: 'https://evil.example' })).rejects.toThrow('403');
    await expect(open('admin')).rejects.toThrow('403');
  });

  it("Origin: null·잘못된 Origin은 403으로 거부하고 서버는 계속 동작한다", async () => {
    await expect(open('pc', { Origin: 'null' })).rejects.toThrow('403');
    await expect(open('pc', { Origin: 'not a url' })).rejects.toThrow('403');
    const pc = await open('pc');
    pc.send(JSON.stringify({ type: 'qr.issue' }));
    expect((await next(pc, 'qr.issued')).token).toBeTruthy();
    pc.close();
  });

  it('__defineGetter__ 메시지는 오류로 답하고 같은 연결을 계속 쓸 수 있다', async () => {
    const pc = await open('pc');
    pc.send(JSON.stringify({ type: '__defineGetter__' }));
    expect((await next(pc, 'error')).code).toBe('bad_message');
    pc.send(JSON.stringify({ type: 'ping' }));
    expect(await next(pc, 'pong')).toBeTruthy();
    pc.close();
  });

  it('처리 중 예상하지 못한 예외는 그 연결만 닫고 서버는 다른 연결을 계속 받는다', async () => {
    relay.close();
    await new Promise((resolve) => server.close(resolve));
    server = createServer((req, res) => res.end());
    const broken = new ConnectionHub();
    broken.receive = () => { throw new Error('boom'); };
    const logged = [];
    relay = attachRelay(server, { hub: broken, log: (...args) => logged.push(args.join(' ')) });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `ws://127.0.0.1:${server.address().port}/relay`;

    const victim = await open('pc');
    const closed = new Promise((resolve) => victim.on('close', (code) => resolve(code)));
    victim.send(JSON.stringify({ type: 'ping' }));
    expect(await closed).toBe(1011);
    expect(logged).toEqual(['relay 메시지 처리 실패 boom']);
    const other = await open('pc');
    expect(await next(other, 'hello')).toBeTruthy();
    other.close();
  });

  it('휴대폰 소켓이 끊기면 PC에 연결 유실을 알리고 자원을 정리한다', async () => {
    const pc = await open('pc');
    const phone = await open('phone');
    pc.send(JSON.stringify({ type: 'qr.issue' }));
    const { token } = await next(pc, 'qr.issued');
    phone.send(JSON.stringify({ type: 'connect.request', token }));
    const { requestId } = await next(pc, 'connect.requested');
    pc.send(JSON.stringify({ type: 'connect.approve', requestId }));
    await next(phone, 'link.approved');
    phone.close();
    expect((await next(pc, 'link.lost')).reason).toBe('phone_closed');
    expect(relay.hub.stats()).toMatchObject({ phones: 0, links: 0 });
    pc.close();
  });
});
