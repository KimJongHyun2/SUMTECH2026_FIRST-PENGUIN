// 경고 소리 (F5 '소리' 설정). 짧은 두 번의 알림음만 내고 음성·파일은 쓰지 않는다.
// 브라우저는 사용자 조작 없이 만든 소리 장치를 잠근 채(suspended) 시작할 수 있다. 다른 탭·IDE를 보는 동안의
// 첫 경고가 무음이 되지 않도록, 사용자가 화면을 누를 때 미리 만들어 깨워 둔다(primeSound).
let audio = null;

function context() {
  audio ??= new AudioContext();
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  return audio;
}

/** 사용자 조작(클릭·키 입력) 때 부른다. 소리는 내지 않는다. */
export function primeSound() {
  try {
    context();
  } catch (error) {
    console.error(error);
  }
}

/** 'none'(아직 없음) | 'suspended' | 'running' | 'closed' */
export const soundState = () => audio?.state ?? 'none';

export function beep() {
  try {
    const ctx = context();
    const t = ctx.currentTime;
    for (const offset of [0, 0.25]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + offset);
      osc.stop(t + offset + 0.2);
    }
  } catch (error) {
    console.error(error);
  }
}
