// 로그인 없이 같은 PC 사이트·브라우저 프로필의 IndexedDB에 기준·설정·세션 기록을 저장한다 (F1·F5·F7·F12).
// 공유 PC의 다른 이용자에게서 보호되지 않고, 브라우저 정리로 사라질 수 있다. 원본 영상·연속 좌표는 저장하지 않는다.
// 보관 기간·자동 만료는 기획에서 미확정이라 자동으로 지우지 않는다.
import { SessionEngine } from './engine.js';

const DB_NAME = 'fast-turtle';
const DB_VERSION = 1;

const promisify = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

function openDb(factory) {
  const request = factory.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    db.createObjectStore('baselines', { keyPath: 'id' });
    db.createObjectStore('settings', { keyPath: 'id' });
    db.createObjectStore('sessions', { keyPath: 'id' });
    db.createObjectStore('meta', { keyPath: 'key' });
  };
  return promisify(request);
}

export async function openStore(factory = globalThis.indexedDB) {
  if (!factory) throw new Error('이 브라우저는 기록 저장을 지원하지 않아요.');
  return new Store(await openDb(factory));
}

class Store {
  constructor(db) {
    this.db = db;
  }

  #tx(stores, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(stores, mode);
      let result;
      Promise.resolve(fn(tx)).then((value) => { result = value; }, reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('저장이 취소됐어요.'));
    });
  }

  #get(store, key) {
    return this.#tx([store], 'readonly', (tx) => promisify(tx.objectStore(store).get(key)));
  }

  #all(store) {
    return this.#tx([store], 'readonly', (tx) => promisify(tx.objectStore(store).getAll()));
  }

  async #meta() {
    return (await this.#get('meta', 'current')) ?? { key: 'current', currentBaselineId: null, currentSettingsId: null };
  }

  async #setMeta(change) {
    const meta = { ...(await this.#meta()), ...change };
    await this.#tx(['meta'], 'readwrite', (tx) => promisify(tx.objectStore('meta').put(meta)));
  }

  // ------------------------------------------------------------ 기준 (불변 스냅샷, 덮어쓰지 않음)

  async addBaseline(baseline) {
    await this.#tx(['baselines'], 'readwrite', (tx) => promisify(tx.objectStore('baselines').add(baseline)));
    await this.#setMeta({ currentBaselineId: baseline.id });
    return baseline;
  }

  getBaseline(id) {
    return this.#get('baselines', id);
  }

  listBaselines() {
    return this.#all('baselines');
  }

  async currentBaseline() {
    const { currentBaselineId } = await this.#meta();
    return currentBaselineId ? this.getBaseline(currentBaselineId) : null;
  }

  // ------------------------------------------------------------ 설정 (적용 시각이 있는 불변 버전)

  async addSettingsVersion(version) {
    await this.#tx(['settings'], 'readwrite', (tx) => promisify(tx.objectStore('settings').add(version)));
    await this.#setMeta({ currentSettingsId: version.id });
    return version;
  }

  getSettingsVersion(id) {
    return this.#get('settings', id);
  }

  listSettingsVersions() {
    return this.#all('settings');
  }

  async currentSettings() {
    const { currentSettingsId } = await this.#meta();
    return currentSettingsId ? this.getSettingsVersion(currentSettingsId) : null;
  }

  // ------------------------------------------------------------ 세션 (원장·리포트를 함께 담는다)

  async saveSession(engine, now) {
    const record = {
      id: engine.id,
      startedAt: engine.startedAt,
      endedAt: engine.endedAt,
      state: engine.state,
      mode: engine.mode,
      lastSavedAt: now,
      engine: JSON.parse(JSON.stringify(engine)),
    };
    await this.#tx(['sessions'], 'readwrite', (tx) => promisify(tx.objectStore('sessions').put(record)));
    return record;
  }

  getSession(id) {
    return this.#get('sessions', id);
  }

  async listSessions() {
    return (await this.#all('sessions')).sort((a, b) => b.startedAt - a.startedAt);
  }

  /**
   * 종료 세션의 원장·리포트·파생 집계를 함께 지운다.
   * 현재 등록 기준과 다른 세션이 참조하는 기준은 보존한다.
   */
  async deleteSession(id) {
    const session = await this.getSession(id);
    if (!session) return false;
    if (session.state !== 'ended') throw new Error('진행 중인 세션은 종료한 뒤 삭제할 수 있어요.');
    const { currentBaselineId } = await this.#meta();
    const others = (await this.listSessions()).filter((s) => s.id !== id);
    const stillUsed = new Set(others.flatMap((s) => s.engine.segments.map((seg) => seg.baselineId)));
    const removable = [...new Set(session.engine.segments.map((seg) => seg.baselineId))]
      .filter((b) => b && b !== currentBaselineId && !stillUsed.has(b));

    await this.#tx(['sessions', 'baselines'], 'readwrite', (tx) => {
      tx.objectStore('sessions').delete(id);
      removable.forEach((b) => tx.objectStore('baselines').delete(b));
    });
    return true;
  }

  /** 전체 삭제. 기준·설정 포함 여부는 확인 화면에서 사용자가 고른다. */
  async deleteAll({ includeBaselineAndSettings = false } = {}) {
    if ((await this.listSessions()).some((s) => s.state !== 'ended')) {
      throw new Error('진행 중인 세션은 종료한 뒤 삭제할 수 있어요.');
    }
    const stores = includeBaselineAndSettings ? ['sessions', 'baselines', 'settings', 'meta'] : ['sessions'];
    await this.#tx(stores, 'readwrite', (tx) => {
      stores.forEach((name) => tx.objectStore(name).clear());
    });
  }

  /** 새로고침 등으로 끝나지 않은 세션은 마지막 저장 구간까지만 중단된 세션으로 마무리한다 (F3). */
  async closeUnfinished() {
    const open = (await this.listSessions()).filter((s) => s.state !== 'ended');
    for (const record of open) {
      const engine = SessionEngine.fromJSON(record.engine);
      engine.end(record.lastSavedAt, 'interrupted');
      await this.saveSession(engine, record.lastSavedAt);
    }
    return open.length;
  }

  close() {
    this.db.close();
  }
}
