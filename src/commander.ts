import express, { type Request, type Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import * as apiClient from './api-client.js';
import { processManager, type BotConfig, getProviderPresets, resolveProvider } from './process-manager.js';
import { mcpHub } from './mcp-hub.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: process.env.DASHBOARD_URL || 'http://localhost:5173',
  credentials: true,
}));
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

// Wire MCP hub events to SSE
mcpHub.on('tool:called', (info) => broadcastSSE('mcp:tool-called', info));
mcpHub.on('tool:error', (info) => broadcastSSE('mcp:tool-error', info));
mcpHub.on('tool:denied', (info) => broadcastSSE('mcp:tool-denied', info));
mcpHub.on('server:connected', (info) => broadcastSSE('mcp:server-connected', info));
mcpHub.on('server:error', (info) => broadcastSSE('mcp:server-error', info));

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
    const { name, soul_name, is_permanent, ttl_seconds, model, provider, provider_config, client_id } = req.body;

    if (!name || !soul_name) {
      return res.status(400).json({ error: 'name and soul_name are required' });
    }

    // Create DB record (with provider/model in metadata for dashboard visibility)
    const preset = provider ? resolveProvider(provider) : undefined;
    const effectiveModel = model || preset?.model || process.env.PICOBOT_MODEL || 'glm-4.7-flash';
    let dbBot;
    try {
      dbBot = await apiClient.createBot({
        name,
        soul_name,
        is_permanent: is_permanent !== undefined ? is_permanent : true,
        ttl_seconds,
        client_id,
        metadata: {
          ...(provider ? { provider } : {}),
          model: effectiveModel,
        },
      });
    } catch (createErr: unknown) {
      const message = createErr instanceof Error ? createErr.message : String(createErr);
      if (message.includes('409') || message.includes('duplicate') || message.includes('unique')) {
        return res.status(409).json({ error: `Bot name "${name}" already exists` });
      }
      throw createErr;
    }

    // Spawn actual process (if picobot binary available)
    const config: BotConfig = {
      name,
      soulName: soul_name,
      isPermanent: is_permanent !== undefined ? is_permanent : true,
      ttlSeconds: ttl_seconds ?? null,
      openaiApiKey: preset?.apiKey || provider_config?.api_key || process.env.OPENAI_API_KEY || '',
      openaiApiBase: preset?.apiBase || provider_config?.api_base || process.env.OPENAI_API_BASE || 'https://api.minimax.io/v1',
      model: effectiveModel,
      providerPreset: provider,
      telegramBotToken: provider_config?.telegram_token || '',
      telegramAllowFrom: provider_config?.telegram_allow_from || '',
      clientId: client_id,
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
    const message = error instanceof Error ? error.message : String(error);
    console.error('[POST /api/fleet] Error creating bot:', message);
    res.status(500).json({ error: 'Failed to create bot', detail: message.slice(0, 200) });
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

// PATCH /api/fleet/:id/settings — Update bot settings
app.patch('/api/fleet/:id/settings', async (req: Request, res: Response) => {
  try {
    const botId = req.params.id!;
    const { provider, model, client_id, telegram_token, telegram_allow_from, soul_name } = req.body;

    const bot = await apiClient.getBot(botId);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    // Update DB metadata
    const metadata = { ...(bot.metadata || {}), provider, model, client_id, telegram_token: '***' };
    await apiClient.updateBot(botId, {
      metadata,
      client_id: client_id !== undefined ? client_id : bot.client_id,
      soul_name: soul_name || bot.soul_name,
    });

    // Update bot workspace config.json if process exists
    const botProcess = processManager.getBot(bot.name);
    if (botProcess) {
      const preset = provider ? resolveProvider(provider) : undefined;
      const configPath = path.join(botProcess.config.workspaceDir, 'config.json');

      if (fs.existsSync(configPath)) {
        const existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

        if (preset || model) {
          existingConfig.llm = {
            ...existingConfig.llm,
            api_key: preset?.apiKey || existingConfig.llm?.api_key,
            api_base: preset?.apiBase || existingConfig.llm?.api_base,
            model: model || preset?.model || existingConfig.llm?.model,
          };
        }

        if (telegram_token) {
          existingConfig.telegram = {
            ...existingConfig.telegram,
            bot_token: telegram_token,
          };
        }
        if (telegram_allow_from !== undefined) {
          existingConfig.telegram = {
            ...existingConfig.telegram,
            allow_from: telegram_allow_from,
          };
        }

        fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2));
      }

      // Update client_id on config for MCP scoping
      if (client_id !== undefined) {
        botProcess.config.clientId = client_id;
      }
    }

    // Deploy new soul if changed
    if (soul_name && soul_name !== bot.soul_name) {
      const soulPath = path.join(process.cwd(), 'souls', `${soul_name}.md`);
      if (fs.existsSync(soulPath)) {
        try {
          const soulContent = fs.readFileSync(soulPath, 'utf-8');
          processManager.deploySoul(bot.name, soulContent);
        } catch { /* Bot process may not exist */ }
      }
    }

    const updated = await apiClient.getBot(botId);
    res.json(updated);
  } catch (error) {
    console.error('Error updating bot settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ── MCP Tool Routes ──────────────────────────────────────────────

// GET /api/tools — List available MCP tools (filtered by bot's client scope)
app.get('/api/tools', async (req: Request, res: Response) => {
  try {
    const botName = req.query.bot as string | undefined;
    let clientId: string | undefined;

    if (botName) {
      // Look up client_id from bot
      const dbBots = await apiClient.getBots();
      const bot = dbBots.find(b => b.name === botName);
      clientId = bot?.client_id || undefined;
    }

    const tools = mcpHub.listTools(clientId);
    res.json(tools);
  } catch (error) {
    console.error('Error listing tools:', error);
    res.status(500).json({ error: 'Failed to list tools' });
  }
});

// GET /api/tools/:name — Tool detail
app.get('/api/tools/:name', (_req: Request, res: Response) => {
  const tool = mcpHub.getTool(_req.params.name!);
  if (!tool) return res.status(404).json({ error: 'Tool not found' });
  res.json(tool);
});

// POST /api/tools/:name/call — Execute a tool (with scope check)
app.post('/api/tools/:name/call', async (req: Request, res: Response) => {
  try {
    const toolName = req.params.name!;
    const { arguments: args, bot_name } = req.body;

    if (!bot_name) {
      return res.status(400).json({ error: 'bot_name is required' });
    }

    // Resolve client_id from bot
    const dbBots = await apiClient.getBots();
    const bot = dbBots.find(b => b.name === bot_name);
    const clientId = bot?.client_id || undefined;

    const callParams: Parameters<typeof mcpHub.callTool>[0] = {
      toolName,
      arguments: args || {},
      botName: bot_name,
    };
    if (clientId) callParams.clientId = clientId;

    const result = await mcpHub.callTool(callParams);

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tool call failed';
    console.error('Error calling tool:', message);

    if (message.includes('Access denied')) {
      return res.status(403).json({ error: message });
    }
    if (message.includes('not found')) {
      return res.status(404).json({ error: message });
    }

    res.status(500).json({ error: message });
  }
});

// GET /api/mcp/status — MCP hub connection status
app.get('/api/mcp/status', (_req: Request, res: Response) => {
  res.json(mcpHub.getStatus());
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

// POST /api/fleet/:id/restart — Restart a bot
app.post('/api/fleet/:id/restart', async (req: Request, res: Response) => {
  try {
    const botId = req.params.id!;

    // Get bot from DB
    const bot = await apiClient.getBot(botId);
    if (!bot) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    // Kill existing process
    try {
      await processManager.destroyBot(bot.name);
    } catch {
      // Process may not exist (dev mode) — that's OK
    }

    // Respawn process with same config
    const preset = bot.metadata?.provider ? resolveProvider(bot.metadata.provider as string) : undefined;
    const baseConfig: BotConfig = {
      name: bot.name,
      soulName: bot.soul_name,
      isPermanent: bot.is_permanent,
      ttlSeconds: bot.ttl_seconds ?? null,
      openaiApiKey: preset?.apiKey || process.env.OPENAI_API_KEY || '',
      openaiApiBase: preset?.apiBase || process.env.OPENAI_API_BASE || 'https://api.minimax.io/v1',
      model: (bot.metadata?.model as string) || preset?.model || process.env.PICOBOT_MODEL || 'MiniMax-M2',
      telegramBotToken: (bot.metadata?.telegram_token as string) || '',
      telegramAllowFrom: (bot.metadata?.telegram_allow_from as string) || '',
      workspaceDir: '',
    };

    if (bot.metadata?.provider) {
      baseConfig.providerPreset = bot.metadata.provider as string;
    }
    if (bot.client_id) {
      baseConfig.clientId = bot.client_id;
    }

    const config = baseConfig;

    try {
      await processManager.spawnBot(config);
    } catch (spawnErr) {
      console.warn(`Process spawn failed for "${bot.name}" during restart:`, spawnErr);
    }

    broadcastSSE('fleet:update', bot);
    res.json({ success: true, bot_id: botId });
  } catch (error) {
    console.error('Error restarting bot:', error);
    res.status(500).json({ error: 'Failed to restart bot' });
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

// GET /api/logs — Global fleet logs
app.get('/api/logs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const level = req.query.level as string;
    const bot = req.query.bot as string;

    const telemetry = await apiClient.getGlobalLogs(limit, level, bot);
    res.json(telemetry);
  } catch (error) {
    console.error('Error fetching global logs:', error);
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

// GET /api/fleet/:id/soul — Get bot's current soul content
app.get('/api/fleet/:id/soul', async (req: Request, res: Response) => {
  try {
    const bot = await apiClient.getBot(req.params.id!);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const soulPath = path.join(process.cwd(), 'souls', `${bot.soul_name}.md`);
    if (!fs.existsSync(soulPath)) {
      return res.json({ content: `# ${bot.soul_name}\n\nSoul template not found on disk.`, soul_name: bot.soul_name });
    }

    const content = fs.readFileSync(soulPath, 'utf-8');
    res.json({ content, soul_name: bot.soul_name });
  } catch (error) {
    console.error('Error fetching soul content:', error);
    res.status(500).json({ error: 'Failed to fetch soul content' });
  }
});

// POST /api/fleet/:id/soul — Deploy soul to bot (by template name OR direct content)
app.post('/api/fleet/:id/soul', async (req: Request, res: Response) => {
  try {
    const { soul_name, content } = req.body;
    if (!soul_name && !content) return res.status(400).json({ error: 'soul_name or content is required' });

    const bot = await apiClient.getBot(req.params.id!);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    let soulContent: string;

    if (content) {
      // Direct content editing — write content as the bot's SOUL.md
      soulContent = content;
    } else {
      // Template deployment — read from souls/ directory
      const soulPath = path.join(process.cwd(), 'souls', `${soul_name}.md`);
      if (!fs.existsSync(soulPath)) {
        return res.status(404).json({ error: `Soul template "${soul_name}" not found` });
      }
      soulContent = fs.readFileSync(soulPath, 'utf-8');
    }

    // Deploy to bot workspace via process manager
    try {
      processManager.deploySoul(bot.name, soulContent);
    } catch {
      // Bot process may not exist in dev
    }

    res.json({ success: true, bot_id: req.params.id, soul_name: soul_name || 'custom' });
  } catch (error) {
    console.error('Error updating soul:', error);
    res.status(500).json({ error: 'Failed to update soul' });
  }
});

// GET /api/souls/:name — Get single soul template content
app.get('/api/souls/:name', (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const soulPath = path.join(process.cwd(), 'souls', `${name}.md`);

    if (!fs.existsSync(soulPath)) {
      return res.status(404).json({ error: `Soul "${name}" not found` });
    }

    const content = fs.readFileSync(soulPath, 'utf-8');
    const descMatch = content.match(/^#\s+(.+)/m);
    const description = descMatch ? descMatch[1] : name;

    res.json({ name, description, content });
  } catch (error) {
    console.error('Error fetching soul:', error);
    res.status(500).json({ error: 'Failed to fetch soul' });
  }
});

// POST /api/souls — Create new soul template
app.post('/api/souls', (req: Request, res: Response) => {
  try {
    const { name, content } = req.body;
    if (!name || !content) {
      return res.status(400).json({ error: 'name and content are required' });
    }

    // Validate name (alphanumeric + hyphens only)
    if (!/^[a-zA-Z0-9-]+$/.test(name)) {
      return res.status(400).json({ error: 'name must be alphanumeric with hyphens only' });
    }

    const soulsDir = path.join(process.cwd(), 'souls');
    if (!fs.existsSync(soulsDir)) {
      fs.mkdirSync(soulsDir, { recursive: true });
    }

    const soulPath = path.join(soulsDir, `${name}.md`);
    if (fs.existsSync(soulPath)) {
      return res.status(409).json({ error: `Soul "${name}" already exists` });
    }

    fs.writeFileSync(soulPath, content, 'utf-8');

    // Extract description from first line
    const descMatch = content.match(/^#\s+(.+)/m);
    const description = descMatch ? descMatch[1] : name;

    res.json({ name, description });
  } catch (error) {
    console.error('Error creating soul:', error);
    res.status(500).json({ error: 'Failed to create soul' });
  }
});

// PUT /api/souls/:name — Update soul template content
app.put('/api/souls/:name', (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const soulPath = path.join(process.cwd(), 'souls', `${name}.md`);
    if (!fs.existsSync(soulPath)) {
      return res.status(404).json({ error: `Soul "${name}" not found` });
    }

    fs.writeFileSync(soulPath, content, 'utf-8');

    // Extract description from first line
    const descMatch = content.match(/^#\s+(.+)/m);
    const description = descMatch ? descMatch[1] : name;

    res.json({ name, description });
  } catch (error) {
    console.error('Error updating soul:', error);
    res.status(500).json({ error: 'Failed to update soul' });
  }
});

// DELETE /api/souls/:name — Delete soul template
app.delete('/api/souls/:name', (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const soulPath = path.join(process.cwd(), 'souls', `${name}.md`);

    if (!fs.existsSync(soulPath)) {
      return res.status(404).json({ error: `Soul "${name}" not found` });
    }

    fs.unlinkSync(soulPath);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting soul:', error);
    res.status(500).json({ error: 'Failed to delete soul' });
  }
});

// POST /api/fleet/:id/command — Send command to bot's COMMANDS.md
app.post('/api/fleet/:id/command', async (req: Request, res: Response) => {
  try {
    const botId = req.params.id!;
    const { command, args } = req.body;

    if (!command) return res.status(400).json({ error: 'command is required' });

    const bot = await apiClient.getBot(botId);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    // Format command block with timestamp and args
    const timestamp = new Date().toISOString();
    const commandBlock = `
---
COMMAND: ${command}
TIMESTAMP: ${timestamp}
${args ? `ARGS: ${JSON.stringify(args)}` : ''}
---
`;

    // Write to bot's COMMANDS.md via process manager
    try {
      processManager.sendCommand(bot.name, commandBlock);
      res.json({ success: true, bot_id: botId, command, timestamp });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(404).json({ error: message });
    }
  } catch (error) {
    console.error('Error sending command:', error);
    res.status(500).json({ error: 'Failed to send command' });
  }
});

// GET /api/skills — List available skills from skills/ directory
app.get('/api/skills', (_req: Request, res: Response) => {
  try {
    const skillsDir = path.join(process.cwd(), 'skills');
    if (!fs.existsSync(skillsDir)) {
      return res.json([]);
    }

    const skills = fs.readdirSync(skillsDir)
      .filter((f) => {
        const skillPath = path.join(skillsDir, f);
        return fs.statSync(skillPath).isDirectory();
      })
      .map((skillName) => {
        const skillMdPath = path.join(skillsDir, skillName, 'SKILL.md');
        let description = skillName;

        if (fs.existsSync(skillMdPath)) {
          const content = fs.readFileSync(skillMdPath, 'utf-8');
          const match = content.match(/^#\s+(.+)/m);
          if (match && match[1]) description = match[1];
        }

        return {
          name: skillName,
          description,
        };
      });

    res.json(skills);
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

// GET /api/skills/:name — Get skill details
app.get('/api/skills/:name', (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const skillPath = path.join(process.cwd(), 'skills', name, 'SKILL.md');

    if (!fs.existsSync(skillPath)) {
      return res.status(404).json({ error: `Skill "${name}" not found` });
    }

    const content = fs.readFileSync(skillPath, 'utf-8');
    const descMatch = content.match(/^#\s+(.+)/m);
    const description = (descMatch && descMatch[1]) ? descMatch[1] : name;

    res.json({ name, description, content });
  } catch (error) {
    console.error('Error fetching skill:', error);
    res.status(500).json({ error: 'Failed to fetch skill' });
  }
});

// GET /api/fleet/:id/skills — List skills deployed to a bot
app.get('/api/fleet/:id/skills', async (req: Request, res: Response) => {
  try {
    const bot = await apiClient.getBot(req.params.id!);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const botProcess = processManager.getBot(bot.name);
    if (!botProcess) {
      return res.json([]); // No process = no deployed skills
    }

    const skillsDir = path.join(botProcess.config.workspaceDir, 'workspace', 'skills');
    if (!fs.existsSync(skillsDir)) {
      return res.json([]);
    }

    const skills = fs.readdirSync(skillsDir)
      .filter((f) => {
        const skillPath = path.join(skillsDir, f);
        return fs.statSync(skillPath).isDirectory();
      })
      .map((skillName) => {
        const skillMdPath = path.join(skillsDir, skillName, 'SKILL.md');
        let description = skillName;

        if (fs.existsSync(skillMdPath)) {
          const content = fs.readFileSync(skillMdPath, 'utf-8');
          const match = content.match(/^#\s+(.+)/m);
          if (match && match[1]) description = match[1];
        }

        return { name: skillName, description };
      });

    res.json(skills);
  } catch (error) {
    console.error('Error fetching bot skills:', error);
    res.status(500).json({ error: 'Failed to fetch bot skills' });
  }
});

// POST /api/fleet/:id/skills — Deploy a skill to a bot
app.post('/api/fleet/:id/skills', async (req: Request, res: Response) => {
  try {
    const botId = req.params.id!;
    const { skill_name } = req.body;

    if (!skill_name) return res.status(400).json({ error: 'skill_name is required' });

    const bot = await apiClient.getBot(botId);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    // Read skill content
    const skillPath = path.join(process.cwd(), 'skills', skill_name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      return res.status(404).json({ error: `Skill "${skill_name}" not found` });
    }

    const skillContent = fs.readFileSync(skillPath, 'utf-8');

    // Deploy to bot workspace via process manager
    try {
      processManager.deploySkill(bot.name, skill_name, skillContent);
      res.json({ success: true, bot_id: botId, skill_name });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(404).json({ error: message });
    }
  } catch (error) {
    console.error('Error deploying skill:', error);
    res.status(500).json({ error: 'Failed to deploy skill' });
  }
});

// DELETE /api/fleet/:id/skills/:skillName — Remove skill from bot
app.delete('/api/fleet/:id/skills/:skillName', async (req: Request, res: Response) => {
  try {
    const botId = req.params.id!;
    const skillName = req.params.skillName;

    if (!skillName) return res.status(400).json({ error: 'skillName is required' });

    const bot = await apiClient.getBot(botId);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    const botProcess = processManager.getBot(bot.name);
    if (!botProcess) {
      return res.status(404).json({ error: 'Bot process not found' });
    }

    const skillDir = path.join(botProcess.config.workspaceDir, 'workspace', 'skills', skillName);
    if (!fs.existsSync(skillDir)) {
      return res.status(404).json({ error: `Skill "${skillName}" not deployed to this bot` });
    }

    // Remove skill directory
    fs.rmSync(skillDir, { recursive: true, force: true });
    console.log(`[CMD] Skill "${skillName}" removed from "${bot.name}"`);

    res.status(204).send();
  } catch (error) {
    console.error('Error removing skill:', error);
    res.status(500).json({ error: 'Failed to remove skill' });
  }
});

// POST /api/fleet/:id/chat — Test chat with bot's soul via LLM
app.post('/api/fleet/:id/chat', async (req: Request, res: Response) => {
  try {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    const bot = await apiClient.getBot(req.params.id!);
    if (!bot) return res.status(404).json({ error: 'Bot not found' });

    // Read soul content
    const soulPath = path.join(process.cwd(), 'souls', `${bot.soul_name}.md`);
    const soulContent = fs.existsSync(soulPath)
      ? fs.readFileSync(soulPath, 'utf-8')
      : `You are ${bot.name}, a helpful assistant.`;

    // Resolve provider from bot metadata or use default
    const providerName = (bot.metadata?.provider as string) || 'glm-flash';
    const preset = resolveProvider(providerName);

    if (!preset) {
      return res.status(400).json({
        error: `No configured provider "${providerName}". Configure API keys in .env.`,
      });
    }

    // Build enriched system prompt: soul + identity + tools
    const availableTools = mcpHub.listTools(bot.client_id);
    const toolsSummary = availableTools.length > 0
      ? `\n\n## Available Tools (MCP)\n\nYou have access to ${availableTools.length} tool(s) via MCP servers:\n${availableTools.map(t => `- **${t.name}** (${t.server}): ${t.description || 'no description'}`).join('\n')}\n\nWhen the user asks you to do something that matches a tool capability, describe which tool you would use and how. You cannot call tools directly in chat — but you can explain your plan.`
      : '';

    const systemPrompt = `${soulContent}

## Identity

You are **${bot.name}**, a bot in the PicoArmy fleet. You are powered by **${(bot.metadata?.model as string) || preset.model}** via the **${preset.name}** provider.

- Fleet role: ${bot.is_permanent ? 'Permanent crew member' : 'Ephemeral worker'}
- Soul template: ${bot.soul_name}
- Status: online${toolsSummary}`;

    // Build messages array
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history if provided
    if (Array.isArray(history)) {
      for (const msg of history.slice(-20)) { // Cap at last 20 messages
        if (msg.role && msg.content) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    messages.push({ role: 'user', content: message });

    // Call LLM (OpenAI-compatible)
    const llmResponse = await fetch(`${preset.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${preset.apiKey}`,
      },
      body: JSON.stringify({
        model: (bot.metadata?.model as string) || preset.model,
        messages,
        max_completion_tokens: 32768,
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error(`[Chat] LLM error (${llmResponse.status}):`, errorText);
      return res.status(502).json({
        error: `LLM provider returned ${llmResponse.status}`,
        detail: errorText.slice(0, 200),
      });
    }

    const data = await llmResponse.json() as {
      choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
    };
    const msg = data.choices?.[0]?.message;
    // GLM reasoning models put output in reasoning_content, content may be empty
    const reply = msg?.content || msg?.reasoning_content || '(no response)';

    res.json({
      reply,
      model: (bot.metadata?.model as string) || preset.model,
      provider: preset.name,
    });
  } catch (error) {
    console.error('Error in chat:', error);
    res.status(500).json({ error: 'Chat failed' });
  }
});

// ── Commander Meta Chat ──────────────────────────────────────────

// Reusable helpers for tool execution (shared between REST routes & commander chat)
async function getEnrichedBots() {
  const dbBots = await apiClient.getBots();
  const fleetStatus = processManager.getFleetStatus();
  return dbBots.map((dbBot) => {
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
}

// OpenAI function calling tool definitions for commander chat
const commanderTools = [
  {
    type: 'function' as const,
    function: {
      name: 'fleet_list',
      description: 'List all bots in the fleet with their current status, uptime, and memory usage',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'fleet_spawn',
      description: 'Spawn a new bot in the fleet',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Unique bot name (alphanumeric + hyphens)' },
          soul_name: { type: 'string', description: 'Soul template to deploy (e.g. assistant, seo-writer, support-agent)' },
          provider: { type: 'string', description: 'LLM provider preset (e.g. groq, glm-flash, minimax)' },
          is_permanent: { type: 'boolean', description: 'Whether the bot persists across restarts (default: true)' },
        },
        required: ['name', 'soul_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'fleet_destroy',
      description: 'Destroy/remove a bot from the fleet by name',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the bot to destroy' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'fleet_restart',
      description: 'Restart a bot by name (kills process and respawns)',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the bot to restart' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'fleet_status',
      description: 'Get detailed process manager status (PIDs, health, memory per bot)',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'soul_list',
      description: 'List available soul templates that can be deployed to bots',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'soul_deploy',
      description: 'Deploy a soul template to a specific bot',
      parameters: {
        type: 'object',
        properties: {
          bot_name: { type: 'string', description: 'Name of the bot' },
          soul_name: { type: 'string', description: 'Soul template name to deploy' },
        },
        required: ['bot_name', 'soul_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'skill_list',
      description: 'List available skills that can be deployed to bots',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'skill_deploy',
      description: 'Deploy a skill to a specific bot',
      parameters: {
        type: 'object',
        properties: {
          bot_name: { type: 'string', description: 'Name of the bot' },
          skill_name: { type: 'string', description: 'Skill name to deploy' },
        },
        required: ['bot_name', 'skill_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'provider_list',
      description: 'List available LLM provider presets with their models and configuration status',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'swarm_list',
      description: 'List available swarm templates (pre-configured bot groups with different models per role)',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'swarm_deploy',
      description: 'Deploy a swarm — spawns a coordinated group of bots from a template, each with the right model for their role',
      parameters: {
        type: 'object',
        properties: {
          swarm_name: { type: 'string', description: 'Swarm template name (e.g. seo-team, support-team, research-team)' },
          client_id: { type: 'string', description: 'Optional client ID to scope all bots (e.g. acme)' },
          name_prefix: { type: 'string', description: 'Optional name prefix for all bots (default: swarm name)' },
        },
        required: ['swarm_name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'swarm_destroy',
      description: 'Destroy all bots in a swarm by their shared name prefix',
      parameters: {
        type: 'object',
        properties: {
          name_prefix: { type: 'string', description: 'Name prefix of the swarm bots to destroy (e.g. seo-team)' },
        },
        required: ['name_prefix'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'bot_task',
      description: 'Send a task to a bot and get the result. Calls the bot\'s LLM with its soul personality and returns the response. Use this to assign work to bots and collect results.',
      parameters: {
        type: 'object',
        properties: {
          bot_name: { type: 'string', description: 'Name of the bot to send the task to' },
          task: { type: 'string', description: 'The task or question for the bot to work on' },
        },
        required: ['bot_name', 'task'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_search',
      description: 'Search the web for current information. Returns titles, snippets, URLs, and dates. Use for news, research, current events, or any query requiring up-to-date information.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (be specific for best results)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'mcp_call',
      description: 'Call an MCP tool connected to the fleet hub (vision analysis, image/video generation, TTS). Use mcp_list to see available tools.',
      parameters: {
        type: 'object',
        properties: {
          tool_name: { type: 'string', description: 'MCP tool name (e.g. analyze_image, ui_to_artifact)' },
          arguments: { type: 'object', description: 'Arguments for the tool call (varies per tool)' },
        },
        required: ['tool_name', 'arguments'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'mcp_list',
      description: 'List all connected MCP tools with their descriptions and input schemas',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'soul_create',
      description: 'AI-generate a soul using proven prompting techniques (role anchoring, behavioral constraints, few-shot tone calibration, chain-of-thought directives, tool-aware instructions, memory protocol, anti-patterns). Saves to souls/ directory.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Soul template name (alphanumeric + hyphens, e.g. legal-advisor)' },
          description: { type: 'string', description: 'What the bot does (e.g. "Provides legal advice for startups")' },
          role: { type: 'string', description: 'Role/profession (e.g. "legal advisor", "data analyst", "fitness coach")' },
          style: { type: 'string', description: 'Communication style (e.g. "professional", "casual", "technical", "friendly")' },
        },
        required: ['name', 'description', 'role'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'soul_preview',
      description: 'Preview an AI-generated soul (same techniques as soul_create) without saving. Returns full SOUL.md content for user review.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'What the bot does (e.g. "Provides legal advice for startups")' },
          role: { type: 'string', description: 'Role/profession (e.g. "legal advisor", "data analyst", "fitness coach")' },
          style: { type: 'string', description: 'Communication style (e.g. "professional", "casual", "technical", "friendly")' },
        },
        required: ['description', 'role'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'deploy_team',
      description: 'Deploy a custom team of bots for any task. AI-generates a unique soul for each role using proven prompting techniques, picks optimal providers, spawns all bots. Use instead of swarm_deploy when you need a custom team composition.',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'What the team needs to accomplish (used as context in each soul)' },
          team_name: { type: 'string', description: 'Name prefix for all bots (e.g. "pricing-team", "content-team")' },
          bots: {
            type: 'array',
            description: 'Bot definitions for the team. Each bot gets an AI-generated soul.',
            items: {
              type: 'object',
              properties: {
                role: { type: 'string', description: 'Role name (e.g. "researcher", "writer", "analyst", "reviewer")' },
                description: { type: 'string', description: 'What this bot does in the team (used to generate its soul)' },
                provider: { type: 'string', description: 'LLM provider preset (e.g. groq-scout, groq-kimi). Spread across models to avoid rate limits.' },
                style: { type: 'string', description: 'Communication style for this bot (e.g. "technical", "creative", "formal")' },
              },
              required: ['role', 'description'],
            },
          },
        },
        required: ['task', 'team_name', 'bots'],
      },
    },
  },
];

// AI-generate a soul template using Commander's LLM
async function generateSoulContent(description: string, role: string, style?: string): Promise<string> {
  const providerName = process.env.COMMANDER_PROVIDER || 'groq';
  const modelName = process.env.COMMANDER_MODEL || 'llama-3.3-70b-versatile';
  const preset = resolveProvider(providerName);

  if (!preset) {
    throw new Error(`Soul generation failed: Commander provider "${providerName}" not configured`);
  }

  // ── Expert system prompt with proven prompting techniques ──
  const systemPrompt = `You are an AI Prompt Architect specializing in agent personality design.

You use these proven techniques to craft high-quality agent personalities:

1. **Role Anchoring** — Define WHO the agent is with a vivid identity, not just what it does.
   Use first-person framing: "You are..." followed by a specific archetype, not a generic label.

2. **Behavioral Constraints** — Include explicit "NEVER" and "ALWAYS" rules.
   Constraints prevent hallucination, scope creep, and off-brand behavior.

3. **Few-Shot Tone Calibration** — Include 2-3 example responses showing the desired voice.
   This grounds the personality far better than adjective lists.

4. **Chain-of-Thought Directives** — Tell the agent HOW to think, not just what to say.
   "Before answering, consider: ..." or "Think step-by-step about..."

5. **Tool-Aware Instructions** — If the agent has tools, describe WHEN and WHY to use each.
   "Use web_search when the user asks about current events, not from memory."

6. **Memory & Context Protocol** — Tell the agent what to remember, what to forget.
   "Save key user preferences to memory. Never store passwords or sensitive data."

7. **Escalation Rules** — Define when the agent should say "I can't" vs attempt a task.
   Clear boundaries prevent both overconfidence and excessive hedging.

8. **Anti-Patterns** — List specific BAD behaviors to avoid.
   "Don't start every response with 'Great question!' or use filler phrases."

OUTPUT FORMAT: Markdown document. No code fences, no preamble. Start with # heading.

SECTIONS (all required):
# {Title} — Vivid role name, not generic
{2-3 sentence identity anchoring paragraph. First person "You are..." with archetype.}

## Voice & Personality
{3-5 specific personality traits. Each one sentence with an example behavior.}

## Example Responses
{2-3 short example exchanges showing the agent's voice. Format: User: ... / You: ...}

## Core Capabilities
{4-6 concrete skills. Each starts with an action verb.}

## Decision Framework
{How the agent should think. Step-by-step reasoning rules for common scenarios.}

## Tool Usage
{When to use available tools. If no tools specified, say "Use available tools proactively."}

## Memory Protocol
{What to remember across conversations. What NOT to store.}

## Boundaries & Escalation
{Clear "I can" vs "I can't" rules. When to escalate. What to refuse.}

## Anti-Patterns (NEVER DO)
{4-6 specific bad behaviors to avoid. Each starts with "Never..."}`;

  const styleHint = style ? `\n- Communication style: ${style}` : '';

  const userPrompt = `Create a SOUL.md for this picobot agent:

- **Role:** ${role}
- **Purpose:** ${description}${styleHint}

Apply all techniques from your training. Make the personality distinctive and the instructions actionable.`;

  const llmResponse = await fetch(`${preset.apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${preset.apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_completion_tokens: 3072,
      temperature: 0.7,
    }),
  });

  if (!llmResponse.ok) {
    const errorText = await llmResponse.text();
    throw new Error(`LLM error (${llmResponse.status}): ${errorText.slice(0, 200)}`);
  }

  const data = await llmResponse.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('LLM returned empty response');
  }

  // Clean up any markdown code fences if the LLM ignored instructions
  let cleaned = content.trim();
  if (cleaned.startsWith('```markdown') || cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:markdown)?\n/, '').replace(/\n```$/, '');
  }

  return cleaned.trim();
}

// Execute a commander tool call
async function executeCommanderTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case 'fleet_list': {
      const bots = await getEnrichedBots();
      return JSON.stringify(bots.map(b => ({
        id: b.id, name: b.name, status: b.status, soul: b.soul_name,
        provider: b.metadata?.provider || 'default',
        uptime_s: b.uptime_seconds, memory_mb: b.memory_mb,
        permanent: b.is_permanent, pid: b.pid,
      })));
    }
    case 'fleet_spawn': {
      const spawnName = args.name as string;
      const soulName = args.soul_name as string;
      const provider = args.provider as string | undefined;
      // Coerce is_permanent — LLMs sometimes send string "true"/"false" instead of boolean
      const isPermanent = args.is_permanent === false || args.is_permanent === 'false' ? false : true;

      const preset = provider ? resolveProvider(provider) : undefined;
      const spawnModel = preset?.model || process.env.PICOBOT_MODEL || 'glm-4.7-flash';

      const dbBot = await apiClient.createBot({
        name: spawnName, soul_name: soulName,
        is_permanent: isPermanent,
        metadata: {
          ...(provider ? { provider } : {}),
          model: spawnModel,
        },
      });

      const config: BotConfig = {
        name: spawnName, soulName, isPermanent, ttlSeconds: null,
        openaiApiKey: preset?.apiKey || process.env.OPENAI_API_KEY || '',
        openaiApiBase: preset?.apiBase || process.env.OPENAI_API_BASE || '',
        model: spawnModel,
        telegramBotToken: '', telegramAllowFrom: '', workspaceDir: '',
      };
      if (provider) config.providerPreset = provider;

      try { await processManager.spawnBot(config); } catch (e) {
        console.warn(`[CMD Chat] Spawn process failed for "${spawnName}":`, e);
      }
      broadcastSSE('fleet:spawn', dbBot);
      return JSON.stringify({ success: true, bot: { id: dbBot.id, name: spawnName, soul: soulName } });
    }
    case 'fleet_destroy': {
      const botName = args.name as string;
      const dbBots = await apiClient.getBots();
      const bot = dbBots.find(b => b.name === botName);
      if (!bot) return JSON.stringify({ error: `Bot "${botName}" not found` });

      try { await processManager.destroyBot(botName); } catch { /* ok */ }
      await apiClient.deleteBot(bot.id);
      broadcastSSE('fleet:destroy', { id: bot.id });
      return JSON.stringify({ success: true, destroyed: botName });
    }
    case 'fleet_restart': {
      const rName = args.name as string;
      const dbBots = await apiClient.getBots();
      const bot = dbBots.find(b => b.name === rName);
      if (!bot) return JSON.stringify({ error: `Bot "${rName}" not found` });

      try { await processManager.destroyBot(rName); } catch { /* ok */ }
      const preset = bot.metadata?.provider ? resolveProvider(bot.metadata.provider as string) : undefined;
      const rConfig: BotConfig = {
        name: rName, soulName: bot.soul_name, isPermanent: bot.is_permanent,
        ttlSeconds: bot.ttl_seconds ?? null,
        openaiApiKey: preset?.apiKey || process.env.OPENAI_API_KEY || '',
        openaiApiBase: preset?.apiBase || process.env.OPENAI_API_BASE || '',
        model: (bot.metadata?.model as string) || preset?.model || process.env.PICOBOT_MODEL || 'glm-4.7-flash',
        telegramBotToken: (bot.metadata?.telegram_token as string) || '',
        telegramAllowFrom: (bot.metadata?.telegram_allow_from as string) || '',
        workspaceDir: '',
      };
      if (bot.metadata?.provider) rConfig.providerPreset = bot.metadata.provider as string;
      if (bot.client_id) rConfig.clientId = bot.client_id;

      try { await processManager.spawnBot(rConfig); } catch (e) {
        console.warn(`[CMD Chat] Restart spawn failed for "${rName}":`, e);
      }
      return JSON.stringify({ success: true, restarted: rName });
    }
    case 'fleet_status': {
      return JSON.stringify(processManager.getFleetStatus());
    }
    case 'soul_list': {
      const soulsDir = path.join(process.cwd(), 'souls');
      if (!fs.existsSync(soulsDir)) return JSON.stringify([]);
      const souls = fs.readdirSync(soulsDir).filter(f => f.endsWith('.md')).map(f => {
        const content = fs.readFileSync(path.join(soulsDir, f), 'utf-8');
        const match = content.match(/^#\s+(.+)/m);
        return { name: f.replace('.md', ''), description: match ? match[1] : f.replace('.md', '') };
      });
      return JSON.stringify(souls);
    }
    case 'soul_deploy': {
      const botName = args.bot_name as string;
      const soulName = args.soul_name as string;
      const soulPath = path.join(process.cwd(), 'souls', `${soulName}.md`);
      if (!fs.existsSync(soulPath)) return JSON.stringify({ error: `Soul "${soulName}" not found` });
      const content = fs.readFileSync(soulPath, 'utf-8');
      try { processManager.deploySoul(botName, content); } catch { /* ok */ }
      return JSON.stringify({ success: true, deployed: soulName, to: botName });
    }
    case 'skill_list': {
      const skillsDir = path.join(process.cwd(), 'skills');
      if (!fs.existsSync(skillsDir)) return JSON.stringify([]);
      const skills = fs.readdirSync(skillsDir).filter(f => {
        return fs.statSync(path.join(skillsDir, f)).isDirectory();
      }).map(name => {
        const mdPath = path.join(skillsDir, name, 'SKILL.md');
        let desc = name;
        if (fs.existsSync(mdPath)) {
          const c = fs.readFileSync(mdPath, 'utf-8');
          const m = c.match(/^#\s+(.+)/m);
          if (m?.[1]) desc = m[1];
        }
        return { name, description: desc };
      });
      return JSON.stringify(skills);
    }
    case 'skill_deploy': {
      const botName = args.bot_name as string;
      const skillName = args.skill_name as string;
      const skillPath = path.join(process.cwd(), 'skills', skillName, 'SKILL.md');
      if (!fs.existsSync(skillPath)) return JSON.stringify({ error: `Skill "${skillName}" not found` });
      const content = fs.readFileSync(skillPath, 'utf-8');
      try { processManager.deploySkill(botName, skillName, content); } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
      }
      return JSON.stringify({ success: true, deployed: skillName, to: botName });
    }
    case 'provider_list': {
      const presets = getProviderPresets().map(p => ({
        name: p.name, model: p.model, format: p.format,
        description: p.description, configured: !!p.apiKey,
      }));
      return JSON.stringify(presets);
    }
    case 'swarm_list': {
      const swarmsDir = path.join(process.cwd(), 'swarms');
      if (!fs.existsSync(swarmsDir)) return JSON.stringify([]);
      const swarms = fs.readdirSync(swarmsDir).filter(f => f.endsWith('.json')).map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(swarmsDir, f), 'utf-8'));
          return { name: data.name, description: data.description, botCount: data.bots?.length || 0, bots: data.bots };
        } catch { return null; }
      }).filter(Boolean);
      return JSON.stringify(swarms);
    }
    case 'swarm_deploy': {
      const swarmName = args.swarm_name as string;
      const clientId = args.client_id as string | undefined;
      const prefix = (args.name_prefix as string) || swarmName;
      const swarmPath = path.join(process.cwd(), 'swarms', `${swarmName}.json`);
      if (!fs.existsSync(swarmPath)) return JSON.stringify({ error: `Swarm template "${swarmName}" not found` });

      const template = JSON.parse(fs.readFileSync(swarmPath, 'utf-8'));
      const results: Array<{ name: string; role: string; soul: string; provider: string; status: string }> = [];
      const createdBotIds: string[] = [];

      for (const bot of template.bots) {
        const botName = `${prefix}-${bot.role}`;
        const soulName = bot.soul || 'assistant';
        const preset = resolveProvider(bot.provider);

        try {
          // Create DB record first (like fleet_spawn does)
          const dbBot = await apiClient.createBot({
            name: botName, soul_name: soulName, is_permanent: false,
            ...(clientId ? { client_id: clientId } : {}),
            metadata: { provider: bot.provider, model: preset?.model || 'glm-4.7-flash', swarm: swarmName, role: bot.role },
          });
          createdBotIds.push(dbBot.id);

          const botConfig: BotConfig = {
            name: botName,
            soulName,
            isPermanent: false,
            ttlSeconds: null,
            openaiApiKey: preset?.apiKey || process.env.OPENAI_API_KEY || '',
            openaiApiBase: preset?.apiBase || process.env.OPENAI_API_BASE || '',
            model: preset?.model || 'glm-4.7-flash',
            telegramBotToken: '',
            telegramAllowFrom: '',
            workspaceDir: '',
          };
          if (bot.provider) botConfig.providerPreset = bot.provider;
          if (clientId) botConfig.clientId = clientId;

          await processManager.spawnBot(botConfig);
          results.push({ name: botName, role: bot.role, soul: soulName, provider: bot.provider, status: 'spawned' });
          broadcastSSE('fleet:spawn', dbBot);
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          console.error(`[swarm_deploy] Failed to spawn ${botName}:`, errorMsg);
          results.push({ name: botName, role: bot.role, soul: soulName, provider: bot.provider, status: `error: ${errorMsg}` });

          // Rollback: delete all successfully created bots
          console.warn(`[swarm_deploy] Rolling back swarm "${swarmName}" due to error`);
          for (const id of createdBotIds) {
            try {
              const existingBot = await apiClient.getBot(id);
              if (existingBot) {
                try { await processManager.destroyBot(existingBot.name); } catch { /* ok */ }
                await apiClient.deleteBot(id);
              }
            } catch (rollbackErr) {
              console.error(`[swarm_deploy] Rollback failed for bot ${id}:`, rollbackErr);
            }
          }
          return JSON.stringify({ error: `Swarm deployment failed: ${errorMsg}`, partialResults: results });
        }
      }
      return JSON.stringify({ swarm: swarmName, prefix, bots: results });
    }
    case 'swarm_destroy': {
      const prefix = args.name_prefix as string;
      const dbBots = await apiClient.getBots();
      const matching = dbBots.filter(b => b.name.startsWith(prefix));
      if (matching.length === 0) return JSON.stringify({ error: `No bots found with prefix "${prefix}"`, destroyed: [] });

      const destroyed: string[] = [];
      for (const bot of matching) {
        try {
          try { await processManager.destroyBot(bot.name); } catch { /* process may not exist */ }
          await apiClient.deleteBot(bot.id);
          destroyed.push(bot.name);
          broadcastSSE('fleet:destroy', { id: bot.id });
        } catch (e) {
          console.warn(`[Swarm] Failed to destroy ${bot.name}:`, e);
        }
      }
      return JSON.stringify({ prefix, destroyed, count: destroyed.length });
    }
    case 'bot_task': {
      const botName = args.bot_name as string;
      const task = args.task as string;

      // Find bot in DB
      const dbBots = await apiClient.getBots();
      const bot = dbBots.find(b => b.name === botName);
      if (!bot) return JSON.stringify({ error: `Bot "${botName}" not found` });

      // Resolve bot's provider
      const botProvider = bot.metadata?.provider as string | undefined;
      const botPreset = botProvider ? resolveProvider(botProvider) : null;
      const apiBase = botPreset?.apiBase || process.env.OPENAI_API_BASE || '';
      const apiKey = botPreset?.apiKey || process.env.OPENAI_API_KEY || '';
      const model = (bot.metadata?.model as string) || botPreset?.model || process.env.PICOBOT_MODEL || 'glm-4.7-flash';

      if (!apiBase || !apiKey) {
        return JSON.stringify({ error: `Bot "${botName}" has no LLM provider configured` });
      }

      // Load bot's soul as system prompt
      let soulContent = 'You are a helpful assistant.';
      const soulPath = path.join(process.cwd(), 'souls', `${bot.soul_name}.md`);
      if (fs.existsSync(soulPath)) {
        soulContent = fs.readFileSync(soulPath, 'utf-8');
      }
      // Also check bot's workspace soul
      const workspaceSoul = path.join('/data/bots', botName, 'workspace', 'SOUL.md');
      if (fs.existsSync(workspaceSoul)) {
        soulContent = fs.readFileSync(workspaceSoul, 'utf-8');
      }

      console.log(`[bot_task] Sending task to "${botName}" via ${botProvider || 'default'} (${model})`);

      const taskResponse = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: soulContent },
            { role: 'user', content: task },
          ],
          max_completion_tokens: 4096,
        }),
      });

      if (!taskResponse.ok) {
        const errText = await taskResponse.text();
        console.error(`[bot_task] LLM error for "${botName}":`, errText.slice(0, 200));
        return JSON.stringify({ error: `Bot "${botName}" LLM error: ${errText.slice(0, 150)}`, bot: botName, provider: botProvider });
      }

      const taskData = await taskResponse.json() as {
        choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
        usage?: { total_tokens?: number };
      };
      const taskMsg = taskData.choices?.[0]?.message;
      const result = taskMsg?.content || taskMsg?.reasoning_content || '(no response)';
      const tokens = taskData.usage?.total_tokens || 0;

      console.log(`[bot_task] "${botName}" responded (${tokens} tokens)`);

      return JSON.stringify({
        bot: botName,
        provider: botProvider || 'default',
        model,
        result,
        tokens,
      });
    }
    case 'web_search': {
      const query = args.query as string;
      if (!query) return JSON.stringify({ error: 'query is required' });

      // Try MiniMax Coding Plan Search first (~1s latency)
      const minimaxKey = process.env.MINIMAX_API_KEY;
      if (minimaxKey) {
        try {
          const searchResp = await fetch('https://api.minimax.io/v1/coding_plan/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${minimaxKey}`,
              'MM-API-Source': 'PicoArmy',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ q: query }),
          });

          if (searchResp.ok) {
            const searchData = await searchResp.json() as {
              base_resp?: { status_code?: number };
              organic?: Array<{ title?: string; snippet?: string; link?: string; date?: string }>;
              related_searches?: Array<{ query?: string }>;
            };

            if (searchData.organic && searchData.organic.length > 0) {
              const results = searchData.organic.slice(0, 8).map((r, i) => ({
                rank: i + 1,
                title: r.title || '',
                snippet: r.snippet || '',
                url: r.link || '',
                date: r.date || '',
              }));
              const related = searchData.related_searches?.slice(0, 3).map(r => r.query) || [];
              console.log(`[web_search] MiniMax returned ${results.length} results for "${query}"`);
              return JSON.stringify({ source: 'minimax', query, results, related_searches: related });
            }
          }
        } catch (e) {
          console.error('[web_search] MiniMax search failed:', e instanceof Error ? e.message : String(e));
        }
      }

      // Fallback: GLM web_search tool (uses coding plan key, ~10s latency)
      const glmKey = process.env.GLM_CODING_API_KEY || process.env.OPENAI_API_KEY;
      const glmBase = process.env.GLM_CODING_API_BASE || 'https://api.z.ai/api/coding/paas/v4';
      if (glmKey) {
        try {
          const glmResp = await fetch(`${glmBase}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${glmKey}`,
            },
            body: JSON.stringify({
              model: process.env.GLM_CODING_MODEL || 'glm-4.7',
              messages: [{ role: 'user', content: `Search for the latest information about: ${query}` }],
              tools: [{ type: 'web_search', web_search: { enable: true } }],
              max_tokens: 2048,
            }),
          });

          if (glmResp.ok) {
            const glmData = await glmResp.json() as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            const content = glmData.choices?.[0]?.message?.content || '';
            if (content) {
              console.log(`[web_search] GLM fallback returned ${content.length} chars for "${query}"`);
              return JSON.stringify({ source: 'glm-web-search', query, content: content.slice(0, 8000) });
            }
          }
        } catch (e) {
          console.error('[web_search] GLM fallback failed:', e instanceof Error ? e.message : String(e));
        }
      }

      return JSON.stringify({ error: 'All search providers failed', query });
    }
    case 'mcp_call': {
      const toolName = args.tool_name as string;
      const toolArgs = (args.arguments as Record<string, unknown>) || {};

      try {
        const result = await mcpHub.callTool({
          toolName,
          arguments: toolArgs,
          botName: 'commander',
        });

        // Extract text content from MCP result
        const textParts = result.content
          .filter(c => c.type === 'text' && c.text)
          .map(c => c.text);
        const combined = textParts.join('\n');

        // Truncate large results to fit in tool response
        if (combined.length > 10000) {
          return JSON.stringify({ tool: toolName, result: combined.slice(0, 10000), truncated: true });
        }
        return JSON.stringify({ tool: toolName, result: combined });
      } catch (e) {
        return JSON.stringify({ error: e instanceof Error ? e.message : String(e), tool: toolName });
      }
    }
    case 'mcp_list': {
      const tools = mcpHub.listTools();
      return JSON.stringify(tools.map(t => ({
        name: t.name,
        description: t.description.slice(0, 200),
        server: t.server,
      })));
    }
    case 'soul_preview': {
      const desc = args.description as string;
      const roleStr = args.role as string;
      const styleStr = args.style as string | undefined;

      const content = await generateSoulContent(desc, roleStr, styleStr);
      return JSON.stringify({ content, preview: true });
    }
    case 'soul_create': {
      const soulName = args.name as string;
      const desc = args.description as string;
      const roleStr = args.role as string;
      const styleStr = args.style as string | undefined;

      // Validate name
      if (!/^[a-zA-Z0-9-]+$/.test(soulName)) {
        return JSON.stringify({ error: 'name must be alphanumeric with hyphens only' });
      }

      const soulsDir = path.join(process.cwd(), 'souls');
      if (!fs.existsSync(soulsDir)) {
        fs.mkdirSync(soulsDir, { recursive: true });
      }

      const soulPath = path.join(soulsDir, `${soulName}.md`);
      if (fs.existsSync(soulPath)) {
        return JSON.stringify({ error: `Soul "${soulName}" already exists` });
      }

      // Generate soul content
      const content = await generateSoulContent(desc, roleStr, styleStr);

      // Save to file
      fs.writeFileSync(soulPath, content, 'utf-8');
      console.log(`[CMD] Soul "${soulName}" created via AI generation`);

      return JSON.stringify({ success: true, name: soulName, path: soulPath, preview: content.slice(0, 300) });
    }
    case 'deploy_team': {
      const task = args.task as string;
      const teamName = args.team_name as string;
      const botDefs = args.bots as Array<{ role: string; description: string; provider?: string; style?: string }>;

      if (!task || !teamName || !botDefs || botDefs.length === 0) {
        return JSON.stringify({ error: 'task, team_name, and bots[] are required' });
      }
      if (!/^[a-zA-Z0-9-]+$/.test(teamName)) {
        return JSON.stringify({ error: 'team_name must be alphanumeric with hyphens only' });
      }

      const soulsDir = path.join(process.cwd(), 'souls');
      if (!fs.existsSync(soulsDir)) fs.mkdirSync(soulsDir, { recursive: true });

      const deployed: Array<{ name: string; role: string; provider: string; model: string; soul_preview: string }> = [];
      const createdBotIds: string[] = [];

      console.log(`[deploy_team] Deploying team "${teamName}" (${botDefs.length} bots) for: ${task.slice(0, 100)}`);

      for (const botDef of botDefs) {
        const botName = `${teamName}-${botDef.role}`;
        const soulName = botName;
        const providerName = botDef.provider || 'groq-scout';
        const preset = resolveProvider(providerName);
        const model = preset?.model || process.env.PICOBOT_MODEL || 'glm-4.7-flash';

        try {
          // 1. Generate AI soul with team context
          const soulDesc = `${botDef.description}. You are part of the "${teamName}" team working on: ${task}`;
          const soulContent = await generateSoulContent(soulDesc, botDef.role, botDef.style);
          const soulPath = path.join(soulsDir, `${soulName}.md`);
          fs.writeFileSync(soulPath, soulContent, 'utf-8');
          console.log(`[deploy_team] Generated soul "${soulName}"`);

          // 2. Create DB record
          const dbBot = await apiClient.createBot({
            name: botName,
            soul_name: soulName,
            is_permanent: false,
            metadata: {
              provider: providerName,
              model,
              team: teamName,
              role: botDef.role,
            },
          });
          createdBotIds.push(dbBot.id);

          // 3. Spawn process
          const config: BotConfig = {
            name: botName,
            soulName,
            isPermanent: false,
            ttlSeconds: null,
            openaiApiKey: preset?.apiKey || process.env.OPENAI_API_KEY || '',
            openaiApiBase: preset?.apiBase || process.env.OPENAI_API_BASE || '',
            model,
            telegramBotToken: '',
            telegramAllowFrom: '',
            workspaceDir: '',
            providerPreset: providerName,
          };

          try {
            await processManager.spawnBot(config);
          } catch (spawnErr) {
            console.warn(`[deploy_team] Spawn failed for "${botName}":`, spawnErr instanceof Error ? spawnErr.message : String(spawnErr));
          }

          broadcastSSE('fleet:spawn', dbBot);
          deployed.push({
            name: botName,
            role: botDef.role,
            provider: providerName,
            model,
            soul_preview: soulContent.split('\n').slice(0, 3).join(' ').slice(0, 200),
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[deploy_team] Failed to deploy "${botName}":`, errMsg);

          // Rollback: destroy all previously created bots
          console.log(`[deploy_team] Rolling back ${createdBotIds.length} bot(s)...`);
          for (const id of createdBotIds) {
            try {
              const botInfo = deployed.find(d => true); // any deployed bot
              if (botInfo) processManager.destroyBot(botInfo.name);
              await apiClient.deleteBot(id);
            } catch { /* best effort cleanup */ }
          }

          return JSON.stringify({
            error: `Team deployment failed at "${botName}": ${errMsg}`,
            partial: deployed,
          });
        }
      }

      console.log(`[deploy_team] Team "${teamName}" deployed: ${deployed.map(d => d.name).join(', ')}`);
      return JSON.stringify({
        team: teamName,
        task: task.slice(0, 200),
        bots: deployed,
      });
    }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[executeCommanderTool] Error in ${name}:`, message);
    return JSON.stringify({ error: `Tool execution failed: ${message}` });
  }
}

// POST /api/commander/chat — Meta chat with fleet management tools
app.post('/api/commander/chat', async (req: Request, res: Response) => {
  let conversationHistory: Array<{ role: string; content: string }> = [];
  try {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    // Resolve commander LLM provider
    const providerName = process.env.COMMANDER_PROVIDER || 'groq';
    const modelName = process.env.COMMANDER_MODEL || 'llama-3.3-70b-versatile';
    const preset = resolveProvider(providerName);
    if (!preset) {
      return res.status(500).json({ error: `Commander provider "${providerName}" not configured` });
    }

    // Build system prompt with live fleet state
    const bots = await getEnrichedBots();
    const souls = (() => {
      const dir = path.join(process.cwd(), 'souls');
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
    })();
    const providers = getProviderPresets().filter(p => !!p.apiKey).map(p => p.name);

    // Load available swarm templates
    const swarmSummary = (() => {
      const dir = path.join(process.cwd(), 'swarms');
      if (!fs.existsSync(dir)) return 'none';
      return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
        try {
          const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
          return `${d.name} (${d.bots?.length || 0} bots: ${d.bots?.map((b: { role: string }) => b.role).join(', ')})`;
        } catch { return null; }
      }).filter(Boolean).join(', ') || 'none';
    })();

    const systemPrompt = `You are the PicoArmy Fleet Commander — an AI assistant that manages a fleet of picobot agents.

## Current Fleet State
${bots.length === 0 ? 'No bots currently deployed.' : bots.map(b => `- **${b.name}** [${b.status}] soul=${b.soul_name} provider=${b.metadata?.provider || 'default'} uptime=${b.uptime_seconds || 0}s`).join('\n')}

## Available Resources
- Soul templates: ${souls.join(', ') || 'none'}
- LLM providers: ${providers.join(', ') || 'none configured'}
- Swarm templates: ${swarmSummary}

## Provider Strategy (pick the right one for the job)

SPEED-FIRST (free, Groq — $0, rate-limited per model):
- groq-scout     → Default for smart bots. 500K tok/day, 30K TPM. Best all-rounder.
- groq-maverick  → Multilingual bots (12 langs). 500K tok/day.
- groq-instant   → High-volume lightweight chat. 500K tok/day, 14.4K req/day.
- groq-qwen      → Burst workloads, Chinese language. 500K tok/day, 60 RPM.
- groq-kimi      → Deep reasoning, long analysis. 300K tok/day, 60 RPM.
- groq-70b       → Tool/function calling champion. Only 100K tok/day — use sparingly.

DEPTH-FIRST (coding plan, flat monthly — no rate limits):
- glm-flash      → Unlimited fallback, always works. Free tier.
- glm-coding     → Smarter GLM for heavy tasks. ~$3-15/mo.
- minimax        → Most capable model. Sustained workloads. ~$10-50/mo.

RULES:
- Default to groq-scout unless there's a reason not to.
- Use groq-instant for bots that mostly do lightweight chat or triage.
- Use groq-maverick if the bot needs non-English languages.
- Use groq-kimi for bots that need deep reasoning or analysis.
- Use glm-flash as fallback if Groq rate limits are a concern.
- Use glm-coding or minimax for bots with complex/sustained tasks.
- Spread swarm bots across different Groq models to avoid hitting one model's daily limit.

## Dynamic Teams (PREFERRED)
Use deploy_team to create custom bot teams for ANY task. YOU design the team composition:
- Choose roles based on the task (researcher, writer, analyst, reviewer, scraper, etc.)
- Pick providers: spread across Groq models to avoid rate limits
- Set communication style per role (technical, creative, formal, casual)
- Each bot gets an AI-generated soul automatically — no pre-made templates needed

deploy_team is the PREFERRED way to create teams. It generates unique, task-specific souls for each role.

Example: User asks "analyze competitor pricing"
→ deploy_team({
    task: "Analyze competitor pricing strategies",
    team_name: "pricing-team",
    bots: [
      { role: "scraper", description: "Extract pricing data from competitor sites", provider: "groq-scout" },
      { role: "analyst", description: "Compare pricing strategies and find patterns", provider: "groq-kimi", style: "analytical" },
      { role: "reporter", description: "Write executive summary with recommendations", provider: "groq-maverick", style: "professional" }
    ]
  })

CRITICAL — Result Chaining for Teams:
After deploying a team, you MUST chain results between bots in a PIPELINE:
1. Send the first bot (researcher/scraper) their task via bot_task
2. Wait for that result, then PASS IT as context to the next bot (analyst)
3. Wait for analyst result, then PASS IT to the next bot (writer/reporter)
Each bot_task prompt must include the ACTUAL OUTPUT from the previous bot.
NEVER send all bots their tasks simultaneously — results must flow through the pipeline.

Example pipeline:
  → bot_task("pricing-team-scraper", "Find pricing for X, Y, Z competitors...")
  → [get scraper output]
  → bot_task("pricing-team-analyst", "Based on this data: [scraper output]. Analyze patterns...")
  → [get analyst output]
  → bot_task("pricing-team-reporter", "Based on this analysis: [analyst output]. Write executive summary...")

## Swarm Templates (Pre-built)
For common team types, use swarm_deploy with pre-built templates. Use swarm_list to see available templates.
Only use swarm_deploy when a pre-built template matches the task (e.g., seo-team, research-team, support-team).
For anything else, use deploy_team.

## Orchestrating Bot Work
You can send tasks directly to bots and get results using bot_task. This is how you make bots DO work:

1. Deploy a swarm or spawn bots
2. Use bot_task to send each bot their SPECIFIC assignment
3. Collect results from each bot
4. Synthesize and present the combined output to the user

## Web Search
You have a built-in web_search tool for real-time information. Use it for news, research, current events.
If web_search returns no results, use mcp_call with tool_name "search" (DuckDuckGo MCP) as fallback.

## MCP Tools (Vision, Media, Search)
Use mcp_list to see available tools. These include:
- DuckDuckGo search (free, no API key) — tool: "search"
- Image/video analysis via Z.AI vision tools
- TTS, image/video generation via MiniMax (if connected)

## Workflow — Research Tasks
1. Use web_search to find current info on the topic
2. Deploy bots (swarm or individual) with the right providers
3. Use bot_task to send each bot their SPECIFIC assignment WITH the search results as context
4. Chain results SEQUENTIALLY: wait for bot A's output, then pass it into bot B's task prompt, then bot B's output into bot C's, etc.
5. Present the final synthesized report to the user

CRITICAL RULES FOR bot_task:
- Give SPECIFIC, detailed task prompts with CONTEXT — not vague ones
- When you have web search results, INCLUDE them in the bot's task prompt
- For the summarizer bot: ALWAYS pass the analyst's actual output in the task
- Include what format you want: "Write a 300-word analysis covering X, Y, Z"

Example workflow:
- User: "Research AI in healthcare"
- You: web_search({query: "AI healthcare 2025 latest developments"})
  → swarm_deploy(research-team)
  → bot_task(analyst, "Based on these search results: [web results here]. Write a detailed analysis...")
  → bot_task(summarizer, "Summarize the following research: [analyst output here]")
  → Present synthesized report to user

IMPORTANT: When you deploy a swarm for a task, ALWAYS follow up with bot_task calls to give each bot their assignment. Don't just deploy and stop — the user wants RESULTS.

## Your Role
You help the user manage their bot fleet AND orchestrate their work. You can:
- List, spawn, destroy, and restart bots
- Deploy soul templates and skills to bots
- Deploy and manage swarm teams
- **Send tasks to bots and collect results (bot_task)**
- Check fleet status and provider configuration
- Give strategic advice on fleet composition and provider selection

Be concise and action-oriented. When the user asks to do something, use your tools to do it — don't just describe what you would do. When deploying bots for a task, always follow through with bot_task to get actual results.`;

    // Build messages
    conversationHistory = [
      { role: 'system', content: systemPrompt },
    ];
    if (Array.isArray(history)) {
      for (const msg of history.slice(-20)) {
        if (msg.role && msg.content) {
          conversationHistory.push({ role: msg.role, content: msg.content });
        }
      }
    }
    conversationHistory.push({ role: 'user', content: message });
    const messages = conversationHistory;

    // Tool execution loop (max 5 iterations)
    const toolCallsLog: Array<{ tool: string; args: Record<string, unknown>; result: string }> = [];

    for (let i = 0; i < 5; i++) {
      const llmBody: Record<string, unknown> = {
        model: modelName,
        messages,
        max_completion_tokens: 4096,
      };

      // Only include tools on iterations where we haven't exhausted them
      if (i < 4) {
        llmBody.tools = commanderTools;
        llmBody.tool_choice = 'auto';
      }

      const llmResponse = await fetch(`${preset.apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${preset.apiKey}`,
        },
        body: JSON.stringify(llmBody),
      });

      if (!llmResponse.ok) {
        const errorText = await llmResponse.text();
        console.error(`[CMD Chat] LLM error (${llmResponse.status}):`, errorText.slice(0, 200));

        // On 400 tool validation errors, retry without tools so user still gets a response
        if (llmResponse.status === 400 && errorText.includes('tool')) {
          console.log('[CMD Chat] Tool validation error — retrying without tools');
          const retryBody = { model: modelName, messages, max_completion_tokens: 4096 };
          const retryResponse = await fetch(`${preset.apiBase}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${preset.apiKey}` },
            body: JSON.stringify(retryBody),
          });
          if (retryResponse.ok) {
            const retryData = await retryResponse.json() as { choices?: Array<{ message?: { content?: string | null } }> };
            const reply = retryData.choices?.[0]?.message?.content || '(no response)';
            return res.json({ reply, toolCalls: toolCallsLog, model: modelName, provider: providerName });
          }
        }

        return res.status(502).json({
          error: `LLM provider returned ${llmResponse.status}`,
          detail: errorText.slice(0, 200),
          provider: providerName,
        });
      }

      const data = await llmResponse.json() as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
            role?: string;
          };
          finish_reason?: string;
        }>;
      };

      const choice = data.choices?.[0];
      const assistantMsg = choice?.message;

      if (!assistantMsg) {
        return res.json({ reply: '(no response from LLM)', toolCalls: toolCallsLog, model: modelName, provider: providerName });
      }

      // If there are tool calls, execute them and continue the loop
      if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
        // Add assistant message with tool calls to conversation
        messages.push({ role: 'assistant', content: assistantMsg.content || '', ...({ tool_calls: assistantMsg.tool_calls } as Record<string, unknown>) });

        for (const tc of assistantMsg.tool_calls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch { /* empty args */ }

          console.log(`[CMD Chat] Tool: ${tc.function.name}(${JSON.stringify(args)})`);
          const result = await executeCommanderTool(tc.function.name, args);
          toolCallsLog.push({ tool: tc.function.name, args, result });

          // Add tool result to conversation
          messages.push({ role: 'tool', content: result, ...({ tool_call_id: tc.id } as Record<string, unknown>) });
        }

        // Continue loop — LLM will process tool results
        continue;
      }

      // No tool calls — we have our final response
      const reply = assistantMsg.content || '(no response)';
      return res.json({ reply, toolCalls: toolCallsLog, model: modelName, provider: providerName });
    }

    // Safety: if we hit max iterations
    return res.json({ reply: 'Completed tool execution cycle.', toolCalls: toolCallsLog, model: modelName, provider: providerName });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[CMD Chat] Error:', message);

    // Return partial conversation if available
    if (conversationHistory.length > 0) {
      return res.status(500).json({
        error: 'Commander chat failed',
        detail: message.slice(0, 200),
        partialHistory: conversationHistory.slice(-5),
      });
    }

    res.status(500).json({ error: 'Commander chat failed', detail: message.slice(0, 200) });
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

  // Reap orphaned bot processes from previous Commander session
  processManager.reapOrphans();

  // Start health checks
  processManager.startHealthChecks();

  // Initialize MCP hub
  mcpHub.initialize().then(() => {
    processManager.setMCPHub(mcpHub);
    processManager.startToolPolling();
    console.log('[CMD] MCP hub initialized, tool polling active');
  }).catch((err) => {
    console.error('[CMD] MCP hub initialization failed:', err);
  });

  // Auto-spawn permanent bots from DB
  apiClient.getBots().then(async (dbBots) => {
    const permanent = dbBots.filter((b) => b.is_permanent);
    console.log(`[CMD] Auto-spawning ${permanent.length} permanent bot(s)...`);

    for (const bot of permanent) {
      const preset = bot.metadata?.provider ? resolveProvider(bot.metadata.provider as string) : undefined;
      const baseConfig: BotConfig = {
        name: bot.name,
        soulName: bot.soul_name,
        isPermanent: true,
        ttlSeconds: null,
        openaiApiKey: preset?.apiKey || process.env.OPENAI_API_KEY || '',
        openaiApiBase: preset?.apiBase || process.env.OPENAI_API_BASE || '',
        model: (bot.metadata?.model as string) || preset?.model || process.env.PICOBOT_MODEL || 'glm-4.7-flash',
        telegramBotToken: (bot.metadata?.telegram_token as string) || '',
        telegramAllowFrom: (bot.metadata?.telegram_allow_from as string) || '',
        workspaceDir: '',
      };

      if (bot.metadata?.provider) {
        baseConfig.providerPreset = bot.metadata.provider as string;
      }
      if (bot.client_id) {
        baseConfig.clientId = bot.client_id;
      }

      const config = baseConfig;

      try {
        await processManager.spawnBot(config);
        console.log(`[CMD] ✓ ${bot.name} spawned`);
      } catch (err) {
        console.warn(`[CMD] ✗ ${bot.name} spawn failed:`, err instanceof Error ? err.message : err);
      }
    }

    // Broadcast initial fleet state (merged with process info)
    const allBots = await apiClient.getBots();
    const fleet = processManager.getFleetStatus();
    const enrichedBots = allBots.map((dbBot) => {
      const processInfo = fleet.bots.find((p) => p.name === dbBot.name);
      return {
        ...dbBot,
        pid: processInfo?.pid ?? null,
        status: processInfo?.status ?? dbBot.status,
        uptime_seconds: processInfo?.uptime ?? dbBot.uptime_seconds,
        memory_mb: processInfo?.memoryMb ?? dbBot.memory_mb,
        restart_count: processInfo?.restartCount ?? 0,
      };
    });
    broadcastSSE('fleet:update', enrichedBots);
  }).catch((err) => {
    console.warn('[CMD] Auto-spawn failed (PostgREST may be down):', err instanceof Error ? err.message : err);
  });

  // Broadcast fleet updates every 30s (same merge as GET /api/fleet)
  setInterval(async () => {
    try {
      const dbBots = await apiClient.getBots();
      const fleetStatus = processManager.getFleetStatus();

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

      broadcastSSE('fleet:update', enriched);
    } catch {
      // Silent — PostgREST may be down
    }
  }, 30000);
});

// Graceful shutdown
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n[CMD] ${signal} received — shutting down...`);
  for (const client of sseClients) { client.res.end(); }
  await mcpHub.shutdown();
  await processManager.shutdown();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
