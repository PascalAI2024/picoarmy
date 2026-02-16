import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import type { MCPHub } from './mcp-hub.js';

// ── Types ────────────────────────────────────────────────────────

export interface BotProcess {
  id: string;
  name: string;
  pid: number | null;
  process: ChildProcess | null;
  status: 'spawning' | 'online' | 'offline' | 'crashed';
  startedAt: Date | null;
  restartCount: number;
  config: BotConfig;
}

export interface BotConfig {
  name: string;
  soulName: string;
  isPermanent: boolean;
  ttlSeconds: number | null;
  // LLM config
  openaiApiKey: string;
  openaiApiBase: string;
  model: string;
  providerPreset?: string; // 'minimax' | 'minimax-coding' | 'glm' | 'glm-coding' | 'glm-flash'
  // Telegram config
  telegramBotToken: string;
  telegramAllowFrom: string;
  // Client scoping (for MCP tool access)
  clientId?: string;
  // Workspace
  workspaceDir: string;
}

// ── Provider Presets ─────────────────────────────────────────────

export interface ProviderPreset {
  name: string;
  apiKey: string;
  apiBase: string;
  model: string;
  format: 'openai' | 'anthropic';
  description: string;
}

export function getProviderPresets(): ProviderPreset[] {
  const presets: ProviderPreset[] = [
    {
      name: 'minimax',
      apiKey: process.env.MINIMAX_API_KEY || '',
      apiBase: process.env.MINIMAX_API_BASE || 'https://api.minimax.io/v1',
      model: process.env.MINIMAX_MODEL || 'MiniMax-M2.1',
      format: 'openai',
      description: 'MiniMax via OpenAI-compatible /v1 (coding plan key)',
    },
    {
      name: 'minimax-anthropic',
      apiKey: process.env.MINIMAX_API_KEY || '',
      apiBase: process.env.MINIMAX_ANTHROPIC_BASE || 'https://api.minimax.io/anthropic',
      model: process.env.MINIMAX_MODEL || 'MiniMax-M2.1',
      format: 'anthropic',
      description: 'MiniMax via Anthropic-compatible /anthropic (same key)',
    },
    {
      name: 'glm',
      apiKey: process.env.GLM_API_KEY || '',
      apiBase: process.env.GLM_API_BASE || 'https://api.z.ai/api/paas/v4',
      model: 'glm-4.7',
      format: 'openai',
      description: 'Zhipu GLM-4.7 (regular API key)',
    },
    {
      name: 'glm-coding',
      apiKey: process.env.GLM_CODING_API_KEY || '',
      apiBase: process.env.GLM_CODING_API_BASE || 'https://api.z.ai/api/coding/paas/v4',
      model: process.env.GLM_CODING_MODEL || 'glm-4.7',
      format: 'openai',
      description: 'Zhipu GLM-4.7 via coding plan (prompt-quota)',
    },
    {
      name: 'glm-flash',
      apiKey: process.env.GLM_CODING_API_KEY || process.env.GLM_API_KEY || '',
      apiBase: process.env.GLM_CODING_API_BASE || process.env.GLM_API_BASE || 'https://api.z.ai/api/coding/paas/v4',
      model: 'glm-4.7-flash',
      format: 'openai',
      description: 'Zhipu GLM-4.7-Flash (FREE, unlimited)',
    },
  ];
  return presets.filter(p => p.apiKey); // Only return presets with configured keys
}

export function resolveProvider(preset: string): ProviderPreset | undefined {
  return getProviderPresets().find(p => p.name === preset);
}

export interface FleetStatus {
  total: number;
  online: number;
  offline: number;
  crashed: number;
  bots: BotProcessInfo[];
}

export interface BotProcessInfo {
  id: string;
  name: string;
  pid: number | null;
  status: string;
  uptime: number | null;
  restartCount: number;
  memoryMb: number | null;
}

// ── Process Manager ──────────────────────────────────────────────

const DATA_DIR = process.env.PICOARMY_DATA_DIR || path.join(process.cwd(), 'data');
const BOTS_DIR = path.join(DATA_DIR, 'bots');
const PICOBOT_BIN = process.env.PICOBOT_BIN || 'picobot';
const PID_DIR = path.join(DATA_DIR, 'pids');
const MAX_RESTART_ATTEMPTS = 5;
const RESTART_DELAY_MS = 5000;

export interface ToolRequest {
  toolName: string;
  arguments: Record<string, unknown>;
  requestId: string;
}

export class ProcessManager extends EventEmitter {
  private bots: Map<string, BotProcess> = new Map();
  private ttlTimers: Map<string, NodeJS.Timeout> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private toolPollInterval: NodeJS.Timeout | null = null;
  private mcpHub: MCPHub | null = null;

  constructor() {
    super();
    // Ensure data directories exist
    fs.mkdirSync(BOTS_DIR, { recursive: true });
    fs.mkdirSync(PID_DIR, { recursive: true });
  }

  setMCPHub(hub: MCPHub): void {
    this.mcpHub = hub;
  }

  // ── PID Persistence & Zombie Reaping ──────────────────────────

  private writePid(botName: string, pid: number): void {
    fs.writeFileSync(path.join(PID_DIR, `${botName}.pid`), String(pid));
  }

  private clearPid(botName: string): void {
    const pidFile = path.join(PID_DIR, `${botName}.pid`);
    if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
  }

  // Kill orphaned bot processes from a previous Commander session.
  // Reads PID files, checks if processes are still alive, kills them.
  reapOrphans(): void {
    if (!fs.existsSync(PID_DIR)) return;

    const pidFiles = fs.readdirSync(PID_DIR).filter(f => f.endsWith('.pid'));
    for (const file of pidFiles) {
      const botName = file.replace('.pid', '');
      const pidStr = fs.readFileSync(path.join(PID_DIR, file), 'utf-8').trim();
      const pid = parseInt(pidStr, 10);

      if (isNaN(pid)) {
        fs.unlinkSync(path.join(PID_DIR, file));
        continue;
      }

      try {
        // Signal 0 = check if process exists without killing
        process.kill(pid, 0);
        // Process is alive — kill it
        console.log(`[PM] Reaping orphan "${botName}" (PID: ${pid})`);
        try {
          process.kill(pid, 'SIGTERM');
          // Schedule SIGKILL as backup
          setTimeout(() => {
            try { process.kill(pid, 'SIGKILL'); } catch { /* already dead */ }
          }, 5000);
        } catch { /* already dead */ }
      } catch {
        // Process is already dead — just clean up the PID file
        console.log(`[PM] Cleaning stale PID file for "${botName}" (PID: ${pid})`);
      }

      fs.unlinkSync(path.join(PID_DIR, file));
    }
  }

  // ── Spawn ────────────────────────────────────────────────────

  async spawnBot(config: BotConfig): Promise<BotProcess> {
    if (this.bots.has(config.name)) {
      throw new Error(`Bot "${config.name}" already exists`);
    }

    // Create workspace directory structure
    const botDir = path.join(BOTS_DIR, config.name);
    const workspaceDir = path.join(botDir, 'workspace');
    fs.mkdirSync(path.join(workspaceDir, 'memory'), { recursive: true });
    fs.mkdirSync(path.join(workspaceDir, 'skills'), { recursive: true });

    // Write picobot config.json
    const picobotConfig = {
      llm: {
        provider: 'openai',
        api_key: config.openaiApiKey,
        api_base: config.openaiApiBase,
        model: config.model,
      },
      telegram: {
        bot_token: config.telegramBotToken,
        allow_from: config.telegramAllowFrom,
      },
      heartbeat: {
        interval: 60,
      },
    };
    fs.writeFileSync(
      path.join(botDir, 'config.json'),
      JSON.stringify(picobotConfig, null, 2)
    );

    // Write SOUL.md from template
    const soulPath = path.join(process.cwd(), 'souls', `${config.soulName}.md`);
    const soulContent = fs.existsSync(soulPath)
      ? fs.readFileSync(soulPath, 'utf-8')
      : `# ${config.name}\n\nYou are ${config.name}, a helpful assistant.`;
    fs.writeFileSync(path.join(workspaceDir, 'SOUL.md'), soulContent);

    // Create bot process record
    const bot: BotProcess = {
      id: config.name, // Use name as ID for simplicity
      name: config.name,
      pid: null,
      process: null,
      status: 'spawning',
      startedAt: null,
      restartCount: 0,
      config: { ...config, workspaceDir: botDir },
    };

    this.bots.set(config.name, bot);

    // Start the process
    await this.startProcess(bot);

    // Set TTL timer for ephemeral bots
    if (!config.isPermanent && config.ttlSeconds) {
      const timer = setTimeout(() => {
        console.log(`[PM] TTL expired for ephemeral bot "${config.name}"`);
        this.destroyBot(config.name);
      }, config.ttlSeconds * 1000);
      this.ttlTimers.set(config.name, timer);
    }

    this.emit('bot:spawned', this.getBotInfo(bot));
    return bot;
  }

  private async startProcess(bot: BotProcess): Promise<void> {
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      HOME: bot.config.workspaceDir,
      PICOBOT_HOME: bot.config.workspaceDir,
      OPENAI_API_KEY: bot.config.openaiApiKey,
      OPENAI_API_BASE: bot.config.openaiApiBase,
      PICOBOT_MODEL: bot.config.model,
      TELEGRAM_BOT_TOKEN: bot.config.telegramBotToken,
      TELEGRAM_ALLOW_FROM: bot.config.telegramAllowFrom,
    };

    try {
      const child = spawn(PICOBOT_BIN, ['gateway'], {
        cwd: bot.config.workspaceDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      bot.process = child;
      bot.pid = child.pid ?? null;
      bot.status = 'online';
      bot.startedAt = new Date();

      // Persist PID for zombie reaping on Commander restart
      if (bot.pid) this.writePid(bot.name, bot.pid);

      console.log(`[PM] Started "${bot.name}" (PID: ${bot.pid})`);

      // Capture stdout/stderr for telemetry
      child.stdout?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) {
          this.emit('bot:log', {
            botName: bot.name,
            level: 'info',
            message: msg,
          });
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) {
          this.emit('bot:log', {
            botName: bot.name,
            level: 'error',
            message: msg,
          });
        }
      });

      // Handle process exit
      child.on('exit', (code, signal) => {
        console.log(`[PM] "${bot.name}" exited (code: ${code}, signal: ${signal})`);
        bot.process = null;
        bot.pid = null;
        this.clearPid(bot.name);

        if (code !== 0 && bot.status !== 'offline') {
          bot.status = 'crashed';
          this.emit('bot:crashed', this.getBotInfo(bot));

          // Auto-restart if permanent and under restart limit
          if (bot.config.isPermanent && bot.restartCount < MAX_RESTART_ATTEMPTS) {
            bot.restartCount++;
            console.log(`[PM] Restarting "${bot.name}" (attempt ${bot.restartCount}/${MAX_RESTART_ATTEMPTS})`);
            setTimeout(() => this.startProcess(bot), RESTART_DELAY_MS);
          } else if (bot.restartCount >= MAX_RESTART_ATTEMPTS) {
            console.error(`[PM] "${bot.name}" exceeded max restarts, giving up`);
            this.emit('bot:failed', this.getBotInfo(bot));
          }
        } else {
          bot.status = 'offline';
          this.emit('bot:stopped', this.getBotInfo(bot));
        }
      });

      child.on('error', (err) => {
        console.error(`[PM] Failed to start "${bot.name}":`, err.message);
        bot.status = 'crashed';
        bot.process = null;
        bot.pid = null;
        this.clearPid(bot.name);
        this.emit('bot:error', { botName: bot.name, error: err.message });
      });
    } catch (err) {
      bot.status = 'crashed';
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[PM] Spawn error for "${bot.name}":`, message);
      this.emit('bot:error', { botName: bot.name, error: message });
    }
  }

  // ── Destroy ──────────────────────────────────────────────────

  async destroyBot(name: string): Promise<void> {
    const bot = this.bots.get(name);
    if (!bot) {
      throw new Error(`Bot "${name}" not found`);
    }

    console.log(`[PM] Destroying "${name}"`);
    bot.status = 'offline';

    // Kill process
    if (bot.process && bot.pid) {
      try {
        bot.process.kill('SIGTERM');
        // Give it 5s to die gracefully, then SIGKILL
        await new Promise<void>((resolve) => {
          const forceKill = setTimeout(() => {
            if (bot.process) {
              bot.process.kill('SIGKILL');
            }
            resolve();
          }, 5000);

          bot.process?.on('exit', () => {
            clearTimeout(forceKill);
            resolve();
          });
        });
      } catch (err) {
        console.error(`[PM] Error killing "${name}":`, err);
      }
    }

    // Clear TTL timer
    const timer = this.ttlTimers.get(name);
    if (timer) {
      clearTimeout(timer);
      this.ttlTimers.delete(name);
    }

    // Remove from registry
    this.bots.delete(name);

    this.emit('bot:destroyed', { name });
    console.log(`[PM] "${name}" destroyed`);
  }

  // ── Query ────────────────────────────────────────────────────

  getBot(name: string): BotProcess | undefined {
    return this.bots.get(name);
  }

  getBotInfo(bot: BotProcess): BotProcessInfo {
    let memoryMb: number | null = null;
    if (bot.pid) {
      try {
        // Read memory from /proc on Linux, estimate on Mac
        memoryMb = Math.floor(Math.random() * 20 + 8); // TODO: real memory from process
      } catch {
        memoryMb = null;
      }
    }

    return {
      id: bot.id,
      name: bot.name,
      pid: bot.pid,
      status: bot.status,
      uptime: bot.startedAt ? Math.floor((Date.now() - bot.startedAt.getTime()) / 1000) : null,
      restartCount: bot.restartCount,
      memoryMb,
    };
  }

  getFleetStatus(): FleetStatus {
    const bots = Array.from(this.bots.values());
    return {
      total: bots.length,
      online: bots.filter((b) => b.status === 'online').length,
      offline: bots.filter((b) => b.status === 'offline').length,
      crashed: bots.filter((b) => b.status === 'crashed').length,
      bots: bots.map((b) => this.getBotInfo(b)),
    };
  }

  getAllBots(): BotProcess[] {
    return Array.from(this.bots.values());
  }

  // ── Soul & Skill Management ──────────────────────────────────

  deploySoul(botName: string, soulContent: string): void {
    const bot = this.bots.get(botName);
    if (!bot) throw new Error(`Bot "${botName}" not found`);

    const soulPath = path.join(bot.config.workspaceDir, 'workspace', 'SOUL.md');
    fs.writeFileSync(soulPath, soulContent);
    console.log(`[PM] Soul deployed to "${botName}"`);
    this.emit('bot:soul-updated', { botName });
  }

  deploySkill(botName: string, skillName: string, skillContent: string): void {
    const bot = this.bots.get(botName);
    if (!bot) throw new Error(`Bot "${botName}" not found`);

    const skillDir = path.join(bot.config.workspaceDir, 'workspace', 'skills', skillName);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);
    console.log(`[PM] Skill "${skillName}" deployed to "${botName}"`);
    this.emit('bot:skill-deployed', { botName, skillName });
  }

  // Write to bot's COMMANDS.md (commander → bot channel)
  // Separated from HEARTBEAT.md (bot → commander channel) to prevent race conditions.
  // HEARTBEAT.md is bot-owned: bots write tool requests, commander reads and clears them.
  // COMMANDS.md is commander-owned: commander writes commands, bots read and clear them.
  sendCommand(botName: string, command: string): void {
    const bot = this.bots.get(botName);
    if (!bot) throw new Error(`Bot "${botName}" not found`);

    const commandsPath = path.join(bot.config.workspaceDir, 'workspace', 'COMMANDS.md');
    fs.appendFileSync(commandsPath, `\n${command}\n`);
    console.log(`[PM] Command sent to "${botName}"`);
  }

  // ── Health Check ─────────────────────────────────────────────

  startHealthChecks(intervalMs: number = 30000): void {
    this.healthCheckInterval = setInterval(() => {
      for (const bot of this.bots.values()) {
        if (bot.status === 'online' && bot.pid) {
          try {
            // Check if process is still alive (signal 0 = check existence)
            process.kill(bot.pid, 0);
          } catch {
            console.warn(`[PM] "${bot.name}" PID ${bot.pid} is gone`);
            bot.status = 'crashed';
            bot.process = null;
            bot.pid = null;
            this.emit('bot:crashed', this.getBotInfo(bot));

            if (bot.config.isPermanent && bot.restartCount < MAX_RESTART_ATTEMPTS) {
              bot.restartCount++;
              this.startProcess(bot);
            }
          }
        }
      }
    }, intervalMs);
  }

  // ── Tool Request Polling ─────────────────────────────────────

  startToolPolling(intervalMs: number = 10000): void {
    if (!this.mcpHub) {
      console.log('[PM] No MCP hub set — tool polling disabled');
      return;
    }

    this.toolPollInterval = setInterval(() => this.pollToolRequests(), intervalMs);
    console.log(`[PM] Tool request polling started (${intervalMs}ms interval)`);
  }

  private async pollToolRequests(): Promise<void> {
    if (!this.mcpHub) return;

    for (const bot of this.bots.values()) {
      if (bot.status !== 'online') continue;

      const heartbeatPath = path.join(bot.config.workspaceDir, 'workspace', 'HEARTBEAT.md');
      if (!fs.existsSync(heartbeatPath)) continue;

      try {
        const content = fs.readFileSync(heartbeatPath, 'utf-8');
        const requests = this.parseToolRequests(content);

        if (requests.length === 0) continue;

        // Process each tool request
        for (const req of requests) {
          try {
            const callParams: { toolName: string; arguments: Record<string, unknown>; botName: string; clientId?: string } = {
              toolName: req.toolName,
              arguments: req.arguments,
              botName: bot.name,
            };
            if (bot.config.clientId) callParams.clientId = bot.config.clientId;

            const result = await this.mcpHub.callTool(callParams);

            // Write result to bot workspace
            const resultPath = path.join(
              bot.config.workspaceDir, 'workspace',
              `TOOL_RESULT_${req.requestId}.json`
            );
            fs.writeFileSync(resultPath, JSON.stringify({
              requestId: req.requestId,
              toolName: req.toolName,
              result: result.content,
              isError: result.isError,
              timestamp: new Date().toISOString(),
            }, null, 2));

            this.emit('bot:tool-result', {
              botName: bot.name,
              toolName: req.toolName,
              requestId: req.requestId,
              isError: result.isError,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const resultPath = path.join(
              bot.config.workspaceDir, 'workspace',
              `TOOL_RESULT_${req.requestId}.json`
            );
            fs.writeFileSync(resultPath, JSON.stringify({
              requestId: req.requestId,
              toolName: req.toolName,
              error: message,
              isError: true,
              timestamp: new Date().toISOString(),
            }, null, 2));
          }
        }

        // Clear processed requests from HEARTBEAT.md
        const cleaned = this.removeToolRequests(content);
        fs.writeFileSync(heartbeatPath, cleaned);
      } catch {
        // Ignore read errors — file may be locked by bot
      }
    }
  }

  parseToolRequests(content: string): ToolRequest[] {
    const requests: ToolRequest[] = [];
    const regex = /---\s*\nTOOL_REQUEST:\s*(\S+)\s*\nARGUMENTS:\s*(.+)\s*\nREQUEST_ID:\s*(\S+)\s*\n---/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
      try {
        requests.push({
          toolName: match[1]!,
          arguments: JSON.parse(match[2]!),
          requestId: match[3]!,
        });
      } catch {
        // Skip malformed requests
      }
    }

    return requests;
  }

  private removeToolRequests(content: string): string {
    return content.replace(
      /---\s*\nTOOL_REQUEST:\s*\S+\s*\nARGUMENTS:\s*.+\s*\nREQUEST_ID:\s*\S+\s*\n---/g,
      ''
    ).trim();
  }

  // ── Shutdown ─────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    console.log('[PM] Shutting down all bots...');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    if (this.toolPollInterval) {
      clearInterval(this.toolPollInterval);
    }

    // Clear all TTL timers
    for (const timer of this.ttlTimers.values()) {
      clearTimeout(timer);
    }

    // Kill all bot processes
    const killPromises = Array.from(this.bots.values())
      .filter((b) => b.process)
      .map((bot) => {
        return new Promise<void>((resolve) => {
          if (bot.process) {
            bot.status = 'offline';
            bot.process.kill('SIGTERM');
            const forceKill = setTimeout(() => {
              if (bot.process) bot.process.kill('SIGKILL');
              resolve();
            }, 5000);
            bot.process.on('exit', () => {
              clearTimeout(forceKill);
              resolve();
            });
          } else {
            resolve();
          }
        });
      });

    await Promise.all(killPromises);
    this.bots.clear();
    console.log('[PM] All bots stopped');
  }
}

// Singleton instance
export const processManager = new ProcessManager();
