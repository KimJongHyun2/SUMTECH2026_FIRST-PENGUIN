import {
  FaceLandmarker,
  PoseLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import {
  frontSignals,
  largestPose,
  pitchFromMatrix,
  quality,
  sideAngle,
} from "../../lib/posture";
import type { Frame, Signals } from "../../lib/types";
import type { RecordedSource } from "../eval/evalMode";

export class CameraService {
  readonly video = document.createElement("video");
  stream: MediaStream | null = null;
  private pose?: PoseLandmarker;
  private face?: FaceLandmarker;
  private generation = 0;
  private timer?: ReturnType<typeof setInterval>;
  private lastFrame = -1;
  /** recorded: 평가 모드의 녹화 입력. 있으면 PC 정면 카메라 권한을 요청하지 않고 녹화 영상을 같은 경로로 판정한다. */
  constructor(
    private onFrame: (frame: Frame) => void,
    private recorded: RecordedSource | null = null,
  ) {
    this.video.muted = true;
    this.video.playsInline = true;
  }

  /** facing: 휴대폰 측면 카메라의 방향. 없으면 휴대폰은 후면, PC는 전면을 쓴다. */
  async start(side = false, facing?: "user" | "environment") {
    this.stop();
    const generation = this.generation;
    if (this.recorded && !side) {
      await this.recorded.start(this.video);
      if (generation !== this.generation) {
        this.recorded.stop();
        throw new DOMException("취소됨", "AbortError");
      }
      this.stream = (
        this.video as HTMLVideoElement & { captureStream(): MediaStream }
      ).captureStream();
    } else {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing ?? (side ? "environment" : "user"),
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        throw new DOMException("취소됨", "AbortError");
      }
      this.stream = stream;
      this.video.srcObject = stream;
    }
    try {
      await this.video.play();
      const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      // CPU 경로는 GPU 초기화가 실패한 환경에서도 동일한 모델을 사용한다.
      if (!this.pose)
        this.pose = await PoseLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: "/models/pose_landmarker_lite.task" },
          runningMode: "VIDEO",
          // 뒤쪽의 다른 사람이 함께 잡혀도 가장 가까운 사람을 사용자로 본다.
          numPoses: 3,
        });
      if (!side && !this.face)
        this.face = await FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: "/models/face_landmarker.task" },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFacialTransformationMatrixes: true,
        });
      if (generation !== this.generation)
        throw new DOMException("취소됨", "AbortError");
      this.lastFrame = -1;
      this.timer = setInterval(() => this.sample(side), 250);
    } catch (error) {
      if (generation === this.generation) this.stop();
      throw error;
    }
  }

  private sample(side: boolean) {
    const at = Date.now();
    const invalid: Frame = {
      at,
      quality: "unrecognized",
      signals: null,
      angle: null,
    };
    if (
      this.video.readyState < 2 ||
      this.lastFrame === this.video.currentTime
    ) {
      this.onFrame(invalid);
      return;
    }
    this.lastFrame = this.video.currentTime;
    try {
      const t = performance.now();
      const points = largestPose(
        this.pose!.detectForVideo(this.video, t).landmarks,
      );
      if (!points) {
        this.onFrame({ ...invalid, quality: "away" });
        return;
      }
      if (side) {
        const s = sideAngle(
          points,
          this.video.videoWidth,
          this.video.videoHeight,
        );
        // 귀가 어깨보다 아래로 잡힌 각도(음수)는 측면 배치가 잘못된 입력으로 본다.
        const valid =
          s.ear_vis >= 0.5 &&
          s.shoulder_vis >= 0.5 &&
          s.angle_deg >= 0 &&
          s.angle_deg <= 180;
        this.onFrame({
          ...invalid,
          quality: valid ? "valid" : "unrecognized",
          angle: valid ? s.angle_deg : null,
          earVis: s.ear_vis,
          shoulderVis: s.shoulder_vis,
        });
      } else {
        const values = frontSignals(
          points,
          this.video.videoWidth,
          this.video.videoHeight,
        );
        const matrix = this.face!.detectForVideo(this.video, t)
          .facialTransformationMatrixes[0]?.data;
        const signals: Signals | null = values
          ? { ...values, pitch_deg: matrix ? pitchFromMatrix(matrix) : null }
          : null;
        const q = quality(signals);
        this.onFrame({
          at,
          signals,
          angle: null,
          quality: q === "valid" && !matrix ? "unrecognized" : q,
        });
      }
    } catch {
      this.onFrame(invalid);
    }
  }

  stop() {
    this.generation++;
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.recorded?.stop();
  }
  dispose() {
    this.stop();
    this.pose?.close();
    this.face?.close();
  }
}
