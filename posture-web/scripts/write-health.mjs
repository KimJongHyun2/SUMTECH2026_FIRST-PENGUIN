// 정적 배포(Vercel)용 /__health 응답 파일. 빌드할 때 주입된 실제 commit을 releaseId로 쓴다.
// docker 실행은 server.js가 RELEASE_ID 환경변수로 직접 응답한다.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const releaseId = process.env.RELEASE_ID || process.env.VERCEL_GIT_COMMIT_SHA || 'dev';
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'health.json');

writeFileSync(out, JSON.stringify({ releaseId }));
console.log(`health.json releaseId=${releaseId}`);
