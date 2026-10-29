import { createServer, type Server } from "node:http";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, test } from "vitest";
import WebSocket from "ws";
import { createCollector, createEngine } from "../../src/lib/posture";
import {
  CONNECTION_PILOT,
  DEFAULT_SETTINGS,
  changesJudgment,
  sameSettings,
  validateSettings,
} from "../../src/lib/policy";
import { compareRecords, loadData } from "../../src/features/history/storage";
import { attachRelay } from "../../server/relay.mjs";

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

test("registration keeps time over a short gap but restarts after a long one", () => {
  const short = createCollector();
  short.push(0, sample);
  short.push(3000, sample);
  expect(short.push(4000, null).status).toBe("paused");
  short.push(5000, sample);
  expect(short.push(6000, sample).status).toBe("collecting");
  expect(short.push(7000, sample).status).toBe("done");

  const long = createCollector();
  long.push(0, sample);
  long.push(3000, sample);
  long.push(4000, null);
  expect(long.push(6500, null).status).toBe("restarted");
  long.push(7000, sample);
  expect(long.push(11000, sample).status).toBe("collecting");
  expect(long.push(12000, sample).status).toBe("done");
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
test("only a real change makes a new settings version, only timing closes deviation", () => {
  expect(sameSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS })).toBe(true);
  const quiet = { ...DEFAULT_SETTINGS, sound: false };
  expect(sameSettings(DEFAULT_SETTINGS, quiet)).toBe(false);
  expect(changesJudgment(DEFAULT_SETTINGS, quiet)).toBe(false);
  expect(
    changesJudgment(DEFAULT_SETTINGS, {
      ...DEFAULT_SETTINGS,
      warningSeconds: 12,
    }),
  ).toBe(true);
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
afterEach(() => server?.close());
test("QR requests are refused after 120 seconds or once used", async () => {
  let clock = 0;
  server = createServer();
  attachRelay(server, () => clock);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const { port } = server.address() as { port: number };
  const open = () =>
    new Promise<WebSocket>((resolve) => {
      const ws = new WebSocket(`ws://localhost:${port}/relay`, {
        origin: `http://localhost:${port}`,
      });
      ws.on("open", () => resolve(ws));
    });
  const next = (ws: WebSocket) =>
    new Promise<string>((resolve) =>
      ws.once("message", (data) => resolve(JSON.parse(String(data)).type)),
    );
  const token = crypto.randomUUID();
  const host = await open();
  const ready = next(host);
  host.send(JSON.stringify({ type: "host", token }));
  expect(await ready).toBe("ready");

  clock = CONNECTION_PILOT.qrExpirySeconds * 1000;
  const late = await open();
  const refused = next(late);
  late.send(JSON.stringify({ type: "join", token }));
  expect(await refused).toBe("expired");

  const fresh = crypto.randomUUID();
  const host2 = await open();
  host2.send(JSON.stringify({ type: "host", token: fresh }));
  await next(host2);
  const phone = await open();
  const waiting = next(phone);
  phone.send(JSON.stringify({ type: "join", token: fresh }));
  expect(await waiting).toBe("waiting");
  const other = await open();
  const used = next(other);
  other.send(JSON.stringify({ type: "join", token: fresh }));
  expect(await used).toBe("used");
  [host, host2, phone, other].forEach((ws) => ws.close());
});
