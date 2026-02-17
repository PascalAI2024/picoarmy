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

    // Create DB record
    const dbBot = await apiClient.createBot({
      name,
      soul_name,
      is_permanent: is_permanent !== undefined ? is_permanent : true,
      ttl_seconds,
      client_id,
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

    // Broadcast initial fleet state
    const enrichedBots = await apiClient.getBots();
    broadcastSSE('fleet:update', enrichedBots);
  }).catch((err) => {
    console.warn('[CMD] Auto-spawn failed (PostgREST may be down):', err instanceof Error ? err.message : err);
  });

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
  await mcpHub.shutdown();
  await processManager.shutdown();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
