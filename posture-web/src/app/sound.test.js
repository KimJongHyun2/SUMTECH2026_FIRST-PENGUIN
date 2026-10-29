import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 브라우저 AudioContext 대역: 사용자 조작 없이 만들면 suspended로 시작한다(자동 재생 정책).
class FakeAudioContext {
  static created = 0;
  constructor() {
    FakeAudioContext.created += 1;
    this.state = 'suspended';
    this.currentTime = 0;
    this.destination = {};
    this.started = 0;
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createOscillator() {
    const ctx = this;
    return { frequency: {}, connect: (node) => node, start() { ctx.started += 1; }, stop() {} };
  }
  createGain() {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (node) => node };
  }
}

describe('경고 소리 (F5, 다른 화면을 보는 동안의 전달)', () => {
  beforeEach(() => {
    FakeAudioContext.created = 0;
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('사용자 조작 때 소리 장치를 미리 깨워 두고, 한 번만 만든다', async () => {
    const { primeSound, soundState } = await import('./sound.js');
    expect(soundState()).toBe('none');
    primeSound();
    primeSound();
    expect(FakeAudioContext.created).toBe(1);
    expect(soundState()).toBe('running');
  });

  it('경고 때 잠든 소리 장치를 다시 깨우고 두 번 울린다', async () => {
    const { beep, soundState } = await import('./sound.js');
    beep();
    expect(soundState()).toBe('running');
    expect(FakeAudioContext.created).toBe(1);
  });
});
