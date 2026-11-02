import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CameraService } from "../../src/features/camera/CameraService";

const vision = vi.hoisted(() => ({
  files: vi.fn(),
  pose: vi.fn(),
  face: vi.fn(),
}));
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vision.files },
  PoseLandmarker: { createFromOptions: vision.pose },
  FaceLandmarker: { createFromOptions: vision.face },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const cameras: CameraService[] = [];
let video: { play: ReturnType<typeof vi.fn>; srcObject: unknown };
let track: { stop: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.useFakeTimers();
  video = { play: vi.fn(async () => {}), srcObject: null };
  track = { stop: vi.fn() };
  vi.stubGlobal("document", { createElement: () => video });
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })),
    },
  });
  vision.files.mockReset().mockResolvedValue({});
  vision.pose.mockReset().mockImplementation(async () => ({ close: vi.fn() }));
  vision.face.mockReset().mockImplementation(async () => ({ close: vi.fn() }));
});
afterEach(() => {
  cameras.splice(0).forEach((camera) => camera.dispose());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function camera() {
  const service = new CameraService(vi.fn());
  cameras.push(service);
  return service;
}

test("재생 준비 중 취소하면 모델을 불러오지 않고 카메라를 끈다", async () => {
  const play = deferred<void>();
  video.play.mockReturnValueOnce(play.promise);
  const service = camera();
  const starting = service.start();
  const result = expect(starting).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(video.play).toHaveBeenCalled());
  service.stop();
  play.resolve();
  await result;
  expect(vision.files).not.toHaveBeenCalled();
  expect(track.stop).toHaveBeenCalledOnce();
  expect(service.stream).toBeNull();
});

test("모델 생성 중 종료하면 늦게 생성된 모델도 해제한다", async () => {
  const pending = deferred<{ close: ReturnType<typeof vi.fn> }>();
  vision.pose.mockReturnValueOnce(pending.promise);
  const service = camera();
  const starting = service.start();
  const result = expect(starting).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(vision.pose).toHaveBeenCalled());
  service.dispose();
  const model = { close: vi.fn() };
  pending.resolve(model);
  await result;
  expect(model.close).toHaveBeenCalledOnce();
  expect(vision.face).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

test("종료한 서비스를 다시 켜면 닫힌 모델을 재사용하지 않는다", async () => {
  const service = camera();
  await service.start();
  const oldPose = await vision.pose.mock.results[0].value;
  const oldFace = await vision.face.mock.results[0].value;
  service.dispose();
  await service.start();
  expect(vision.pose).toHaveBeenCalledTimes(2);
  expect(vision.face).toHaveBeenCalledTimes(2);
  expect(oldPose.close).toHaveBeenCalledOnce();
  expect(oldFace.close).toHaveBeenCalledOnce();
});

test("얼굴 모델 생성 중 종료하면 늦게 생성된 모델과 기존 자세 모델을 해제한다", async () => {
  const pending = deferred<{ close: ReturnType<typeof vi.fn> }>();
  vision.face.mockReturnValueOnce(pending.promise);
  const service = camera();
  const starting = service.start();
  const result = expect(starting).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(vision.face).toHaveBeenCalled());
  const pose = await vision.pose.mock.results[0].value;
  service.dispose();
  const face = { close: vi.fn() };
  pending.resolve(face);
  await result;
  expect(pose.close).toHaveBeenCalledOnce();
  expect(face.close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

test("취소된 카메라 권한 요청이 늦게 완료돼도 새 카메라를 끄지 않는다", async () => {
  const pending = deferred<{ getTracks(): { stop(): void }[] }>();
  vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValueOnce(
    pending.promise as Promise<MediaStream>,
  );
  const service = camera();
  const starting = service.start();
  const result = expect(starting).rejects.toMatchObject({ name: "AbortError" });
  await service.start();
  const current = service.stream;
  const oldTrack = { stop: vi.fn() };
  pending.resolve({ getTracks: () => [oldTrack] });
  await result;
  expect(oldTrack.stop).toHaveBeenCalledOnce();
  expect(track.stop).not.toHaveBeenCalled();
  expect(service.stream).toBe(current);
});
