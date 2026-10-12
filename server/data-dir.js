import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { queueGithubSave } from './github-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let logged = false;

export function dataDir() {
  const fromEnv = String(process.env.DATA_DIR || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(__dirname, '..', 'data');
}

export function dataFile(name) {
  return path.join(dataDir(), name);
}

export function ensureDataDir() {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  if (!logged) {
    console.log(`Desk data folder: ${dir}`);
    logged = true;
  }
  return dir;
}

export function readJsonArray(file) {
  ensureDataDir();
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeJson(file, value) {
  ensureDataDir();
  const text = JSON.stringify(value, null, 2) + '\n';
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
  queueGithubSave(path.basename(file), text);
}
