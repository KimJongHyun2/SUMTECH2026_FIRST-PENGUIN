// 평가 입력 영상의 구간별 추론 결과를 센다 (docs/prd.md 7절 "영상 라벨과 추론 결과가 일치하는지 먼저 확인").
// 앱과 같은 모델·신호·판정 코드를 쓰고, 기준은 'good' 구간 평균으로 만든다.
import { averageSamples, evaluateFrame, frameQuality } from '../src/core/detector.js';
import { frontSignals, largestPose, pitchFromMatrix } from '../src/signals.js';
import { createFace, createPose } from '../src/vision.js';

const STEP_S = 0.2;
const video = document.getElementById('video');
const out = document.getElementById('out');

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 앱과 같이 영상을 재생하면서 STEP_S마다 현재 프레임을 캔버스에 그려 추론한다.
// (멈춘 영상을 시크해 읽으면 헤드리스 브라우저에서 이전 프레임이 반복될 수 있다)
async function samplesOf(models, segment) {
  const [pose, face] = models;
  const samples = [];
  video.currentTime = segment.start;
  await new Promise((resolve) => { video.onseeked = resolve; });
  await video.play();
  while (video.currentTime < segment.end - 0.1) {
    await wait(STEP_S * 1000);
    if (video.currentTime >= segment.end) break;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const now = performance.now();
    const landmarks = largestPose(pose.detectForVideo(canvas, now).landmarks);
    const faces = face.detectForVideo(canvas, now + 1);
    const matrix = faces.facialTransformationMatrixes?.[0]?.data;
    const signals = landmarks ? frontSignals(landmarks, canvas.width, canvas.height) : null;
    samples.push(signals && { ...signals, pitch_deg: matrix ? pitchFromMatrix(matrix) : null });
  }
  video.pause();
  return samples;
}

async function main() {
  const manifest = await fetch('/eval/test-pose.manifest.json', { cache: 'no-store' }).then((r) => r.json());
  // 앱(RecordedInput)과 같이 통째로 받아 Blob으로 재생한다. 서버가 Range 요청을 지원하지 않아도 시크할 수 있다.
  const blob = await fetch(`/eval/${manifest.file}`).then((r) => r.blob());
  video.src = URL.createObjectURL(blob);
  await new Promise((resolve) => { video.onloadeddata = resolve; });
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const models = await Promise.all([createPose(), createFace()]);

  const bySegment = {};
  for (const segment of manifest.segments) bySegment[segment.label] = await samplesOf(models, segment);
  const baseline = averageSamples(bySegment.good);

  const results = {};
  for (const [label, samples] of Object.entries(bySegment)) {
    const counts = { frames: samples.length, valid: 0, away: 0, unrecognized: 0, deviated: 0 };
    for (const sample of samples) {
      const quality = frameQuality(sample, baseline);
      counts[quality] += 1;
      if (evaluateFrame(sample, baseline).deviated) counts.deviated += 1;
    }
    results[label] = counts;
  }
  out.textContent = JSON.stringify({ stepSeconds: STEP_S, baseline, results }, null, 2);
  out.dataset.done = 'true';
}

main().catch((error) => {
  out.textContent = `실패: ${error.message}`;
  out.dataset.done = 'error';
});
