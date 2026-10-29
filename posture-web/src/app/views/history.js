// /history 내 기록: 같은 PC 브라우저의 기록 조회·조건부 비교·삭제 (F7·F12)
import { compareSessions } from '../../core/compare.js';
import { SESSION_STATE_LABELS } from '../../core/engine.js';
import { app, navigate, onView } from '../ctx.js';
import { $, dateTime, percent, renderFacts, seconds, show } from '../format.js';

let sessions = [];
let selected = null;
let confirmMode = null; // 'one' | 'all'

const sum = (reports, key) => reports.reduce((a, r) => a + r.metrics[key], 0);

async function load() {
  sessions = app.store ? await app.store.listSessions() : [];
}

function renderList() {
  const reportCount = sessions.reduce((a, s) => a + s.engine.reports.length, 0);
  $('history-counts').textContent = `저장된 세션 ${sessions.length}개 · 리포트 ${reportCount}개`;
  $('history-baseline').textContent = app.baseline
    ? `현재 등록 기준: ID ${app.baseline.id} · 등록 ${dateTime(app.baseline.createdAt)}`
    : '현재 등록 기준이 없어요';
  show($('history-empty'), sessions.length === 0);
  $('history-list').replaceChildren(...sessions.map((s) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.className = 'btn session-item';
    button.textContent = `${dateTime(s.startedAt)} 세션 · ${SESSION_STATE_LABELS[s.state]} · 리포트 ${s.engine.reports.length}개`;
    button.onclick = () => selectSession(s.id);
    li.append(button);
    return li;
  }));
}

function selectSession(id) {
  selected = sessions.find((s) => s.id === id) ?? null;
  confirmMode = null;
  show($('history-confirm'), false);
  $('history-compare-result').textContent = '';
  show($('history-detail'), Boolean(selected));
  if (!selected) return;
  const reports = selected.engine.reports;
  const auto = reports.filter((r) => r.kind === 'auto').length;
  const body = document.createElement('dl');
  body.className = 'facts';
  renderFacts(body, [
    ['세션 ID', selected.id],
    ['시작', dateTime(selected.startedAt)],
    ['종료', selected.endedAt ? dateTime(selected.endedAt) : '-'],
    ['상태', SESSION_STATE_LABELS[selected.state]],
    ['리포트', `자동 ${auto}개 · 종료 ${reports.length - auto}개`],
    ['유효 감지 시간', seconds(sum(reports, 'validSeconds'))],
    ['확정 이탈', `${sum(reports, 'newEvents')}회`],
    ['최초 경고', `${sum(reports, 'firstWarnings')}회`],
    ['재경고', `${sum(reports, 'rewarnings')}회`],
    ['정상 복귀', `${sum(reports, 'normalReturns')}회`],
  ]);
  $('history-detail-body').replaceChildren(body);
  $('history-delete').disabled = selected.state !== 'ended';
}

$('history-report').onclick = () => {
  app.reportSessionId = selected.id;
  app.reportReturn = '/history';
  navigate('/report');
};

$('history-compare').onclick = () => {
  const index = sessions.findIndex((s) => s.id === selected.id);
  const result = compareSessions(selected, sessions[index + 1] ?? null);
  $('history-compare-result').textContent = result.comparable
    ? `이전 기록 이탈 비율 ${percent(result.previous.ratio)} → 이번 ${percent(result.current.ratio)} (같은 모드·기준·설정)`
    : result.message;
};

function openConfirm(mode) {
  confirmMode = mode;
  $('history-confirm-text').textContent = mode === 'one'
    ? '이 세션의 기록·리포트를 삭제할까요? 현재 등록 기준과 다른 기록이 쓰는 기준은 남겨요.'
    : '저장된 모든 세션 기록·리포트를 삭제할까요?';
  $('history-confirm-include').checked = false;
  show($('history-confirm-all-option'), mode === 'all');
  show($('history-confirm'), true);
}

$('history-delete').onclick = () => openConfirm('one');
$('history-delete-all').onclick = () => openConfirm('all');
$('history-confirm-cancel').onclick = () => show($('history-confirm'), false);

$('history-confirm-ok').onclick = async () => {
  show($('history-error'), false);
  try {
    if (confirmMode === 'one') {
      await app.store.deleteSession(selected.id);
      if (app.session?.id === selected.id) app.session = null;
    } else {
      const includeBaselineAndSettings = $('history-confirm-include').checked;
      await app.store.deleteAll({ includeBaselineAndSettings });
      if (app.session?.state === 'ended') app.session = null;
      if (includeBaselineAndSettings) {
        app.baseline = null;
        app.settingsVersion = null;
      }
    }
  } catch (error) {
    $('history-error').textContent = error.message;
    show($('history-error'), true);
    return;
  }
  selected = null;
  show($('history-confirm'), false);
  show($('history-detail'), false);
  await load();
  renderList();
};

onView('/history', async () => {
  selected = null;
  show($('history-detail'), false);
  show($('history-confirm'), false);
  show($('history-error'), false);
  if (app.storageError) {
    $('history-error').textContent = app.storageError;
    show($('history-error'), true);
  }
  await load();
  renderList();
});
