// 화면들이 함께 쓰는 상태·라우터·카메라·저장. 화면 전환 중에도 카메라와 세션이 끊기지 않도록 한 페이지 안에서 주소만 바꾼다.
import { APP_ROUTES } from '../../shared/routes.js';
import { FrontCamera } from './camera.js';
import { PcLink } from './deep-link.js';
import { RecordedInput, evalActive } from './eval.js';
import { $ } from './format.js';

export const EVAL = evalActive();

export const app = {
  view: '/',
  store: null,
  storageError: null,
  baseline: null,          // 현재 등록 기준 (불변 스냅샷)
  settingsVersion: null,   // 현재 설정 버전
  session: null,           // 진행 중이거나 방금 끝난 SessionEngine
  registration: null,      // { collector, onProgress, onDone } 기준 등록 중일 때
  recent: [],              // 최근 유효 프레임 (판정 평균용)
  frame: { quality: 'away', faceFound: false },
  resuming: false,         // 재개 후 기준·배치 확인 중
  placementSince: null,
  lastSave: 0,
  reportSessionId: null,
  reportReturn: '/',
  saveChain: Promise.resolve(true),
  replay: null,            // 평가 모드의 녹화 입력 연속 재생
  reportAccelPending: null, // 탐지 시작 전에 누른 '[테스트용] 리포트 3초 가속'
  link: null,              // 딥 모드 PC 연결(PcLink). 화면을 옮겨도 연결을 유지한다
  deepBaselineLinkId: null, // 양쪽 기준을 등록한 연결 ID. 다른 연결(다른 측면 배치)로는 딥 탐지를 시작하지 않는다
  mockPhone: null,         // 평가 모드의 측면 모의 입력
};

export const recorded = EVAL ? new RecordedInput() : null;
export const camera = new FrontCamera($('video'), $('preview'), recorded);

const renderers = {};
const liveRenderers = [];
const routeHooks = [];

export const onView = (path, render) => { renderers[path] = render; };
export const onLive = (render) => { liveRenderers.push(render); };
/** 화면이 바뀔 때마다 (화면 사이를 옮겨 다니는 공용 요소 배치용) */
export const onRoute = (hook) => { routeHooks.push(hook); };

/** 딥 모드 PC 연결. 없거나 끊겼으면 새로 연결 서버에 접속한다. */
export function pcLink() {
  app.link ??= new PcLink();
  if (app.link.status === 'idle' || app.link.status === 'offline') app.link.open();
  return app.link;
}

/** 정면 입력 시각(now)에 결합할 측면 입력. 연결이 없으면 측면 입력 지연(무효)이다. */
export const sideInput = (now) => app.link?.sideInput(now) ?? { quality: 'side_stale', side: null };

export function route(path) {
  app.view = path === '/' || APP_ROUTES.includes(path) ? path : '/';
  document.body.classList.toggle('phone-view', app.view === '/phone');
  document.querySelectorAll('[data-view]').forEach((section) => {
    section.hidden = section.dataset.view !== app.view;
  });
  placeCamera();
  routeHooks.forEach((hook) => hook());
  renderers[app.view]?.();
}

export function navigate(path) {
  if (location.pathname !== path) history.pushState(null, '', path);
  route(path);
  window.scrollTo(0, 0);
}

export function renderLive(now) {
  liveRenderers.forEach((render) => render(now));
}

/** 카메라 미리보기는 설정·딥 연결 화면, 그리고 감지 화면의 재등록·재개 확인 중에만 보인다. */
export function placeCamera() {
  const box = $('cam-box');
  let slot = null;
  if (camera.on && app.view === '/setup') slot = $('setup-cam');
  if (camera.on && app.view === '/connect') slot = $('connect-cam');
  if (camera.on && app.view === '/watch' && (!$('rebaseline-panel').hidden || app.resuming)) slot = $('watch-cam');
  if (slot) slot.append(box);
  box.hidden = !slot;
}

/** 저장은 순서대로 한다. 실패하면 false (완료로 표시하지 않는다). */
export function saveSession(now = Date.now()) {
  const session = app.session;
  app.saveChain = app.saveChain.then(async () => {
    if (!app.store || !session) return false;
    try {
      await app.store.saveSession(session, now);
      app.lastSave = now;
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  });
  return app.saveChain;
}

export function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
