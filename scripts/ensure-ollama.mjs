#!/usr/bin/env node

/**
 * Ensures Ollama is running and the embedding model is available.
 * Runs before `next dev` — transparent if everything is already up.
 */

import { execSync, spawn } from 'child_process';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const MODEL = 'nomic-embed-text:v1.5';

function isOllamaInstalled() {
  try {
    execSync('which ollama', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function isOllamaServing() {
  try {
    const res = await fetch(OLLAMA_URL, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForOllama(maxWaitMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await isOllamaServing()) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function isModelAvailable() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.models?.some(m => m.name === MODEL || m.name === `${MODEL}:latest` || m.name.startsWith('nomic-embed-text'));
  } catch {
    return false;
  }
}

async function main() {
  // 1. Check if ollama CLI is installed
  if (!isOllamaInstalled()) {
    console.error(`
╔══════════════════════════════════════════════════════════╗
║  Ollama is required but not installed.                   ║
║                                                          ║
║  Install it from: https://ollama.com/download            ║
║                                                          ║
║  macOS:   brew install ollama                            ║
║  Linux:   curl -fsSL https://ollama.com/install.sh | sh  ║
║                                                          ║
║  Then run \`npm run dev\` again.                           ║
╚══════════════════════════════════════════════════════════╝
`);
    process.exit(1);
  }

  // 2. Check if Ollama is already serving
  if (!(await isOllamaServing())) {
    console.log('[Ollama] Starting ollama serve...');
    const child = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    if (!(await waitForOllama())) {
      console.error('[Ollama] Failed to start within 30s. Please start it manually.');
      process.exit(1);
    }
    console.log('[Ollama] Server started.');
  }

  // 3. Check if model is available
  if (!(await isModelAvailable())) {
    console.log(`[Ollama] Pulling ${MODEL}...`);
    try {
      execSync(`ollama pull ${MODEL}`, { stdio: 'inherit' });
    } catch {
      console.error(`[Ollama] Failed to pull ${MODEL}. Please pull it manually.`);
      process.exit(1);
    }
  }

  console.log('[Ollama] Ready.');
}

main();
