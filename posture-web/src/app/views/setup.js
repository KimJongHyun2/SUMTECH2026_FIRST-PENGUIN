// /setup 카메라 설정 화면: 카메라 켜기, 기준 자세 등록(F1), 권한 실패(F4), 탐지 시작(F3)
import { BaselineCollector, MODEL_VERSION } from '../../core/detector.js';
import { POLICY } from '../../core/policy.js';
import { cameraErrorMessage } from '../camera.js';
import { app, camera, newId, onLive, onView, placeCamera } from '../ctx.js';
import { $, dateTime, percent, seconds, show } from '../format.js';
import { startSession } from './watch.js';

let saved = { sessions: 0, reports: 0, valid: 0, deviation: 0 };

export function baselineRecord(features, now) {
  return {
    id: newId('b'),
    createdAt: now,
    features: {
      head_forward: features.head_forward,
      neck_len: features.neck_len,
      pitch_deg: features.pitch_deg,
      // 등록 때의 배치: 이후 같은 자리·크기인지 확인하는 데 쓴다.
      shoulder_w: features.shoulder_w,
      center_x: features.center_x,
      center_y: features.center_y,
    },
    camera: { label: camera.label, ...camera.size },
    modelVersion: MODEL_VERSION,
    kind: 'front',
  };
}

/** 카메라를 켠다. 실패하면 오류 문구를 돌려준다. */
export async function turnOnCamera() {
  try {
    await camera.start();
    return null;
  } catch (error) {
    camera.stop();
    return cameraErrorMessage(error);
  }
}

/**
 * 연속 안정 5초 기준 등록을 시작한다. 인식이 끊기거나 흔들리면 처음부터 다시 센다.
 * 딥 모드는 정면·측면을 함께 모으는 collector와 측면 기준을 담는 toRecord를 넘긴다.
 */
export function beginRegistration(messageEl, onSaved, { collector = new BaselineCollector(), toRecord = baselineRecord } = {}) {
  app.registration = {
    collector,
    onProgress(result) {
      if (result.status === 'collecting') {
        const done = Math.min(POLICY.baselineStableSeconds, Math.floor(result.progress * POLICY.baselineStableSeconds));
        messageEl.textContent = `안정된 자세를 유지해 주세요 (${done}/${POLICY.baselineStableSeconds}초)`;
      } else if (result.status === 'paused') {
        messageEl.textContent = '잠깐 가려졌어요. 다시 보이면 이어서 셀게요';
      } else if (result.status === 'restarted') {
        messageEl.textContent = '얼굴·어깨가 안정적으로 보일 때부터 5초를 다시 셀게요';
      }
    },
    async onDone(features, now, result) {
      const record = toRecord(features, now, result);
      try {
        if (!app.store) throw new Error(app.storageError);
        await app.store.addBaseline(record);
        app.baseline = record;
        messageEl.textContent = '기준 자세가 등록됐어요';
        onSaved?.(record, now);
      } catch (error) {
        console.error(error);
        messageEl.textContent = '기준 자세를 저장하지 못했어요. 다시 시도해 주세요.';
      }
    },
  };
  messageEl.textContent = `안정된 자세를 유지해 주세요 (0/${POLICY.baselineStableSeconds}초)`;
}

$('setup-camera-on').onclick = async () => {
  $('setup-camera-on').disabled = true;
  $('setup-msg').textContent = '카메라와 분석 모델을 준비하고 있어요…';
  const error = await turnOnCamera();
  $('setup-camera-on').disabled = false;
  $('setup-msg').textContent = '';
  $('setup-camera-error').textContent = error ?? '';
  show($('setup-camera-error'), Boolean(error));
  placeCamera();
  renderSetup();
};

$('setup-register').onclick = () => {
  beginRegistration($('setup-msg'));
};

// 버튼을 순간 입력 상태로 켰다 껐다 하면 누른 순간 꺼져 동작하지 않을 수 있다.
// 그래서 버튼은 켜 두고, 누른 뒤 유효 입력(얼굴·어깨·같은 배치)이 확인되면 시작한다 (F3).
let startPending = false;

function tryStart() {
  if (app.frame.quality !== 'valid') return false;
  startPending = false;
  startSession(Date.now());
  return true;
}

$('setup-start').onclick = () => {
  if (tryStart()) return;
  startPending = true;
  $('setup-msg').textContent = '얼굴과 양쪽 어깨가 기준과 같은 자리에 보이면 바로 시작해요';
};

function baselineText() {
  if (!app.baseline) return '없음';
  return `ID ${app.baseline.id} · 등록 ${dateTime(app.baseline.createdAt)}`;
}

function placementText() {
  if (!camera.on) return '카메라를 켜서 확인이 필요해요';
  return app.frame.quality === 'valid' ? '확인됨 (얼굴·어깨가 보여요)' : '얼굴과 양쪽 어깨가 보이게 앉아 주세요';
}

async function renderSetup() {
  if (app.storageError) $('setup-msg').textContent = app.storageError;
  const sessions = app.store ? await app.store.listSessions() : [];
  const reports = sessions.flatMap((s) => s.engine.reports);
  saved = {
    sessions: sessions.length,
    reports: reports.length,
    valid: reports.reduce((a, r) => a + r.metrics.validSeconds, 0),
    deviation: reports.reduce((a, r) => a + r.metrics.deviationSeconds, 0),
  };
  liveSetup();
}

/** 유효 감지 기록이 없으면 비율을 0%로 쓰지 않고 계산 불가로 표시한다 (F6). */
function analysisText() {
  if (saved.valid === 0) return '분석 가능한 기록이 없습니다 (이탈 비율 계산 불가)';
  return `유효 ${seconds(saved.valid)} 중 이탈 ${seconds(saved.deviation)} (${percent(saved.deviation / saved.valid)})`;
}

function liveSetup() {
  if (app.view !== '/setup') return;
  const active = app.session && app.session.state !== 'ended';
  $('setup-state').textContent = app.registration ? '기준 등록 중' : '준비';
  $('setup-camera').textContent = camera.on ? '켜짐' : '꺼짐';
  $('setup-baseline').textContent = baselineText();
  $('setup-sessions').textContent = `${saved.sessions}개`;
  $('setup-reports').textContent = `${saved.reports}개`;
  $('setup-analysis').textContent = analysisText();
  $('setup-placement').textContent = placementText();
  $('chk-face').classList.toggle('ok', camera.on && app.frame.faceFound);
  $('chk-shoulder').classList.toggle('ok', camera.on && app.frame.sample?.shoulder_vis >= 0.5);
  $('setup-register').disabled = !camera.on || Boolean(app.registration);
  const canStart = Boolean(app.baseline) && camera.on && !app.registration && !active;
  $('setup-start').disabled = !canStart;
  if (!canStart) startPending = false;
  else if (startPending) tryStart();
}

onView('/setup', renderSetup);
onLive(liveSetup);
