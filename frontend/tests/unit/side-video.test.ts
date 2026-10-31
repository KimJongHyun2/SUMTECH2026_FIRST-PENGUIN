import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SideVideoLink } from "../../src/features/connection/SideVideoLink";

class Peer {
  static instances: Peer[] = [];
  iceGatheringState = "complete";
  connectionState = "new";
  signalingState = "have-local-offer";
  localDescription = { sdp: "local-sdp" };
  ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  addTrack = vi.fn();
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "offer" }));
  createAnswer = vi.fn(async () => ({ type: "answer", sdp: "answer" }));
  setLocalDescription = vi.fn(async () => {});
  setRemoteDescription = vi.fn(async () => {});
  close = vi.fn();
  constructor() {
    Peer.instances.push(this);
  }
  change(state: string) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
}
const links: SideVideoLink[] = [];
function link() {
  const send = vi.fn(),
    stream = vi.fn(),
    status = vi.fn();
  const video = new SideVideoLink(send, stream, status);
  links.push(video);
  return { video, send, stream, status };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("RTCPeerConnection", Peer);
});
afterEach(() => {
  links.splice(0).forEach((video) => video.close());
  Peer.instances = [];
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("측면 영상 연결 성공 뒤 타임아웃을 취소하고 끊기면 실패를 알린다", async () => {
  const { video, send, stream, status } = link();
  await video.receive({ type: "rtc", kind: "offer", sdp: "remote" });
  expect(send).toHaveBeenCalledWith({
    type: "rtc",
    kind: "answer",
    sdp: "local-sdp",
  });
  const peer = Peer.instances[0];
  const remote = {} as MediaStream;
  peer.ontrack?.({ streams: [remote] });
  expect(stream).toHaveBeenLastCalledWith(remote);
  peer.change("connected");
  await vi.advanceTimersByTimeAsync(15000);
  expect(status).toHaveBeenLastCalledWith("connected");
  peer.change("disconnected");
  expect(status).toHaveBeenLastCalledWith("failed");
  expect(stream).toHaveBeenLastCalledWith(null);
  expect(peer.close).toHaveBeenCalledOnce();
});

test("연결이 15초 동안 완료되지 않으면 자원을 닫고 새 제안을 받을 수 있다", async () => {
  const { video, status } = link();
  await video.receive({ type: "rtc", kind: "offer", sdp: "remote" });
  await vi.advanceTimersByTimeAsync(15000);
  expect(status).toHaveBeenLastCalledWith("failed");
  expect(Peer.instances[0].close).toHaveBeenCalledOnce();
  await video.receive({ type: "rtc", kind: "offer", sdp: "new" });
  Peer.instances[1].change("connected");
  expect(status).toHaveBeenLastCalledWith("connected");
});

test("WebRTC 미지원과 SDP 협상 오류를 실패 상태로 알린다", async () => {
  const { video, status } = link();
  vi.stubGlobal("RTCPeerConnection", undefined);
  await video.offer({ getVideoTracks: () => [] } as unknown as MediaStream);
  expect(status).toHaveBeenLastCalledWith("failed");
  vi.stubGlobal("RTCPeerConnection", Peer);
  await video.offer({ getVideoTracks: () => [] } as unknown as MediaStream);
  Peer.instances[0].setRemoteDescription.mockRejectedValueOnce(
    new Error("잘못된 SDP"),
  );
  await video.receive({ type: "rtc", kind: "answer", sdp: "invalid" });
  expect(status).toHaveBeenLastCalledWith("failed");
  expect(Peer.instances[0].close).toHaveBeenCalledOnce();
});

test("종료 후 늦게 실패한 협상은 상태를 덮어쓰거나 응답을 전송하지 않는다", async () => {
  const { video, send, status } = link();
  let reject!: (error: Error) => void;
  const pending = new Promise<void>((_, fail) => {
    reject = fail;
  });
  // 첫 await가 끝나기 전에 종료하는 경로를 재현한다.
  const receiving = video.receive({
    type: "rtc",
    kind: "offer",
    sdp: "remote",
  });
  const peer = Peer.instances[0];
  peer.createAnswer.mockImplementationOnce(async () => {
    await pending;
    return { type: "answer", sdp: "late" };
  });
  await Promise.resolve();
  video.close();
  reject(new Error("늦은 협상 실패"));
  await receiving;
  expect(status).toHaveBeenLastCalledWith("idle");
  expect(send).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(15000);
  expect(status).toHaveBeenLastCalledWith("idle");
});
