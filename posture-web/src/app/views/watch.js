// /watch 감지 화면: 진행·경고·복귀(F2), 일시 정지·재개·종료(F3), 판정 보류(F4), 설정(F5), 기준 재등록(F1)
import { evaluateFrame } from '../../core/detector.js';
import { RECOGNITION_LABELS, SESSION_STATE_LABELS, SessionEngine } from '../../core/engine.js';
import { DEFAULT_SETTINGS, WARNING_TEXT, validateSettings } from '../../core/policy.js';
import { app, camera, navigate, newId, onLive, onView, placeCamera, saveSession } from '../ctx.js';
import { $, clock, dateTime, show } from '../format.js';
import { beginRegistration, turnOnCamera } from './setup.js';

const SAVE_EVERY_MS = 5000;
const PLACEMENT_OK_MS = 1000;
const MODE_LABELS = { basic: '기본', deep: '딥' };

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
  });
  app.session = engine;
  reportReady = false;
  saveStatus = null;
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
      saveSession();
    }
    if (signal.type === 'clear') saveSession();
  }
}

export function sessionTick(now) {
  const session = app.session;
  if (session.state === 'ready' && app.resuming) {
    // 재개: 기준·배치가 유효한 입력을 확인한 뒤 같은 세션의 새 연속 구간을 시작한다.
    if (app.frame.quality === 'valid') {
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
  handle(session.tick(now, evaluateFrame(input, app.baseline?.features)));
  if (now - app.lastSave >= SAVE_EVERY_MS) saveSession(now);
}

// ------------------------------------------------------------ 버튼

$('watch-pause').onclick = () => {
  const now = Date.now();
  handle(app.session.pause(now));
  camera.stop();
  $('watch-msg').textContent = "일시 정지 중이에요. 촬영이 꺼졌어요. '재개'를 누르면 기준·배치를 확인한 뒤 이어서 감지해요";
  placeCamera();
  saveSession(now);
};

$('watch-resume').onclick = async () => {
  const now = Date.now();
  handle(app.session.prepare(now));
  $('watch-msg').textContent = '카메라를 켜고 있어요…';
  const error = camera.on ? null : await turnOnCamera();
  if (error) {
    $('watch-msg').textContent = error;
    return;
  }
  app.resuming = true;
  app.placementSince = null;
  $('watch-msg').textContent = '기준·배치를 확인하고 있어요. 얼굴과 양쪽 어깨가 보이게 앉아 주세요';
  placeCamera();
};

$('watch-settings').onclick = () => {
  const { settings, id, appliedAt } = app.settingsVersion ?? { settings: DEFAULT_SETTINGS };
  $('settings-warning').value = String(settings.warningSeconds);
  $('settings-rewarning').value = String(settings.rewarningSeconds);
  $('settings-warning-error').textContent = '';
  $('settings-rewarning-error').textContent = '';
  $('settings-version').textContent = id ? `현재 설정 버전 ${id} · 적용 ${dateTime(appliedAt)}` : '기본 설정';
  show($('settings-panel'), true);
};

$('settings-close').onclick = () => show($('settings-panel'), false);

$('settings-apply').onclick = async () => {
  const result = validateSettings({ warningSeconds: $('settings-warning').value, rewarningSeconds: $('settings-rewarning').value });
  $('settings-warning-error').textContent = result.errors?.warningSeconds ?? '';
  $('settings-rewarning-error').textContent = result.errors?.rewarningSeconds ?? '';
  // 잘못된 입력은 저장하지 않고 기존 설정·버전·측정 구간을 그대로 둔다.
  if (!result.ok) return;

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
  $('watch-msg').textContent = `설정을 적용했어요 (경고 ${version.settings.warningSeconds}초 · 재경고 ${version.settings.rewarningSeconds}초)`;
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
    if (error) {
      $('rebaseline-msg').textContent = error;
      return;
    }
    placeCamera();
  }
  $('rebaseline-resume').disabled = true;
  beginRegistration($('rebaseline-msg'), (record, now) => {
    handle(app.session.setBaseline(now, record.id));
    $('rebaseline-resume').disabled = false;
    saveSession(now);
  });
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

$('watch-end').onclick = async () => {
  const now = Date.now();
  app.registration = null;
  app.resuming = false;
  handle(app.session.end(now));
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

function renderWatch() {
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
  $('watch-baseline').textContent = session.currentSegment.baselineId;
  $('watch-recognition').textContent = session.state === 'running' ? RECOGNITION_LABELS[session.recognition] : '-';
  $('watch-valid').textContent = clock(session.validMs);
  $('watch-candidate').textContent = session.candidateMs > 0 ? `${Math.floor(session.candidateMs / 1000)}초` : '-';

  const warning = session.warningActive;
  show($('watch-warning'), warning);
  if (warning && !$('watch-warning').textContent) $('watch-warning').textContent = WARNING_TEXT;
  document.title = warning ? '⚠ 자세 확인 · 패스트거북이' : '패스트거북이';
  show($('watch-report-ready'), reportReady && !ended);

  show($('watch-controls'), !ended);
  show($('watch-pause'), session.state === 'running');
  show($('watch-resume'), session.state === 'paused');
  $('watch-rebaseline').disabled = session.state !== 'running' && session.state !== 'paused';

  show($('end-panel'), ended);
  if (ended) {
    $('end-camera').textContent = camera.on ? '켜짐' : '꺼짐';
    $('end-phone').textContent = '-';
    $('end-save').textContent = saveStatus ?? '-';
  }
}

onView('/watch', () => {
  placeCamera();
  renderWatch();
});
onLive(renderWatch);
