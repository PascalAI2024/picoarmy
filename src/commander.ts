import express, { type Request, type Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import * as apiClient from './api-client.js';
import { processManager, type BotConfig, getProviderPresets, resolveProvider } from './process-manager.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── SSE Connection Management ────────────────────────────────────

interface SSEClient {
  id: string;
  res: Response;
}

const sseClients = new Set<SSEClient>();

function broadcastSSE(event: string, data: unknown): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(message);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Wire process manager events to SSE
processManager.on('bot:spawned', (info) => broadcastSSE('fleet:spawn', info));
processManager.on('bot:destroyed', (info) => broadcastSSE('fleet:destroy', info));
processManager.on('bot:crashed', (info) => broadcastSSE('fleet:crash', info));
processManager.on('bot:stopped', (info) => broadcastSSE('fleet:update', info));
processManager.on('bot:log', (entry) => {
  broadcastSSE('log:entry', {
    id: `log-${Date.now()}`,
    bot_name: entry.botName,
    level: entry.level,
    message: entry.message,
    timestamp: new Date().toISOString(),
  });
});

// ── Fleet API Routes ─────────────────────────────────────────────

// GET /api/fleet — All bots (DB + process info)
app.get('/api/fleet', async (_req: Request, res: Response) => {
  try {
    const dbBots = await apiClient.getBots();
    const fleetStatus = processManager.getFleetStatus();

    // Merge DB data with live process info
    const enriched = dbBots.map((dbBot) => {
      const processInfo = fleetStatus.bots.find((p) => p.name === dbBot.name);
      return {
        ...dbBot,
        pid: processInfo?.pid ?? null,
        status: processInfo?.status ?? dbBot.status,
        uptime_seconds: processInfo?.uptime ?? dbBot.uptime_seconds,
        memory_mb: processInfo?.memoryMb ?? dbBot.memory_mb,
        restart_count: processInfo?.restartCount ?? 0,
      };
    });

    res.json(enriched);
  } catch (error) {
    console.error('Error fetching fleet:', error);
    res.status(500).json({ error: 'Failed to fetch fleet' });
  }
});

// GET /api/fleet/:id — Single bot detail
app.get('/api/fleet/:id', async (req: Request, res: Response) => {
  try {
    const bot = await apiClient.getBot(req.params.id!);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    res.json(bot);
  } catch (error) {
    console.error('Error fetching bot:', error);
    res.status(500).json({ error: 'Failed to fetch bot' });
  }
});

// POST /api/fleet — Spawn a new bot
app.post('/api/fleet', async (req: Request, res: Response) => {
  try {
    const { name, soul_name, is_permanent, ttl_seconds, model, provider, provider_config } = req.body;

    if (!name || !soul_name) {
      return res.status(400).json({ error: 'name and soul_name are required' });
    }

    // Create DB record
    const dbBot = await apiClient.createBot({
      name,
      soul_name,
      is_permanent: is_permanent !== undefined ? is_permanent : true,
      ttl_seconds,
    });

    // Resolve provider preset (e.g. 'glm-coding', 'minimax', 'glm-flash')
    const preset = provider ? resolveProvider(provider) : undefined;

    // Spawn actual process (if picobot binary available)
    const config: BotConfig = {
      name,
      soulName: soul_name,
      isPermanent: is_permanent !== undefined ? is_permanent : true,
      ttlSeconds: ttl_seconds ?? null,
      openaiApiKey: preset?.apiKey || provider_config?.api_key || process.env.OPENAI_API_KEY || '',
      openaiApiBase: preset?.apiBase || provider_config?.api_base || process.env.OPENAI_API_BASE || 'https://api.minimax.io/v1',
      model: model || preset?.model || process.env.PICOBOT_MODEL || 'MiniMax-M2',
      providerPreset: provider,
      telegramBotToken: provider_config?.telegram_token || '',
      telegramAllowFrom: provider_config?.telegram_allow_from || '',
      workspaceDir: '',
    };

    try {
      await processManager.spawnBot(config);
    } catch (spawnErr) {
      // Process spawn failed but DB record exists — that's OK in dev
      console.warn(`Process spawn failed for "${name}" (picobot binary may not be installed):`, spawnErr);
    }

    broadcastSSE('fleet:spawn', dbBot);
    res.status(201).json(dbBot);
  } catch (error) {
    console.error('Error creating bot:', error);
    res.status(500).json({ error: 'Failed to create bot' });
  }
});

// GET /api/providers — Available LLM provider presets
app.get('/api/providers', (_req: Request, res: Response) => {
  const presets = getProviderPresets().map(p => ({
    name: p.name,
    model: p.model,
    format: p.format,
    description: p.description,
    configured: !!p.apiKey,
  }));
  res.json(presets);
});

// DELETE /api/fleet/:id — Destroy a bot
app.delete('/api/fleet/:id', async (req: Request, res: Response) => {
  try {
    const botId = req.params.id!;

    // Find bot name from DB to kill process
    const bot = await apiClient.getBot(botId);
    if (bot) {
      try {
        await processManager.destroyBot(bot.name);
      } catch {
        // Process may not exist (dev mode)
      }
    }

    await apiClient.deleteBot(botId);
    broadcastSSE('fleet:destroy', { id: botId });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting bot:', error);
    res.status(500).json({ error: 'Failed to delete bot' });
  }
});

// GET /api/fleet/:id/logs — Bot telemetry
app.get('/api/fleet/:id/logs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const telemetry = await apiClient.getTelemetry(req.params.id!, limit);
    res.json(telemetry);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// ── Soul & Skill Routes ──────────────────────────────────────────

// GET /api/souls — List soul templates
app.get('/api/souls', (_req: Request, res: Response) => {
  try {
    const soulsDir = path.join(process.cwd(), 'souls');
    if (!fs.existsSync(soulsDir)) {
      return res.json([]);
    }

    const souls = fs.readdirSync(soulsDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        const content = fs.readFileSync(path.join(soulsDir, f), 'utf-8');
        const nameMatch = content.match(/^#\s+(.+)/m);
        return {
          name: f.replace('.md', ''),
          description: nameMatch ? nameMatch[1] : f.replace('.md', ''),
        };
      });

    res.json(souls);
  } catch (error) {
    console.error('Error fetching souls:', error);
    res.status(500).json({ error: 'Failed to fetch souls' });
  }
});

// POST /api/fleet/:id/soul — Deploy soul to bot
app.post('/api/fleet/:id/soul', async (req: Request, res: Response) => {
  try {
    const { soul_name } = req.body;
    if (!soul_name) return res.status(400).json({ error: 'soul_name is required' });

    const bot = await apiClient.getBot(req.params.id!);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    // Read soul template
    const soulPath = path.join(process.cwd(), 'souls', `${soul_name}.md`);
    if (!fs.existsSync(soulPath)) {
      return res.status(404).json({ error: `Soul template "${soul_name}" not found` });
    }

    const soulContent = fs.readFileSync(soulPath, 'utf-8');

    // Deploy to bot workspace via process manager
    try {
      processManager.deploySoul(bot.name, soulContent);
    } catch {
      // Bot process may not exist in dev
    }

    res.json({ success: true, bot_id: req.params.id, soul_name });
  } catch (error) {
    console.error('Error updating soul:', error);
    res.status(500).json({ error: 'Failed to update soul' });
  }
});

// GET /api/fleet/process/status — Live process manager status
app.get('/api/fleet/process/status', (_req: Request, res: Response) => {
  res.json(processManager.getFleetStatus());
});

// ── SSE Endpoint ─────────────────────────────────────────────────

app.get('/api/sse', (req: Request, res: Response) => {
  const clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const client: SSEClient = { id: clientId, res };
  sseClients.add(client);

  console.log(`[SSE] Client connected: ${clientId} (${sseClients.size} total)`);
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    try { res.write(`:heartbeat\n\n`); }
    catch { clearInterval(heartbeat); sseClients.delete(client); }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(client);
    console.log(`[SSE] Client disconnected: ${clientId} (${sseClients.size} total)`);
  });
});

// ── Static Files (Dashboard) ─────────────────────────────────────

const dashboardPath = path.join(__dirname, 'dashboard', 'dist');
app.use(express.static(dashboardPath));

app.get('*', (req: Request, res: Response) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(dashboardPath, 'index.html'));
});

// ── Start Server ─────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║  PICOARMY COMMAND CENTER                      ║
  ║                                               ║
  ║  Dashboard:  http://localhost:${PORT}             ║
  ║  API:        http://localhost:${PORT}/api         ║
  ║  SSE:        http://localhost:${PORT}/api/sse     ║
  ║  PostgREST:  ${process.env.POSTGREST_URL || 'http://localhost:3000'}       ║
  ╚═══════════════════════════════════════════════╝
  `);

  // Start health checks
  processManager.startHealthChecks();

  // Broadcast fleet updates every 30s
  setInterval(async () => {
    try {
      const bots = await apiClient.getBots();
      broadcastSSE('fleet:update', bots);
    } catch {
      // Silent — PostgREST may be down
    }
  }, 30000);
});

// Graceful shutdown
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n[CMD] ${signal} received — shutting down...`);
  for (const client of sseClients) { client.res.end(); }
  await processManager.shutdown();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
