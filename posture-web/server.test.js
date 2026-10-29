import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAppServer } from './server.js';

let dir;
let server;
let base;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dist-'));
  writeFileSync(join(dir, 'index.html'), '<h1>index</h1>');
  writeFileSync(join(dir, '404.html'), '<h1>not found</h1>');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
  mkdirSync(join(dir, 'mediapipe'));
  writeFileSync(join(dir, 'mediapipe', 'x.wasm'), 'wasm');
  server = createAppServer({ distDir: dir, releaseId: 'abc123' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

describe('server', () => {
  it('/__health는 releaseId JSON을 캐시 없이 200으로 준다', async () => {
    const res = await fetch(`${base}/__health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ releaseId: 'abc123' });
  });

  it.each(['/', '/setup', '/watch', '/connect', '/report', '/history', '/phone'])('%s는 서비스 화면', async (path) => {
    const res = await fetch(`${base}${path}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<h1>index</h1>');
  });

  it('정적 파일은 형식에 맞는 Content-Type으로 준다', async () => {
    const js = await fetch(`${base}/assets/app.js`);
    expect(js.headers.get('content-type')).toContain('text/javascript');
    const wasm = await fetch(`${base}/mediapipe/x.wasm`);
    expect(wasm.headers.get('content-type')).toBe('application/wasm');
  });

  it('없는 주소는 404 페이지', async () => {
    const res = await fetch(`${base}/no-such-page`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('<h1>not found</h1>');
  });

  it('dist 밖의 파일은 주지 않는다', async () => {
    const res = await fetch(`${base}/%2e%2e/package.json`);
    expect(res.status).toBe(404);
  });

  it('GET·HEAD 외에는 405', async () => {
    const res = await fetch(`${base}/__health`, { method: 'POST' });
    expect(res.status).toBe(405);
  });
});
