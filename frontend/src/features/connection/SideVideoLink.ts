// 딥 모드 측면 영상. 휴대폰 영상은 WebRTC로 PC에 직접(암호화) 전달해 화면에만 보여 주고 저장하지 않는다.
// 연결 정보(SDP)는 중계 서버의 'rtc' 메시지로 한 번씩 주고받는다. 판정은 기존처럼 측면 각도만 쓴다.
import type { RelayMessage } from "./PairingService";

// 서로 다른 네트워크(예: 휴대폰 데이터)에서도 주소를 찾도록 공개 STUN을 쓴다. TURN이 없어 일부 망에서는 연결되지 않을 수 있다.
const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
// 후보 주소를 모두 모은 뒤 한 번에 보낸다. 오래 걸리면 모인 만큼만 보낸다.
const GATHER_TIMEOUT_MS = 3000;

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
  constructor(
    private send: (message: RelayMessage) => void,
    /** PC: 측면 영상이 생기거나 끊길 때 부른다. */
    private onStream: (stream: MediaStream | null) => void = () => {},
  ) {}

  /** 휴대폰: 카메라 영상을 보내는 연결을 제안한다. */
  async offer(stream: MediaStream) {
    const peer = this.reset();
    stream.getVideoTracks().forEach((track) => peer.addTrack(track, stream));
    await peer.setLocalDescription(await peer.createOffer());
    await gathered(peer);
    if (this.peer === peer)
      this.send({
        type: "rtc",
        kind: "offer",
        sdp: peer.localDescription!.sdp,
      });
  }

  /** 서버가 전달한 상대의 신호를 처리한다. PC는 offer에 answer로 답하고, 휴대폰은 answer를 적용한다. */
  async receive(message: RelayMessage) {
    const sdp = String(message.sdp);
    if (message.kind === "answer") {
      if (this.peer?.signalingState === "have-local-offer")
        await this.peer.setRemoteDescription({ type: "answer", sdp });
      return;
    }
    const peer = this.reset();
    peer.ontrack = ({ streams: [stream] }) => {
      if (this.peer === peer) this.onStream(stream ?? null);
    };
    peer.onconnectionstatechange = () => {
      if (
        this.peer === peer &&
        ["failed", "closed"].includes(peer.connectionState)
      )
        this.onStream(null);
    };
    await peer.setRemoteDescription({ type: "offer", sdp });
    await peer.setLocalDescription(await peer.createAnswer());
    await gathered(peer);
    if (this.peer === peer)
      this.send({
        type: "rtc",
        kind: "answer",
        sdp: peer.localDescription!.sdp,
      });
  }

  close() {
    if (!this.peer) return;
    this.peer.close();
    this.peer = null;
    this.onStream(null);
  }

  private reset() {
    this.close();
    this.peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    return this.peer;
  }
}
