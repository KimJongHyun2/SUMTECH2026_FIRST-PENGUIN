// /setup 카메라 설정 화면: 카메라 켜기, 기준 자세 등록(F1), 권한 실패(F4), 탐지 시작(F3)
import { BaselineCollector, MODEL_VERSION } from '../../core/detector.js';
import { POLICY } from '../../core/policy.js';
import { cameraErrorMessage } from '../camera.js';
import { app, camera, newId, onLive, onView, placeCamera } from '../ctx.js';
import { $, dateTime, show } from '../format.js';
import { startSession } from './watch.js';

let sessionCount = 0;

export function baselineRecord(features, now) {
  return {
    id: newId('b'),
    createdAt: now,
    features: { head_forward: features.head_forward, neck_len: features.neck_len, pitch_deg: features.pitch_deg },
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

/** 연속 안정 5초 기준 등록을 시작한다. 인식이 끊기거나 흔들리면 처음부터 다시 센다. */
export function beginRegistration(messageEl, onSaved) {
  app.registration = {
    collector: new BaselineCollector(),
    onProgress(result) {
      if (result.status === 'collecting') {
        const done = Math.min(POLICY.baselineStableSeconds, Math.floor(result.progress * POLICY.baselineStableSeconds));
        messageEl.textContent = `안정된 자세를 유지해 주세요 (${done}/${POLICY.baselineStableSeconds}초)`;
      } else if (result.status === 'restarted') {
        messageEl.textContent = '얼굴·어깨가 안정적으로 보일 때부터 5초를 다시 셀게요';
      }
    },
    async onDone(features, now) {
      const record = baselineRecord(features, now);
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

$('setup-start').onclick = () => {
  startSession(Date.now());
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
  sessionCount = app.store ? (await app.store.listSessions()).length : 0;
  liveSetup();
}

function liveSetup() {
  if (app.view !== '/setup') return;
  const active = app.session && app.session.state !== 'ended';
  $('setup-state').textContent = app.registration ? '기준 등록 중' : '준비';
  $('setup-camera').textContent = camera.on ? '켜짐' : '꺼짐';
  $('setup-baseline').textContent = baselineText();
  $('setup-sessions').textContent = `${sessionCount}개`;
  $('setup-placement').textContent = placementText();
  $('chk-face').classList.toggle('ok', camera.on && app.frame.faceFound);
  $('chk-shoulder').classList.toggle('ok', camera.on && app.frame.sample?.shoulder_vis >= 0.5);
  $('setup-register').disabled = !camera.on || Boolean(app.registration);
  $('setup-start').disabled = !app.baseline || !camera.on || Boolean(app.registration)
    || app.frame.quality !== 'valid' || active;
}

onView('/setup', renderSetup);
onLive(liveSetup);
