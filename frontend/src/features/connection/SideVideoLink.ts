// 딥 모드 측면 영상. 휴대폰 영상은 WebRTC로 PC에 직접(암호화) 전달해 화면에만 보여 주고 저장하지 않는다.
// 연결 정보(SDP)는 중계 서버의 'rtc' 메시지로 한 번씩 주고받는다. 판정은 기존처럼 측면 각도만 쓴다.
import type { RelayMessage } from "./PairingService";

// 서로 다른 네트워크(예: 휴대폰 데이터)에서도 주소를 찾도록 공개 STUN을 쓴다. TURN이 없어 일부 망에서는 연결되지 않을 수 있다.
const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
// 후보 주소를 모두 모은 뒤 한 번에 보낸다. 오래 걸리면 모인 만큼만 보낸다.
const GATHER_TIMEOUT_MS = 3000;
const CONNECT_TIMEOUT_MS = 15000;
export type SideVideoStatus = "idle" | "connecting" | "connected" | "failed";

function gathered(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, GATHER_TIMEOUT_MS);
    peer.addEventListener("icegatheringstatechange", () => {
      if (peer.iceGatheringState !== "complete") return;
      clearTimeout(timer);
      resolve();
    });
  });
}

export class SideVideoLink {
  private peer: RTCPeerConnection | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private send: (message: RelayMessage) => void,
    /** PC: 측면 영상이 생기거나 끊길 때 부른다. */
    private onStream: (stream: MediaStream | null) => void = () => {},
    private onStatus: (status: SideVideoStatus) => void = () => {},
  ) {}

  /** 휴대폰: 카메라 영상을 보내는 연결을 제안한다. */
  async offer(stream: MediaStream) {
    const peer = this.reset();
    if (!peer) return;
    try {
      stream.getVideoTracks().forEach((track) => peer.addTrack(track, stream));
      const offer = await peer.createOffer();
      if (this.peer !== peer) return;
      await peer.setLocalDescription(offer);
      await gathered(peer);
      if (this.peer === peer)
        this.send({
          type: "rtc",
          kind: "offer",
          sdp: peer.localDescription!.sdp,
        });
    } catch {
      this.fail(peer);
    }
  }

  /** 서버가 전달한 상대의 신호를 처리한다. PC는 offer에 answer로 답하고, 휴대폰은 answer를 적용한다. */
  async receive(message: RelayMessage) {
    if (message.kind !== "answer" && message.kind !== "offer") return;
    const sdp = String(message.sdp);
    if (message.kind === "answer") {
      const peer = this.peer;
      if (peer?.signalingState === "have-local-offer") {
        try {
          await peer.setRemoteDescription({ type: "answer", sdp });
        } catch {
          this.fail(peer);
        }
      }
      return;
    }
    const peer = this.reset();
    if (!peer) return;
    peer.ontrack = ({ streams: [stream] }) => {
      if (this.peer === peer) this.onStream(stream ?? null);
    };
    try {
      await peer.setRemoteDescription({ type: "offer", sdp });
      if (this.peer !== peer) return;
      const answer = await peer.createAnswer();
      if (this.peer !== peer) return;
      await peer.setLocalDescription(answer);
      await gathered(peer);
      if (this.peer === peer)
        this.send({
          type: "rtc",
          kind: "answer",
          sdp: peer.localDescription!.sdp,
        });
    } catch {
      this.fail(peer);
    }
  }

  close() {
    clearTimeout(this.timer);
    const peer = this.peer;
    this.peer = null;
    if (peer) {
      peer.onconnectionstatechange = null;
      peer.ontrack = null;
      peer.close();
    }
    this.onStream(null);
    this.onStatus("idle");
  }

  private fail(peer: RTCPeerConnection) {
    if (this.peer !== peer) return;
    this.close();
    this.onStatus("failed");
  }

  private reset() {
    this.close();
    try {
      const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      this.peer = peer;
      this.onStatus("connecting");
      this.timer = setTimeout(() => this.fail(peer), CONNECT_TIMEOUT_MS);
      peer.onconnectionstatechange = () => {
        if (this.peer !== peer) return;
        if (peer.connectionState === "connected") {
          clearTimeout(this.timer);
          this.onStatus("connected");
        } else if (
          ["failed", "closed", "disconnected"].includes(peer.connectionState)
        ) {
          this.fail(peer);
        }
      };
      return peer;
    } catch {
      this.onStatus("failed");
      return null;
    }
  }
}
