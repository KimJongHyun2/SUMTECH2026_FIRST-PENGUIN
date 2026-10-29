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

export class CameraService {
  readonly video = document.createElement("video");
  stream: MediaStream | null = null;
  private pose?: PoseLandmarker;
  private face?: FaceLandmarker;
  private generation = 0;
  private timer?: ReturnType<typeof setInterval>;
  private lastFrame = -1;
  constructor(private onFrame: (frame: Frame) => void) {
    this.video.muted = true;
    this.video.playsInline = true;
  }

  async start(side = false) {
    this.stop();
    const generation = this.generation;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: side ? "environment" : "user",
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
        this.onFrame({
          ...invalid,
          quality:
            s.ear_vis >= 0.5 && s.shoulder_vis >= 0.5
              ? "valid"
              : "unrecognized",
          angle: s.angle_deg,
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
  }
  dispose() {
    this.stop();
    this.pose?.close();
    this.face?.close();
  }
}
