// MediaPipe 실행 파일(wasm)을 npm 패키지에서 public/으로 복사한다.
// 실행 중 외부 CDN에 기대지 않고 우리 서버에서 제공하기 위해서다. 복사본은 커밋하지 않는다(.gitignore).
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const to = join(root, 'public', 'mediapipe', 'wasm');

mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log(`MediaPipe wasm 복사: ${to}`);
