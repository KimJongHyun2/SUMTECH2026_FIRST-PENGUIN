// 기록은 posture-web core의 IndexedDB 저장소(store.js)에 둔다. 화면은 메모리 사본(StoredData)을 읽는다.
import { openStore } from "../../../../posture-web/src/core/store.js";
import { compareSessions } from "../../../../posture-web/src/core/compare.js";
import { DEFAULT_SETTINGS, withDefaults } from "../../lib/policy";
import type {
  Baseline,
  Settings,
  StoredData,
  SessionRecord,
} from "../../lib/types";
export interface SettingsVersion {
  id: string;
  appliedAt: number;
  settings: Settings;
}
export interface RecordStore {
  addBaseline(baseline: Baseline): Promise<Baseline>;
  currentBaseline(): Promise<Baseline | null>;
  addSettingsVersion(version: SettingsVersion): Promise<SettingsVersion>;
  currentSettings(): Promise<SettingsVersion | null>;
  saveSession(engine: unknown, now: number): Promise<unknown>;
  listSessions(): Promise<{ engine: SessionRecord }[]>;
  deleteSession(id: string): Promise<boolean>;
  closeUnfinished(): Promise<number>;
}
export const freshData = (): StoredData => ({
  settings: { ...DEFAULT_SETTINGS },
  settingsId: "default",
  baseline: null,
  sessions: [],
});
/** 새로고침 등으로 끝나지 않은 세션은 마지막 저장 구간까지만 중단 세션으로 마무리한 뒤 읽는다. */
export async function loadData(factory: IDBFactory = indexedDB) {
  const store = (await openStore(factory)) as RecordStore;
  await store.closeUnfinished();
  const [baseline, version, sessions] = await Promise.all([
    store.currentBaseline(),
    store.currentSettings(),
    store.listSessions(),
  ]);
  const data: StoredData = {
    settings: withDefaults(version?.settings ?? {}),
    settingsId: version?.id ?? "default",
    baseline: baseline ?? null,
    sessions: sessions
      .map((s) => s.engine)
      .sort((a, b) => a.startedAt - b.startedAt),
  };
  return { store, data };
}
/** 모드·기준·설정이 같고 세션 중 변경이 없는 기록끼리만 비교한다(core compare.js). */
export function compareRecords(
  current: SessionRecord,
  previous?: SessionRecord,
) {
  const result = compareSessions(
    { engine: current },
    previous && { engine: previous },
  ) as { comparable: boolean; message?: string; ratioChange?: number };
  if (!result.comparable) return result.message!;
  const difference = result.ratioChange! * 100;
  return difference === 0
    ? "이전 기록과 이탈 비율이 같아요."
    : `이전 기록보다 이탈 비율이 ${Math.abs(difference).toFixed(1)}%p ${difference > 0 ? "늘었어요" : "줄었어요"}.`;
}
