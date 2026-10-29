const escapeCell = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  const s = typeof value === 'number' ? String(Math.round(value * 10000) / 10000) : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(columns, rows) {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => escapeCell(row[c])).join(','));
  return lines.join('\n') + '\n';
}

/** 기록 중일 때만 행을 쌓고, CSV로 내려받는 기록기. */
export function createRecorder(columns) {
  let rows = [];
  let recording = false;

  return {
    get recording() { return recording; },
    get count() { return rows.length; },
    start() { recording = true; },
    stop() { recording = false; },
    clear() { rows = []; },
    push(row) { if (recording) rows.push(row); },
    download(filename) {
      // BOM을 붙여야 엑셀에서 한글 라벨이 깨지지 않는다.
      const blob = new Blob(['﻿' + toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    },
  };
}

export function timestampForFile(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}
