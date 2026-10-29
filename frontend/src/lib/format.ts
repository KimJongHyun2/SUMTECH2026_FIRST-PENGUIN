export const duration = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, "0")}`;
export const dateTime = (time: number) =>
  new Date(time).toLocaleString("ko-KR");
export const percentage = (ratio: number | null) =>
  ratio === null ? "—" : `${(ratio * 100).toFixed(1)}%`;
