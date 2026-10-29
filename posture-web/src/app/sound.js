// 경고 소리 (F5 '소리' 설정). 짧은 두 번의 알림음만 내고 음성·파일은 쓰지 않는다.
let audio = null;

export function beep() {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    for (const offset of [0, 0.25]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.2);
      osc.connect(gain).connect(audio.destination);
      osc.start(t + offset);
      osc.stop(t + offset + 0.2);
    }
  } catch (error) {
    console.error(error);
  }
}
