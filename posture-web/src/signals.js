// MediaPipe Pose 랜드마크 번호
export const POSE = { L_EAR: 7, R_EAR: 8, L_SHOULDER: 11, R_SHOULDER: 12 };

const RAD2DEG = 180 / Math.PI;

// 정규화 좌표(0~1)를 픽셀로 바꿔야 가로·세로 비율이 다른 화면에서도 거리가 맞다.
const toPx = (p, w, h) => ({ x: p.x * w, y: p.y * h, v: p.visibility ?? 0 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * T1 정면 신호. 모든 길이를 어깨 너비로 나눠서
 * "의자를 당겨 앉음(전체가 커짐)"과 "머리만 내밂"을 구분한다.
 */
export function frontSignals(pose, w, h) {
  const le = toPx(pose[POSE.L_EAR], w, h);
  const re = toPx(pose[POSE.R_EAR], w, h);
  const ls = toPx(pose[POSE.L_SHOULDER], w, h);
  const rs = toPx(pose[POSE.R_SHOULDER], w, h);
  const shoulderWidth = dist(ls, rs);
  if (shoulderWidth < 1) return null;

  return {
    head_forward: dist(le, re) / shoulderWidth,                          // ① 커지면 머리가 앞으로
    neck_len: ((ls.y + rs.y) / 2 - (le.y + re.y) / 2) / shoulderWidth,   // ② 작아지면 목이 짧아짐
    shoulder_tilt: (ls.y - rs.y) / shoulderWidth,                        // ④ 0에서 멀수록 기울어짐
    ear_vis: Math.min(le.v, re.v),
    shoulder_vis: Math.min(ls.v, rs.v),
    // 배치: 화면 대비 크기·위치. 내 자리의 사람인지(뒤쪽의 다른 사람이 아닌지) 확인하는 데 쓴다.
    shoulder_w: shoulderWidth / w,
    center_x: (ls.x + rs.x) / 2 / w,
    center_y: (ls.y + rs.y) / 2 / h,
  };
}

/** 여러 사람이 잡히면 화면에서 어깨가 가장 넓은(카메라에 가장 가까운) 사람을 고른다. */
export function largestPose(poses) {
  let best = null;
  let bestWidth = -1;
  for (const pose of poses ?? []) {
    const width = Math.abs(pose[POSE.L_SHOULDER].x - pose[POSE.R_SHOULDER].x);
    if (width > bestWidth) {
      best = pose;
      bestWidth = width;
    }
  }
  return best;
}

/**
 * ③ 고개 pitch(도). FaceLandmarker의 facialTransformationMatrixes 값(4x4, column-major)에서
 * x축 회전만 뽑는다. 부호는 좌표계에 따라 반대일 수 있으니 기준 대비 변화량으로 본다.
 */
export function pitchFromMatrix(data) {
  const r12 = data[2 * 4 + 1];
  const r22 = data[2 * 4 + 2];
  return Math.atan2(-r12, r22) * RAD2DEG;
}

/** 수평선과 "어깨 → 귀" 선 사이 각도(도). 귀가 어깨 바로 위면 90°, 앞으로 나올수록 작아진다. */
export function angleFromPoints(ear, shoulder) {
  const dy = shoulder.y - ear.y;
  const dx = Math.abs(ear.x - shoulder.x);
  return Math.atan2(dy, dx) * RAD2DEG;
}

/** T2 옆모습 각도. 카메라에 더 잘 보이는 쪽(왼쪽/오른쪽)의 귀·어깨를 쓴다. */
export function sideAngle(pose, w, h) {
  const left = { side: 'left', ear: toPx(pose[POSE.L_EAR], w, h), sh: toPx(pose[POSE.L_SHOULDER], w, h) };
  const right = { side: 'right', ear: toPx(pose[POSE.R_EAR], w, h), sh: toPx(pose[POSE.R_SHOULDER], w, h) };
  const vis = (s) => Math.min(s.ear.v, s.sh.v);
  const s = vis(left) >= vis(right) ? left : right;

  return {
    angle_deg: angleFromPoints(s.ear, s.sh),
    side: s.side,
    ear_vis: s.ear.v,
    shoulder_vis: s.sh.v,
  };
}
