// Usage: GIFUTO_BASE=https://your-domain npm run spec:update
// Downloads the live OpenAPI document into spec/openapi.json (checked by tests/contract.test.ts).
import { writeFile, mkdir } from 'node:fs/promises';

const base = (process.env.GIFUTO_BASE ?? 'https://gifuto.vercel.app').replace(/\/+$/, '');
const res = await fetch(`${base}/api/v1/openapi.json`);
if (!res.ok) throw new Error(`HTTP ${res.status}`);
await mkdir('spec', { recursive: true });
await writeFile('spec/openapi.json', JSON.stringify(await res.json(), null, 2) + '\n');
console.log('spec/openapi.json updated');
