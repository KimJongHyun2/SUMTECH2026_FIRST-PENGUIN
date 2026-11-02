import { afterEach, expect, test, vi } from "vitest";
import { PairingService, type RelayMessage } from "../../src/features/connection/PairingService";

class PendingSocket {
  static OPEN = 1;
  static instances: PendingSocket[] = [];
  readyState = 0;
  onopen?: () => void;
  onerror?: () => void;
  onclose?: () => void;
  onmessage?: (event: { data: string }) => void;
  sent: RelayMessage[] = [];
  constructor() { PendingSocket.instances.push(this); }
  send(raw: string) { this.sent.push(JSON.parse(raw)); }
  close() { this.readyState = 3; }
  receive(message: RelayMessage) { this.onmessage?.({ data: JSON.stringify(message) }); }
}
class FailedSocket extends PendingSocket {
  constructor() { super(); queueMicrotask(() => this.onerror?.()); }
}
class ThrowingSocket extends PendingSocket {
  constructor() { super(); throw new Error("연결 생성 실패"); }
}
const services: PairingService[] = [];
const nativeBroadcastChannel = globalThis.BroadcastChannel;
function client(Socket = FailedSocket, BroadcastChannelImpl: typeof BroadcastChannel | null = nativeBroadcastChannel) {
  vi.stubGlobal("WebSocket", Socket);
  const inbox: RelayMessage[] = [];
  const service = new PairingService((message) => inbox.push(message), () => "ws://no-relay.invalid", {
    WebSocketImpl: Socket as unknown as typeof WebSocket,
    BroadcastChannelImpl,
    connectTimeoutMs: 25,
  });
  services.push(service);
  async function next(type: string) {
    await vi.waitFor(() => expect(inbox.some((m) => m.type === type)).toBe(true), { timeout: 1200, interval: 10 });
    return inbox.splice(inbox.findIndex((m) => m.type === type), 1)[0];
  }
  return { service, inbox, next };
}
afterEach(() => {
  services.splice(0).forEach((service) => service.close());
  PendingSocket.instances = [];
  vi.unstubAllGlobals();
});

test("WebSocket 오류 뒤 폴백이 QR 승인·측면 각도·촬영 종료를 전달한다", async () => {
  const pc = client(), phone = client();
  pc.service.connect("pc", () => pc.service.send({ type: "qr.issue" }));
  const qr = await pc.next("qr.issued");
  expect(pc.service.transport).toBe("broadcast");
  phone.service.connect("phone", () => phone.service.send({ type: "connect.request", token: qr.token }));
  const request = await pc.next("connect.requested");
  await phone.next("connect.pending");
  phone.service.send({ type: "side", seq: 0, t: Date.now(), valid: true, angleDeg: 78, earVis: .9, shoulderVis: .9 });
  expect((await phone.next("error")).code).toBe("not_approved");
  expect(pc.inbox.some((m) => m.type === "side")).toBe(false);
  pc.service.send({ type: "connect.approve", requestId: request.requestId });
  await pc.next("link.approved"); await phone.next("link.approved");
  phone.service.send({ type: "side", seq: 1, t: phone.service.toServer(Date.now()), valid: true, angleDeg: 78, earVis: .9, shoulderVis: .9 });
  expect(await pc.next("side")).toMatchObject({ valid: true, angleDeg: 78 });
  pc.service.send({ type: "stop.request" });
  const stop = await phone.next("stop.request");
  phone.service.send({ type: "stop.done", stopId: stop.stopId });
  await pc.next("stop.confirmed");
  expect((await phone.next("link.closed")).reason).toBe("stopped");
});
test.each([ThrowingSocket, PendingSocket])("생성 예외 또는 hello 무응답이면 폴백으로 준비한다: %s", async (Socket) => {
  const pc = client(Socket);
  pc.service.connect("pc", () => pc.service.send({ type: "qr.issue" }));
  await pc.next("qr.issued");
  expect(pc.service.transport).toBe("broadcast");
  expect(pc.service.open).toBe(true);
});
test("BroadcastChannel 미지원 환경은 실패를 통지하고 닫힌 상태를 유지한다", async () => {
  const pc = client(FailedSocket, null), ready = vi.fn();
  pc.service.connect("pc", ready);
  await vi.waitFor(() => expect(pc.inbox.some((m) => ["socket.error", "socket.closed"].includes(m.type))).toBe(true));
  expect(pc.service.open).toBe(false);
  expect(ready).not.toHaveBeenCalled();
});
test("수동 종료 뒤 늦게 발생한 오류와 hello는 연결을 다시 열지 않는다", async () => {
  const pc = client(PendingSocket), ready = vi.fn();
  pc.service.connect("pc", ready);
  const socket = PendingSocket.instances.at(-1)!;
  pc.service.close(); socket.onerror?.();
  socket.receive({ type: "hello", serverTime: Date.now() });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(ready).not.toHaveBeenCalled();
  expect(pc.service.open).toBe(false);
  expect(pc.inbox).toEqual([]);
});
test("접속 성공 뒤 유실은 기존 승인을 폐기하며 준비 콜백을 자동 재호출하지 않는다", async () => {
  const phone = client(PendingSocket), ready = vi.fn();
  phone.service.connect("phone", ready);
  const socket = PendingSocket.instances.at(-1)!;
  socket.readyState = 1;
  socket.receive({ type: "hello", serverTime: Date.now(), heartbeatMs: 2000 });
  socket.receive({ type: "link.approved", linkId: "old-link" });
  expect(ready).toHaveBeenCalledTimes(1);
  socket.onclose?.();
  await vi.waitFor(() => expect(phone.inbox.some((m) => ["socket.closed", "socket.error"].includes(m.type))).toBe(true));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(ready).toHaveBeenCalledTimes(1);
});

test("JSON 값이나 잘못된 hello는 무시하고 정상 hello 뒤에만 준비한다", () => {
  const pc = client(PendingSocket), ready = vi.fn();
  pc.service.connect("pc", ready);
  const socket = PendingSocket.instances.at(-1)!;
  socket.readyState = 1;
  for (const data of ["null", "42", '"hello"', "[]", "{}", '{"type":7}', '{"type":"hello","serverTime":null}', '{"type":"hello","serverTime":1,"heartbeatMs":-1}']) {
    expect(() => socket.onmessage?.({ data })).not.toThrow();
  }
  expect(ready).not.toHaveBeenCalled();
  expect(pc.inbox).toEqual([]);
  socket.receive({ type: "hello", serverTime: Date.now(), heartbeatMs: 2000 });
  expect(ready).toHaveBeenCalledOnce();
  pc.service.close();
});

test("중복 hello는 준비 콜백을 다시 실행하지 않고 잘못된 서버 시각을 반영하지 않는다", () => {
  const pc = client(PendingSocket), ready = vi.fn();
  pc.service.connect("pc", ready);
  const socket = PendingSocket.instances.at(-1)!;
  socket.readyState = 1;
  socket.receive({ type: "hello", serverTime: Date.now() + 60000, heartbeatMs: 2000 });
  const offset = pc.service.toServer(0);
  socket.receive({ type: "hello", serverTime: Date.now(), heartbeatMs: 2000 });
  expect(ready).toHaveBeenCalledOnce();
  socket.onmessage?.({ data: '{"type":"pong","serverTime":1e999}' });
  expect(Number.isFinite(pc.service.toServer(0))).toBe(true);
  pc.service.close();
  expect(pc.service.toServer(0)).toBe(0);
  expect(offset).toBeGreaterThan(59000);
});
