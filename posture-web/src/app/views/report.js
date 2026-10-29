// /report 리포트 화면: 자동·종료 리포트(F6), 판정 보류·중단 기록(F4·F10)
import { SESSION_STATE_LABELS } from '../../core/engine.js';
import { END_REASON_LABELS, HOLD_REASON_LABELS } from '../../core/report.js';
import { app, navigate, onView } from '../ctx.js';
import { $, clock, dateTime, percent, renderFacts, seconds } from '../format.js';

const STOP_LABELS = {
  paused: '일시 정지',
  settings_change: '설정 변경',
  baseline_change: '기준 변경',
  mode_change: '모드 변경',
  disconnected: '연결 장애',
};
const MODE_LABELS = { basic: '기본 모드', deep: '딥 모드' };

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function countBy(items, key) {
  const counts = {};
  for (const item of items) counts[item[key]] = (counts[item[key]] ?? 0) + 1;
  return counts;
}

function reportTitle(report) {
  const range = `유효 ${clock(report.startValid)}–${clock(report.endValid)}`;
  if (report.kind === 'auto') return `자동 리포트 ${report.index + 1} (${range})`;
  if (report.kind === 'final') return `종료 리포트 (${range})`;
  return '종료 리포트';
}

function reportCard(report) {
  const m = report.metrics;
  const card = el('article', 'report-card');
  card.dataset.kind = report.kind;
  card.append(el('h3', null, reportTitle(report)));

  const badges = [];
  if (m.provisional) badges.push('일부 자세 구간 확인 중');
  if (report.revision > 1) badges.push(`개정 ${report.revision} · ${dateTime(report.updatedAt)} 갱신`);
  if (badges.length) card.append(el('p', 'badge', badges.join(' · ')));

  if (m.validSeconds === 0) {
    card.append(el('p', 'empty', '분석 가능한 기록이 없습니다'));
  }

  const holds = Object.entries(countBy(m.holds, 'reason'))
    .map(([reason, n]) => `${HOLD_REASON_LABELS[reason] ?? reason} ${n}회`).join(', ') || '없음';
  const facts = el('dl', 'facts');
  renderFacts(facts, [
    ['유효 감지 시간', seconds(m.validSeconds)],
    ['이탈 시간', seconds(m.deviationSeconds)],
    ['이탈 비율', percent(m.ratio)],
    ['확정 이탈', `${m.newEvents}회`],
    ['이어진 이탈', `${m.continuedEvents}회`],
    ['최초 경고', `${m.firstWarnings}회`],
    ['재경고', `${m.rewarnings}회`],
    ['정상 복귀', `${m.normalReturns}회`],
    ['중단으로 닫힌 이탈', `${m.interruptions}회`],
    ['판정 보류', holds],
  ]);
  card.append(facts);

  if (m.events.length) {
    const list = el('ul', 'event-list');
    for (const e of m.events) {
      const end = e.endValid === null ? '진행 중' : `${clock(e.endValid)} · ${END_REASON_LABELS[e.endReason] ?? e.endReason}`;
      list.append(el('li', null, `이탈 ${clock(e.onsetValid)}–${end}`));
    }
    card.append(list);
  }
  return card;
}

function sessionSection(engine) {
  const box = el('div', 'session-log');
  box.append(el('h3', null, '세션 기록'));
  const segments = el('ul', 'event-list');
  engine.segments.forEach((seg, i) => {
    const changed = i === 0 ? '시작' : '변경';
    segments.append(el('li', null, `${MODE_LABELS[seg.mode]} · ${dateTime(seg.at)} ${changed} · 기준 ${seg.baselineId} · 설정 ${seg.settingsVersionId}`));
  });
  box.append(el('p', 'muted small', '모드·기준·설정 구간'), segments);

  const stops = engine.stops ?? [];
  const stopText = Object.entries(countBy(stops, 'reason'))
    .map(([reason, n]) => `${STOP_LABELS[reason] ?? reason} ${n}회`).join(', ') || '없음';
  box.append(el('p', null, `중단 기록: ${stopText}`));
  return box;
}

async function loadEngine(id) {
  if (app.session?.id === id) return app.session;
  const record = app.store ? await app.store.getSession(id) : null;
  return record?.engine ?? null;
}

async function renderReport() {
  const engine = app.reportSessionId ? await loadEngine(app.reportSessionId) : null;
  const list = $('report-list');
  const sessionBox = $('report-session');
  if (!engine) {
    $('report-summary').textContent = '보여줄 리포트가 없어요.';
    list.replaceChildren();
    sessionBox.replaceChildren();
    return;
  }
  const auto = engine.reports.filter((r) => r.kind === 'auto').length;
  const final = engine.reports.length - auto;
  $('report-summary').textContent =
    `세션 ID ${engine.id} · 상태 ${SESSION_STATE_LABELS[engine.state]} · 자동 리포트 ${auto}개 · 종료 리포트 ${final}개`;
  list.replaceChildren(...(engine.reports.length
    ? engine.reports.map(reportCard)
    : [el('p', 'empty', '아직 만들어진 리포트가 없어요. 유효 감지 30분마다 또는 세션을 종료하면 만들어져요.')]));
  sessionBox.replaceChildren(sessionSection(engine));
}

$('report-close').onclick = () => navigate(app.reportReturn ?? '/');
$('report-history').onclick = () => navigate('/history');

onView('/report', renderReport);
