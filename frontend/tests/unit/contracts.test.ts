import { createServer, type Server } from "node:http";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, test } from "vitest";
import { createCollector, createEngine } from "../../src/lib/posture";
import {
  CONNECTION_PILOT,
  DEFAULT_SETTINGS,
  sameSettings,
  validateSettings,
  withDefaults,
} from "../../src/lib/policy";
import { compareRecords, loadData } from "../../src/features/history/storage";
import {
  PairingService,
  type RelayMessage,
} from "../../src/features/connection/PairingService";
import { attachRelay } from "../../../posture-web/shared/relay.js";

const sample = {
  head_forward: 0.4,
  neck_len: 0.4,
  ear_vis: 1,
  shoulder_vis: 1,
  pitch_deg: 0,
};
const newEngine = (id = "test") =>
  createEngine({
    id,
    startedAt: 0,
    mode: "basic",
    baselineId: "b",
    settingsVersionId: "s",
    settings: DEFAULT_SETTINGS,
  });

// 기본 recognitionGraceSeconds는 0초다(docs/prd.md). 2초 유예 파일럿은 core detector 테스트가 따로 검증한다.
test("registration restarts on the first missing frame with the default policy", () => {
  const collector = createCollector();
  collector.push(0, sample);
  collector.push(3000, sample);
  expect(collector.push(4000, null).status).toBe("restarted");
  collector.push(5000, sample);
  expect(collector.push(9000, sample).status).toBe("collecting");
  expect(collector.push(10000, sample).status).toBe("done");
});
test("warning at ten seconds and paused time excluded", () => {
  const e = newEngine();
  e.start(0);
  let signals: { type: string }[] = [];
  for (let t = 0; t <= 10000; t += 250)
    signals = e.tick(t, {
      quality: "valid",
      deviated: true,
      types: ["head_forward"],
    });
  expect(signals.some((s) => s.type === "warning")).toBe(true);
  e.pause(10000);
  const valid = e.validMs;
  e.tick(100000, { quality: "valid", deviated: true });
  expect(e.validMs).toBe(valid);
});
test("settings reject nonpositive values without arbitrary upper limit", () => {
  for (const warningSeconds of [0, -1, 0.5, NaN])
    expect(validateSettings({ ...DEFAULT_SETTINGS, warningSeconds })).toBe(
      "양의 정수를 입력해 주세요",
    );
  expect(
    validateSettings({ ...DEFAULT_SETTINGS, warningSeconds: 301 }),
  ).toBeNull();
});
test("only a real change makes a new settings version, old settings get defaults", () => {
  expect(sameSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS })).toBe(true);
  expect(
    sameSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, sound: true }),
  ).toBe(false);
  expect(
    sameSettings(DEFAULT_SETTINGS, {
      ...DEFAULT_SETTINGS,
      sensitivity: "high",
    }),
  ).toBe(false);
  expect(withDefaults({ warningSeconds: 12, rewarningSeconds: 60 })).toEqual({
    ...DEFAULT_SETTINGS,
    warningSeconds: 12,
  });
});
test("records survive reload in IndexedDB and missing storage is surfaced", async () => {
  const factory = new IDBFactory();
  const first = await loadData(factory);
  expect(first.data.baseline).toBeNull();
  expect(first.data.sessions).toEqual([]);
  const baseline = {
    id: "b",
    mode: "basic" as const,
    signals: sample,
    sideAngle: null,
    createdAt: 1,
  };
  await first.store.addBaseline(baseline);
  const engine = newEngine("running");
  engine.start(0);
  engine.tick(1000, { quality: "valid" });
  await first.store.saveSession(engine, 1000);

  // 새로고침: 기준은 남고, 끝나지 않은 세션은 중단 세션으로 마무리된다.
  const second = await loadData(factory);
  expect(second.data.baseline?.id).toBe("b");
  expect(second.data.sessions.map((s) => [s.id, s.state])).toEqual([
    ["running", "ended"],
  ]);
  expect(await second.store.deleteSession("running")).toBe(true);
  const third = await loadData(factory);
  expect(third.data.sessions).toEqual([]);
  expect(third.data.baseline?.id).toBe("b");

  await expect(loadData(undefined as unknown as IDBFactory)).rejects.toThrow();
});
test("comparison needs enough records and the same condition", () => {
  const finished = (id: string, baselineId = "b") => {
    const e = createEngine({
      id,
      startedAt: 0,
      mode: "basic",
      baselineId,
      settingsVersionId: "s",
      settings: DEFAULT_SETTINGS,
    });
    e.start(0);
    for (let t = 0; t <= 5000; t += 250) e.tick(t, { quality: "valid" });
    e.end(5000);
    return e.toJSON();
  };
  expect(compareRecords(finished("a"))).toBe("비교할 기록이 부족해요");
  expect(compareRecords(finished("a"), finished("b", "other"))).toBe(
    "조건이 달라 비교할 수 없어요",
  );
  expect(compareRecords(finished("a"), finished("b"))).toBe(
    "이전 기록과 이탈 비율이 같아요.",
  );
});

let server: Server | undefined;
let relay: { close(): void } | undefined;
const services: PairingService[] = [];
afterEach(() => {
  services.forEach((service) => service.close());
  relay?.close();
  server?.close();
});
test("PC and phone follow the backend deep-mode contract", async () => {
  server = createServer();
  relay = attachRelay(server);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const { port } = server.address() as { port: number };
  const client = () => {
    const inbox: RelayMessage[] = [];
    const service = new PairingService(
      (message) => inbox.push(message),
      () => `ws://localhost:${port}`,
    );
    services.push(service);
    const next = async (type: string) => {
      for (let i = 0; i < 100; i++) {
        const index = inbox.findIndex((m) => m.type === type);
        if (index >= 0) return inbox.splice(index, 1)[0];
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`${type} 메시지가 오지 않았어요`);
    };
    return { service, next };
  };

  const pc = client();
  pc.service.connect("pc", () => pc.service.send({ type: "qr.issue" }));
  const issued = await pc.next("qr.issued");
  expect(Number(issued.expiresAt) - Number(issued.issuedAt)).toBe(
    CONNECTION_PILOT.qrExpirySeconds * 1000,
  );

  const phone = client();
  phone.service.connect("phone", () =>
    phone.service.send({ type: "connect.request", token: issued.token }),
  );
  const requested = await pc.next("connect.requested");
  await phone.next("connect.pending");

  // 다른 휴대폰이 먼저 요청한 QR은 넘기지 않는다.
  const other = client();
  other.service.connect("phone", () =>
    other.service.send({ type: "connect.request", token: issued.token }),
  );
  expect((await other.next("connect.rejected")).code).toBe("used");

  pc.service.send({ type: "connect.approve", requestId: requested.requestId });
  await pc.next("link.approved");
  await phone.next("link.approved");

  const t = phone.service.toServer(Date.now());
  phone.service.send({
    type: "side",
    seq: 1,
    t,
    valid: true,
    angleDeg: 80,
    earVis: 0.9,
    shoulderVis: 0.9,
  });
  const side = await pc.next("side");
  expect([side.angleDeg, side.valid]).toEqual([80, true]);
  expect(
    Math.abs(pc.service.toLocal(Number(side.t)) - Date.now()),
  ).toBeLessThan(1000);

  pc.service.send({ type: "stop.request" });
  const stop = await phone.next("stop.request");
  phone.service.send({ type: "stop.done", stopId: stop.stopId });
  await pc.next("stop.confirmed");
  expect((await phone.next("link.closed")).reason).toBe("stopped");
});
