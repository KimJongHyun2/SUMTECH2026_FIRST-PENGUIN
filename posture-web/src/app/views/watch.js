// /watch 감지 화면: 진행·경고·복귀(F2), 일시 정지·재개·종료(F3), 판정 보류(F4), 설정(F5), 기준 재등록(F1),
// 딥 모드 통합 판정·장애 복구·기본 모드 전환·휴대폰 촬영 종료 확인(F10)
import { sessionConditions } from '../../core/compare.js';
import { fuseDeep } from '../../core/deep.js';
import { evaluateFrame } from '../../core/detector.js';
import { RECOGNITION_LABELS, SESSION_STATE_LABELS, SessionEngine, phoneStopText } from '../../core/engine.js';
import { DEFAULT_SETTINGS, SENSITIVITY, WARNING_TEXT, sameSettings, validateSettings, withDefaults } from '../../core/policy.js';
import { app, camera, navigate, newId, onLive, onView, placeCamera, recorded, saveSession, sideInput } from '../ctx.js';
import { LINK_STATUS_LABELS, SIDE_QUALITY_LABELS } from '../deep-link.js';
import { $, clock, dateTime, show, warningTitle } from '../format.js';
import { beep } from '../sound.js';
import { beginRegistration, turnOnCamera } from './setup.js';

const SAVE_EVERY_MS = 5000;
const PLACEMENT_OK_MS = 1000;
const MODE_LABELS = { basic: '기본', deep: '딥' };
const RECOVERY_TEXT = "휴대폰 연결이 끊겨 판정을 멈췄어요(복구 대기). 정면 카메라만으로 이어 가려면 '기본 모드로 계속'을 눌러 주세요. 정면 입력이 유효하지 않으면 누를 수 없어요";

const usedDeep = (session) => session.segments.some((seg) => seg.mode === 'deep');

// 다른 화면을 보는 동안 경고가 전달되는 범위를 있는 그대로 알린다.
const DELIVERY_TEXT = {
  soundOn: '다른 탭·IDE·인강 화면을 보는 동안에도 감지는 계속돼요. 그동안에는 이 화면의 경고 문구 대신 탭 제목(⚠ 자세 확인)과 소리로 알려요.',
  soundOff: "다른 탭·IDE·인강 화면을 보는 동안에도 감지는 계속돼요. 그동안에는 탭 제목(⚠ 자세 확인)만 바뀌어요. 다른 화면에서도 알아차리려면 '설정'에서 소리를 켜 주세요.",
};

let reportReady = false;
let saveStatus = null;

async function ensureSettingsVersion(now) {
  if (app.settingsVersion) return app.settingsVersion;
  const version = { id: newId('c'), appliedAt: now, settings: { ...DEFAULT_SETTINGS }, isDefault: true };
  if (app.store) await app.store.addSettingsVersion(version);
  app.settingsVersion = version;
  return version;
}

/** 등록 완료와 유효 입력을 확인한 뒤 세션을 시작한다 (F3). */
export async function startSession(now, mode = 'basic') {
  const version = await ensureSettingsVersion(now);
  const engine = new SessionEngine({
    id: newId('s'),
    startedAt: now,
    mode,
    baselineId: app.baseline.id,
    settingsVersionId: version.id,
    settings: version.settings,
    conditions: sessionConditions({ label: camera.label, ...camera.size }),
  });
  app.session = engine;
  reportReady = false;
  saveStatus = null;
  app.replay = null;
  // 평가 모드: 녹화 입력과 미리 누른 리포트 가속을 테스트 기록으로 남긴다 (docs/prd.md 7절).
  if (recorded) engine.markTest('녹화 정면 입력');
  if (mode === 'deep' && app.mockPhone) engine.markTest('측면 모의 입력');
  if (app.reportAccelPending) {
    engine.accelerateFirstReport(now, app.reportAccelPending);
    app.reportAccelPending = null;
  }
  handle(engine.start(now));
  resetPanels();
  await saveSession(now);
  navigate('/watch');
  return engine;
}

function resetPanels() {
  show($('settings-panel'), false);
  show($('rebaseline-panel'), false);
  show($('end-panel'), false);
  show($('watch-controls'), true);
  $('watch-msg').textContent = '';
  app.resuming = false;
}

/** 엔진 신호 처리. 경고 표시는 renderWatch가 엔진 상태로 맞춘다. */
function handle(signals) {
  for (const signal of signals) {
    if (signal.type === 'report') {
      reportReady = true;
      saveSession();
    }
    if (signal.type === 'warning' || signal.type === 'rewarning') {
      // 재경고도 화면 낭독기가 다시 읽도록 문구를 다시 넣는다.
      $('watch-warning').textContent = '';
      $('watch-warning').textContent = WARNING_TEXT;
      if (withDefaults(app.session.settings).sound) beep();
      saveSession();
    }
    if (signal.type === 'clear') saveSession();
  }
}

/** 딥 모드는 정면과 동기화된 측면 입력이 함께 유효해야 시작·재개한다. */
function inputReady(session, now) {
  if (app.frame.quality !== 'valid') return false;
  return session.mode !== 'deep' || sideInput(now).quality === 'valid';
}

/** 딥 모드 연결이 끊기면 진행·정지·재등록 중 어느 상태든 판정을 멈추고 복구 대기로 간다 (F10). */
function checkDeepLink(session, now) {
  if (session.mode !== 'deep' || app.link?.linked) return false;
  if (session.state === 'ended' || session.state === 'recovering') return false;
  app.registration = null;
  app.resuming = false;
  show($('rebaseline-panel'), false);
  handle(session.enterRecovery(now));
  $('watch-msg').textContent = RECOVERY_TEXT;
  placeCamera();
  saveSession(now);
  return true;
}

/** 종료 때 보낸 휴대폰 촬영 종료 요청의 결과(확인·무응답)를 세션 기록에 옮긴다. */
function syncPhoneStop(session, now) {
  const stop = app.link?.stop;
  if (session.phoneStop?.status !== 'requested' || !stop || stop.status === 'requested') return;
  session.setPhoneStop(now, stop.status, stop.reason);
  saveSession(now).then((ok) => { if (!ok) saveStatus = '저장 실패'; });
}

export function sessionTick(now) {
  const session = app.session;
  syncPhoneStop(session, now);
  if (checkDeepLink(session, now)) return;
  if (session.state === 'ready' && app.resuming) {
    // 재개: 기준·배치가 유효한 입력을 확인한 뒤 같은 세션의 새 연속 구간을 시작한다.
    if (inputReady(session, now)) {
      app.placementSince ??= now;
      if (now - app.placementSince >= PLACEMENT_OK_MS) {
        app.resuming = false;
        handle(session.start(now));
        $('watch-msg').textContent = '기준·배치를 확인했어요. 탐지를 다시 시작했어요';
        placeCamera();
      }
    } else {
      app.placementSince = null;
    }
    return;
  }
  if (session.state !== 'running') return;
  const input = app.frame.quality === 'valid' ? app.frame.smoothed : app.frame.sample;
  const { sensitivity } = withDefaults(session.settings);
  let evaluation = evaluateFrame(input, app.baseline?.features, sensitivity);
  if (session.mode === 'deep') {
    // 유효하고 동기화된 두 입력만 결합한다. 한쪽이라도 무효이면 전체 판정을 보류한다.
    const side = sideInput(now);
    evaluation = fuseDeep(evaluation, side.quality, side.side, app.baseline?.features?.side_angle_deg, sensitivity);
  }
  app.lastEval = evaluation;
  handle(session.tick(now, app.lastEval));
  if (now - app.lastSave >= SAVE_EVERY_MS) saveSession(now);
}

// ------------------------------------------------------------ 버튼

$('watch-pause').onclick = () => {
  const now = Date.now();
  handle(app.session.pause(now));
  camera.stop();
  $('watch-msg').textContent = app.session.mode === 'deep'
    ? "일시 정지 중이에요. PC 카메라가 꺼졌어요. 휴대폰 측면 촬영은 연결 유지를 위해 계속되지만 판정에 쓰지 않아요. '재개'를 누르면 양쪽 기준·배치를 확인한 뒤 이어서 감지해요"
    : "일시 정지 중이에요. 촬영이 꺼졌어요. '재개'를 누르면 기준·배치를 확인한 뒤 이어서 감지해요";
  placeCamera();
  saveSession(now);
};

$('watch-resume').onclick = async () => {
  const now = Date.now();
  handle(app.session.prepare(now));
  $('watch-msg').textContent = '카메라를 켜고 있어요…';
  const error = camera.on ? null : await turnOnCamera();
  if (app.session.state !== 'ready') return;
  if (error) {
    $('watch-msg').textContent = error;
    return;
  }
  app.resuming = true;
  app.placementSince = null;
  $('watch-msg').textContent = '기준·배치를 확인하고 있어요. 얼굴과 양쪽 어깨가 보이게 앉아 주세요';
  placeCamera();
};

const currentSettings = () => withDefaults(app.settingsVersion?.settings ?? DEFAULT_SETTINGS);

$('watch-settings').onclick = () => {
  const { id, appliedAt } = app.settingsVersion ?? {};
  const settings = currentSettings();
  $('settings-warning').value = String(settings.warningSeconds);
  $('settings-rewarning').value = String(settings.rewarningSeconds);
  $('settings-sensitivity').value = settings.sensitivity;
  $('settings-sound').checked = settings.sound;
  $('settings-warning-error').textContent = '';
  $('settings-rewarning-error').textContent = '';
  $('settings-version').textContent = id ? `현재 설정 버전 ${id} · 적용 ${dateTime(appliedAt)}` : '기본 설정';
  show($('settings-panel'), true);
};

$('settings-close').onclick = () => show($('settings-panel'), false);

$('settings-apply').onclick = async () => {
  const result = validateSettings({
    warningSeconds: $('settings-warning').value,
    rewarningSeconds: $('settings-rewarning').value,
    sensitivity: $('settings-sensitivity').value,
    sound: $('settings-sound').checked,
  });
  $('settings-warning-error').textContent = result.errors?.warningSeconds ?? '';
  $('settings-rewarning-error').textContent = result.errors?.rewarningSeconds ?? '';
  // 잘못된 입력은 저장하지 않고 기존 설정·버전·측정 구간을 그대로 둔다.
  if (!result.ok) return;
  // 같은 값 재적용은 오류 해제·화면 닫기만 한다. 새 버전·구간을 만들지 않는다.
  if (sameSettings(result.settings, currentSettings())) {
    show($('settings-panel'), false);
    $('watch-msg').textContent = '바뀐 설정이 없어 기존 설정을 그대로 써요';
    return;
  }

  const now = Date.now();
  const version = { id: newId('c'), appliedAt: now, settings: result.settings };
  try {
    if (app.store) await app.store.addSettingsVersion(version);
  } catch (error) {
    console.error(error);
    $('settings-warning-error').textContent = '설정을 저장하지 못했어요. 다시 시도해 주세요.';
    return;
  }
  app.settingsVersion = version;
  if (app.session && app.session.state !== 'ended') handle(app.session.applySettings(now, version.settings, version.id));
  show($('settings-panel'), false);
  const { warningSeconds, rewarningSeconds, sensitivity, sound } = version.settings;
  $('watch-msg').textContent = `설정을 적용했어요 (경고 ${warningSeconds}초 · 재경고 ${rewarningSeconds}초 · 민감도 ${SENSITIVITY[sensitivity].label} · 소리 ${sound ? '켬' : '끔'})`;
  saveSession(now);
};

$('watch-rebaseline').onclick = () => {
  const now = Date.now();
  handle(app.session.beginRebaseline(now));
  app.resuming = false;
  $('rebaseline-resume').disabled = true;
  $('rebaseline-msg').textContent = "안정된 자세에서 '기준 자세 등록'을 눌러 주세요";
  show($('rebaseline-panel'), true);
  placeCamera();
  saveSession(now);
};

$('rebaseline-register').onclick = async () => {
  if (!camera.on) {
    const error = await turnOnCamera();
    if (app.session.state !== 'ready') return;
    if (error) {
      $('rebaseline-msg').textContent = error;
      return;
    }
    placeCamera();
  }
  $('rebaseline-resume').disabled = true;
  const deep = app.session.mode === 'deep';
  const linkId = app.link?.linkId;
  beginRegistration($('rebaseline-msg'), (record, now) => {
    if (deep) app.deepBaselineLinkId = linkId;
    handle(app.session.setBaseline(now, record.id));
    $('rebaseline-resume').disabled = false;
    saveSession(now);
  }, { deep });
};

// '탐지 재개'도 누른 뒤 새 기준과 같은 배치의 유효 입력이 확인되면 이어서 시작한다(재개와 같은 확인 흐름).
$('rebaseline-resume').onclick = () => {
  show($('rebaseline-panel'), false);
  app.resuming = true;
  app.placementSince = null;
  $('watch-msg').textContent = '기준·배치를 확인하고 있어요. 확인되면 새 기준으로 탐지를 재개해요';
  placeCamera();
};

function openReport() {
  reportReady = false;
  app.reportSessionId = app.session.id;
  app.reportReturn = '/watch';
  navigate('/report');
}

$('watch-report').onclick = openReport;
$('end-report').onclick = openReport;
$('end-history').onclick = () => navigate('/history');

// 딥 모드: 같은 세션에 새 기본 구간을 만들고, 정면 기준·배치를 확인한 뒤 이어서 감지한다 (F10).
// 정면 입력이 유효하지 않으면 버튼을 끈다. 전환 뒤 새 이탈은 새 10초를 요구한다.
$('watch-basic').onclick = async () => {
  const session = app.session;
  if (session?.state !== 'recovering') return;
  if (!camera.on) {
    $('watch-msg').textContent = '카메라를 켜고 있어요…';
    const error = await turnOnCamera();
    if (session.state !== 'recovering') return;
    if (error) {
      $('watch-msg').textContent = error;
      return;
    }
  }
  const now = Date.now();
  handle(session.setMode(now, 'basic'));
  handle(session.prepare(now));
  app.resuming = true;
  app.placementSince = null;
  $('watch-msg').textContent = '정면 기준·배치를 확인하고 있어요. 확인되면 같은 세션에서 기본 모드로 이어서 감지해요';
  placeCamera();
  saveSession(now);
};

/** 딥 모드를 쓴 세션은 종료 때 휴대폰 촬영 종료를 요청한다. 확인 전에는 완료로 남기지 않는다. */
function requestPhoneStop(session, now) {
  if (!usedDeep(session)) return;
  app.link?.requestStop();
  const stop = app.link?.stop ?? { status: 'unconfirmed', reason: 'not_linked' };
  session.setPhoneStop(now, stop.status, stop.reason);
}

$('watch-end').onclick = async () => {
  const now = Date.now();
  app.registration = null;
  app.resuming = false;
  handle(app.session.end(now));
  requestPhoneStop(app.session, now);
  camera.stop();
  show($('settings-panel'), false);
  show($('rebaseline-panel'), false);
  placeCamera();
  saveStatus = '저장 중…';
  renderWatch();
  saveStatus = (await saveSession(now)) ? '저장 완료' : '저장 실패';
  renderWatch();
};

// ------------------------------------------------------------ 표시

/** 유형을 판별할 수 있을 때만 '머리가 기준보다 앞으로 나왔어요'를 쓰고, 입력이 무효이면 자세를 추정하지 않는다. */
function postureText(session) {
  if (session.state !== 'running' || !app.lastEval) return '-';
  if (session.recognition !== 'valid') return '판정 보류';
  if (!app.lastEval.deviated) return '기준 범위예요';
  const forward = app.lastEval.types.includes('head_forward') || app.lastEval.types.includes('side_angle');
  return forward ? '머리가 기준보다 앞으로 나왔어요' : '기준에서 벗어났어요';
}

function phoneText(session, now) {
  if (!usedDeep(session)) return '-';
  if (session.state === 'ended') return phoneStopText(session.phoneStop, session.testMarks) ?? '-';
  if (session.mode !== 'deep') return '사용 안 함 (기본 모드로 전환)';
  if (!app.link?.linked) return LINK_STATUS_LABELS[app.link?.status ?? 'idle'];
  return `연결됨 · 측면 ${SIDE_QUALITY_LABELS[sideInput(now).quality]}`;
}

function renderWatch(now = Date.now()) {
  if (app.view !== '/watch') return;
  const session = app.session;
  if (!session) {
    show($('watch-controls'), false);
    show($('end-panel'), false);
    $('watch-msg').textContent = '진행 중인 세션이 없어요. 첫 화면에서 시작해 주세요.';
    return;
  }
  const ended = session.state === 'ended';
  $('watch-session').textContent = session.id;
  $('watch-state').textContent = SESSION_STATE_LABELS[session.state];
  $('watch-mode').textContent = MODE_LABELS[session.mode];
  $('watch-phone').textContent = phoneText(session, now);
  $('watch-delivery').textContent = withDefaults(session.settings).sound ? DELIVERY_TEXT.soundOn : DELIVERY_TEXT.soundOff;
  $('watch-baseline').textContent = session.currentSegment.baselineId;
  const applied = withDefaults(session.settings);
  $('watch-settings-version').textContent =
    `${session.currentSegment.settingsVersionId} · 경고 ${applied.warningSeconds}초 · 재경고 ${applied.rewarningSeconds}초`;
  $('watch-recognition').textContent = session.state === 'running' ? RECOGNITION_LABELS[session.recognition] : '-';
  $('watch-posture').textContent = postureText(session);
  $('watch-valid').textContent = clock(session.validMs);
  $('watch-candidate').textContent = session.candidateMs > 0 ? `${Math.floor(session.candidateMs / 1000)}초` : '-';
  const cycle = (session.nextBoundary - session.windowStart) / 1000;
  const accelerated = session.reportAccel && !session.reportAccel.released;
  $('watch-next-report').textContent = ended ? '-'
    : `유효 ${clock(session.nextBoundary)} (주기 ${cycle}초${accelerated ? ' · 테스트 가속' : ''})`;

  const warning = session.warningActive;
  show($('watch-warning'), warning);
  if (warning && !$('watch-warning').textContent) $('watch-warning').textContent = WARNING_TEXT;
  show($('watch-report-ready'), reportReady && !ended);

  show($('watch-controls'), !ended);
  show($('watch-pause'), session.state === 'running');
  show($('watch-resume'), session.state === 'paused');
  $('watch-rebaseline').disabled = session.state !== 'running' && session.state !== 'paused';
  show($('watch-basic'), session.state === 'recovering');
  $('watch-basic').disabled = camera.on && app.frame.quality !== 'valid';

  show($('end-panel'), ended);
  if (ended) {
    $('end-camera').textContent = camera.on ? '켜짐' : '꺼짐';
    $('end-phone').textContent = phoneStopText(session.phoneStop, session.testMarks) ?? '사용 안 함';
    $('end-save').textContent = saveStatus ?? '-';
  }
}

onView('/watch', () => {
  placeCamera();
  renderWatch();
});
onLive(renderWatch);

// 탭 제목은 어느 화면(리포트·기록 등)을 보고 있든, 탭이 가려져 있든 측정 tick마다 맞춘다.
// 측정 tick은 워커 타이머라 다른 탭·IDE를 보는 동안에도 늦춰지지 않는다.
onLive((now) => {
  const warning = Boolean(app.session?.warningActive);
  document.title = warningTitle({ warning, hidden: document.hidden, now });
});
