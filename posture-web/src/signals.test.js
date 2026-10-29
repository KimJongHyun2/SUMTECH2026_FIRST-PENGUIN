import { describe, expect, it } from 'vitest';
import { POSE, angleFromPoints, frontSignals, largestPose, pitchFromMatrix, sideAngle } from './signals.js';

const W = 640;
const H = 480;

function makePose(points) {
  const pose = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  for (const [index, p] of Object.entries(points)) pose[index] = { visibility: 0.9, ...p };
  return pose;
}

const upright = {
  [POSE.L_EAR]: { x: 0.45, y: 0.4 },
  [POSE.R_EAR]: { x: 0.55, y: 0.4 },
  [POSE.L_SHOULDER]: { x: 0.35, y: 0.7 },
  [POSE.R_SHOULDER]: { x: 0.65, y: 0.7 },
};

// 화면 중심 기준으로 전체를 확대 = 의자를 당겨 앉은 상황
const zoom = (points, k) => Object.fromEntries(
  Object.entries(points).map(([i, p]) => [i, { x: 0.5 + (p.x - 0.5) * k, y: 0.5 + (p.y - 0.5) * k }]),
);

describe('배치 값과 가장 가까운 사람 고르기', () => {
  it('어깨 너비·중심을 화면 대비 비율로 준다', () => {
    const s = frontSignals(makePose(upright), W, H);
    expect(s.shoulder_w).toBeCloseTo(0.3);
    expect(s.center_x).toBeCloseTo(0.5);
    expect(s.center_y).toBeCloseTo(0.7);
  });

  it('여러 사람이 잡히면 어깨가 가장 넓은 사람을 고른다', () => {
    const far = makePose({ ...upright, [POSE.L_SHOULDER]: { x: 0.74, y: 0.8 }, [POSE.R_SHOULDER]: { x: 0.76, y: 0.8 } });
    const near = makePose(upright);
    expect(largestPose([far, near])).toBe(near);
    expect(largestPose([])).toBeNull();
    expect(largestPose(undefined)).toBeNull();
  });
});

describe('frontSignals', () => {
  it('어깨 너비 기준 비율을 픽셀 단위로 계산한다', () => {
    const s = frontSignals(makePose(upright), W, H);
    expect(s.head_forward).toBeCloseTo((0.1 * W) / (0.3 * W));
    expect(s.neck_len).toBeCloseTo((0.3 * H) / (0.3 * W));
    expect(s.shoulder_tilt).toBeCloseTo(0);
  });

  it('의자를 당겨 앉아 전체가 커져도 비율은 그대로다', () => {
    const base = frontSignals(makePose(upright), W, H);
    const closer = frontSignals(makePose(zoom(upright, 1.3)), W, H);
    expect(closer.head_forward).toBeCloseTo(base.head_forward);
    expect(closer.neck_len).toBeCloseTo(base.neck_len);
  });

  it('머리만 앞으로 나오면 head_forward가 커진다', () => {
    const base = frontSignals(makePose(upright), W, H);
    const forward = frontSignals(makePose({
      ...upright,
      [POSE.L_EAR]: { x: 0.43, y: 0.42 },
      [POSE.R_EAR]: { x: 0.57, y: 0.42 },
    }), W, H);
    expect(forward.head_forward).toBeGreaterThan(base.head_forward);
    expect(forward.neck_len).toBeLessThan(base.neck_len);
  });

  it('어깨가 겹쳐 보이면 null을 돌려준다', () => {
    const pose = makePose({ ...upright, [POSE.R_SHOULDER]: { x: 0.35, y: 0.7 } });
    expect(frontSignals(pose, W, H)).toBeNull();
  });

  it('인식 신뢰도는 양쪽 중 낮은 값이다', () => {
    const pose = makePose({ ...upright, [POSE.R_SHOULDER]: { x: 0.65, y: 0.7, visibility: 0.3 } });
    expect(frontSignals(pose, W, H).shoulder_vis).toBeCloseTo(0.3);
  });
});

describe('pitchFromMatrix', () => {
  const rotX = (deg) => {
    const r = (deg * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    // column-major 4x4
    return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
  };

  it('회전이 없으면 0°', () => {
    expect(pitchFromMatrix(rotX(0))).toBeCloseTo(0);
  });

  it('x축 회전 각도를 그대로 돌려준다', () => {
    expect(pitchFromMatrix(rotX(20))).toBeCloseTo(20);
    expect(pitchFromMatrix(rotX(-15))).toBeCloseTo(-15);
  });
});

describe('angleFromPoints', () => {
  it('귀가 어깨 바로 위면 90°', () => {
    expect(angleFromPoints({ x: 100, y: 0 }, { x: 100, y: 100 })).toBeCloseTo(90);
  });

  it('앞으로 나온 거리와 높이가 같으면 45°', () => {
    expect(angleFromPoints({ x: 200, y: 0 }, { x: 100, y: 100 })).toBeCloseTo(45);
  });

  it('왼쪽을 보든 오른쪽을 보든 같은 각도', () => {
    expect(angleFromPoints({ x: 0, y: 0 }, { x: 100, y: 100 })).toBeCloseTo(45);
  });
});

describe('sideAngle', () => {
  it('더 잘 보이는 쪽의 귀·어깨를 쓴다', () => {
    const pose = makePose({
      [POSE.L_EAR]: { x: 0.5, y: 0.3, visibility: 0.2 },
      [POSE.L_SHOULDER]: { x: 0.5, y: 0.6, visibility: 0.2 },
      [POSE.R_EAR]: { x: 0.6, y: 0.3 },
      [POSE.R_SHOULDER]: { x: 0.5, y: 0.6 },
    });
    const s = sideAngle(pose, W, H);
    expect(s.side).toBe('right');
    const expected = (Math.atan2(0.3 * H, 0.1 * W) * 180) / Math.PI;
    expect(s.angle_deg).toBeCloseTo(expected);
  });
});
