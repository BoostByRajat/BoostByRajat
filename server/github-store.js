import fs from 'fs';
import { dataFile, ensureDataDir } from './data-dir.js';

const FILES = ['invoices.json', 'clients.json', 'leads.json', 'admins.json'];
const shas = new Map();
let tail = Promise.resolve();

function token() {
  return String(process.env.GITHUB_DATA_TOKEN || '').trim();
}

function repo() {
  return String(process.env.GITHUB_DATA_REPO || 'BoostByRajat/bbr-desk-data').trim();
}

export function githubStoreOn() {
  return Boolean(token());
}

async function gh(path, { method = 'GET', body } = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'BoostByRajat',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `GitHub ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function readRemote(name) {
  const data = await gh(`/repos/${repo()}/contents/${encodeURIComponent(name)}?ref=main`);
  const text = Buffer.from(String(data.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
  return { text, sha: data.sha };
}

async function pushFile(name, text) {
  const content = Buffer.from(text, 'utf8').toString('base64');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let sha = shas.get(name) || '';
    if (!sha) {
      try {
        const cur = await readRemote(name);
        sha = cur.sha;
        shas.set(name, sha);
      } catch (err) {
        if (err.status !== 404) throw err;
      }
    }
    try {
      const saved = await gh(`/repos/${repo()}/contents/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: {
          message: `Save ${name}`,
          content,
          branch: 'main',
          ...(sha ? { sha } : {}),
        },
      });
      shas.set(name, saved.content?.sha || sha);
      return;
    } catch (err) {
      shas.delete(name);
      if ((err.status === 409 || err.status === 422) && attempt === 0) continue;
      throw err;
    }
  }
}

export function queueGithubSave(name, text) {
  if (!githubStoreOn() || !FILES.includes(name)) return;
  tail = tail.then(() => pushFile(name, text), () => pushFile(name, text));
}

export function flushStore() {
  const job = tail;
  return job.then(() => {}, (err) => {
    tail = Promise.resolve();
    throw err;
  });
}

export async function pullDeskData() {
  if (!githubStoreOn()) {
    console.log('GitHub desk store is off. Bills vanish on deploy until GITHUB_DATA_TOKEN is set.');
    return;
  }
  ensureDataDir();
  for (const name of FILES) {
    const local = dataFile(name);
    try {
      const remote = await readRemote(name);
      fs.writeFileSync(local, remote.text.endsWith('\n') ? remote.text : `${remote.text}\n`, 'utf8');
      shas.set(name, remote.sha);
    } catch (err) {
      if (err.status !== 404) {
        console.error('GitHub desk load failed', name, err.message);
        continue;
      }
      if (fs.existsSync(local)) {
        try {
          await pushFile(name, fs.readFileSync(local, 'utf8'));
        } catch (pushErr) {
          console.error('GitHub desk first save failed', name, pushErr.message);
        }
      }
    }
  }
  console.log(`Desk bills load from GitHub ${repo()}`);
}
