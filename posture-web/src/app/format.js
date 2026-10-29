export const $ = (id) => document.getElementById(id);

export function clock(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const dateTime = (t) => new Date(t).toLocaleString('ko-KR', {
  year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

export const seconds = (s) => `${Math.round(s)}초`;

export const percent = (ratio) => (ratio === null ? '계산 불가' : `${Math.round(ratio * 100)}%`);

export function show(el, visible) {
  el.hidden = !visible;
}

/** 배열을 dl 항목(<div><dt>…</dt><dd>…</dd></div>)으로 그린다. 값은 textContent로 넣는다. */
export function renderFacts(dl, pairs) {
  dl.replaceChildren(...pairs.map(([label, value]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    row.append(dt, dd);
    return row;
  }));
}
