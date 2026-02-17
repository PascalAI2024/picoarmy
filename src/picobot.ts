#!/usr/bin/env tsx
/**
 * picobot — Lightweight bot runtime process
 *
 * Spawned by ProcessManager as: picobot gateway
 * Reads config from env vars (OPENAI_API_KEY, OPENAI_API_BASE, PICOBOT_MODEL, etc.)
 * Writes stdout/stderr for telemetry capture by ProcessManager.
 *
 * Lifecycle:
 *   1. Start up, read SOUL.md from workspace
 *   2. Log heartbeat every 30s (proves process is alive)
 *   3. Watch COMMANDS.md for commander instructions
 *   4. Exit cleanly on SIGTERM
 */

import fs from 'fs';
import path from 'path';

// ── Config from environment ──────────────────────────────────────

const HOME = process.env.PICOBOT_HOME || process.cwd();
const WORKSPACE = path.join(HOME, 'workspace');
const MODEL = process.env.PICOBOT_MODEL || 'glm-4.7-flash';
const API_BASE = process.env.OPENAI_API_BASE || '';
const API_KEY = process.env.OPENAI_API_KEY || '';
const HEARTBEAT_INTERVAL = 30_000; // 30s

// ── State ────────────────────────────────────────────────────────

let soulContent = '';
let running = true;
let heartbeatTimer: NodeJS.Timeout | null = null;
let commandPollTimer: NodeJS.Timeout | null = null;

// ── Startup ──────────────────────────────────────────────────────

function loadSoul(): string {
  const soulPath = path.join(WORKSPACE, 'SOUL.md');
  if (fs.existsSync(soulPath)) {
    return fs.readFileSync(soulPath, 'utf-8');
  }
  return 'You are a helpful assistant.';
}

function writeHeartbeat(): void {
  const heartbeatPath = path.join(WORKSPACE, 'HEARTBEAT.md');
  const timestamp = new Date().toISOString();
  const content = `# Heartbeat\n\nStatus: online\nTimestamp: ${timestamp}\nModel: ${MODEL}\nPID: ${process.pid}\n`;
  try {
    fs.writeFileSync(heartbeatPath, content);
  } catch {
    // Workspace may be locked — skip this heartbeat
  }
}

function pollCommands(): void {
  const commandsPath = path.join(WORKSPACE, 'COMMANDS.md');
  if (!fs.existsSync(commandsPath)) return;

  try {
    const content = fs.readFileSync(commandsPath, 'utf-8').trim();
    if (!content) return;

    // Process commands
    const lines = content.split('\n').filter(l => l.trim());
    for (const line of lines) {
      console.log(`[picobot] Command received: ${line}`);

      if (line.includes('RELOAD_SOUL')) {
        soulContent = loadSoul();
        console.log('[picobot] Soul reloaded');
      } else if (line.includes('SHUTDOWN')) {
        console.log('[picobot] Shutdown command received');
        shutdown();
      }
    }

    // Clear processed commands
    fs.writeFileSync(commandsPath, '');
  } catch {
    // File locked or other error — skip
  }
}

function shutdown(): void {
  if (!running) return;
  running = false;
  console.log('[picobot] Shutting down gracefully...');

  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (commandPollTimer) clearInterval(commandPollTimer);

  // Write final heartbeat
  const heartbeatPath = path.join(WORKSPACE, 'HEARTBEAT.md');
  try {
    fs.writeFileSync(heartbeatPath, `# Heartbeat\n\nStatus: offline\nTimestamp: ${new Date().toISOString()}\nPID: ${process.pid}\n`);
  } catch { /* ignore */ }

  process.exit(0);
}

// ── Main ─────────────────────────────────────────────────────────

function main(): void {
  const command = process.argv[2];

  if (command !== 'gateway') {
    console.error(`Usage: picobot gateway`);
    process.exit(1);
  }

  // Ensure workspace exists
  if (!fs.existsSync(WORKSPACE)) {
    fs.mkdirSync(WORKSPACE, { recursive: true });
  }

  // Load soul
  soulContent = loadSoul();
  const soulPreview = soulContent.split('\n')[0] || '(empty)';

  console.log(`[picobot] Starting gateway`);
  console.log(`[picobot] PID: ${process.pid}`);
  console.log(`[picobot] Home: ${HOME}`);
  console.log(`[picobot] Model: ${MODEL}`);
  console.log(`[picobot] API: ${API_BASE ? API_BASE.replace(/\/+$/, '') : '(not set)'}`);
  console.log(`[picobot] Soul: ${soulPreview}`);
  console.log(`[picobot] Ready`);

  // Write initial heartbeat
  writeHeartbeat();

  // Start heartbeat loop
  heartbeatTimer = setInterval(() => {
    if (!running) return;
    writeHeartbeat();
    console.log(`[picobot] heartbeat ok (pid=${process.pid})`);
  }, HEARTBEAT_INTERVAL);

  // Start command polling
  commandPollTimer = setInterval(() => {
    if (!running) return;
    pollCommands();
  }, 5_000); // Check every 5s

  // Handle graceful shutdown
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Keep process alive
  process.stdin.resume();
}

main();
