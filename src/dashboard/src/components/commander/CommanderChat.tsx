import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Send, Bot, ChevronDown, ChevronRight, Wrench, Loader2, Zap } from 'lucide-react';
import { chatWithCommander } from '../../lib/api';
import { useTelemetryStore } from '../../stores/telemetry';
import type { CommanderChatMessage, CommanderToolCall } from '../../lib/types';

interface CommanderChatProps {
  open: boolean;
  onClose: () => void;
}

interface SwarmPipelineBot {
  role: string;
  completion_tokens: number;
}

function SwarmPipeline({ pipeline }: { pipeline: SwarmPipelineBot[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-2 py-1.5 px-2 bg-accent-cyan/5 border border-accent-cyan/20 rounded-sm">
      {pipeline.map((bot, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="flex items-center gap-1">
            <Bot className="h-3 w-3 text-accent-cyan" />
            <span className="text-[10px] text-text-secondary mono-data">{bot.role}</span>
            <span className="text-[9px] text-text-muted mono-data">({bot.completion_tokens}t)</span>
          </div>
          {i < pipeline.length - 1 && (
            <span className="text-accent-cyan/40">→</span>
          )}
        </div>
      ))}
    </div>
  );
}

function ToolCallItem({ tc }: { tc: CommanderToolCall }) {
  const [expanded, setExpanded] = useState(false);

  let parsedResult: unknown;
  try { parsedResult = JSON.parse(tc.result); } catch { parsedResult = tc.result; }

  // Check if this is a swarm_task result with pipeline
  const isSwarmTask = tc.tool === 'swarm_task';
  const swarmPipeline: SwarmPipelineBot[] | null =
    isSwarmTask && typeof parsedResult === 'object' && parsedResult !== null && 'pipeline' in parsedResult
      ? (parsedResult as { pipeline?: SwarmPipelineBot[] }).pipeline || null
      : null;

  return (
    <div className="border border-border/50 rounded-sm text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full px-2 py-1 text-left text-accent-cyan/80 hover:bg-bg-elevated/50 transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <Wrench className="h-3 w-3 shrink-0" />
        <span className="mono-data truncate">{tc.tool}({tc.args && Object.keys(tc.args).length > 0 ? '...' : ''})</span>
      </button>
      {expanded && (
        <div className="px-2 py-1.5 border-t border-border/30 bg-bg/50">
          {/* Show pipeline visualization for swarm_task */}
          {swarmPipeline && swarmPipeline.length > 0 && (
            <SwarmPipeline pipeline={swarmPipeline} />
          )}

          {tc.args && Object.keys(tc.args).length > 0 && (
            <div className="mb-1">
              <span className="text-text-muted">args:</span>
              <pre className="mono-data text-text-secondary whitespace-pre-wrap break-all mt-0.5">
                {JSON.stringify(tc.args, null, 2)}
              </pre>
            </div>
          )}
          <div>
            <span className="text-text-muted">result:</span>
            <pre className="mono-data text-text-secondary whitespace-pre-wrap break-all mt-0.5 max-h-32 overflow-y-auto">
              {typeof parsedResult === 'string' ? parsedResult : JSON.stringify(parsedResult, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function SwarmActivity() {
  const logs = useTelemetryStore((s) => s.logs);

  // Filter to only swarm/moa log entries from the last 2 minutes
  const swarmLogs = useMemo(() => {
    const cutoff = Date.now() - 120_000;
    return logs.filter(
      (l) =>
        (l.bot_name === 'swarm' || l.bot_name === 'moa' || l.bot_name?.startsWith('swarm:')) &&
        new Date(l.timestamp).getTime() > cutoff
    );
  }, [logs]);

  if (swarmLogs.length === 0) return null;

  return (
    <div className="space-y-1 animate-in fade-in">
      {swarmLogs.slice(-8).map((log) => (
        <div
          key={log.id}
          className="flex items-start gap-1.5 px-2 py-1 rounded-sm bg-accent-cyan/5 border border-accent-cyan/10"
        >
          <Zap className="h-3 w-3 text-accent-cyan shrink-0 mt-0.5" />
          <span className="text-[11px] text-text-secondary mono-data leading-tight">
            {log.message}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CommanderChat({ open, onClose }: CommanderChatProps) {
  const [messages, setMessages] = useState<CommanderChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: CommanderChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await chatWithCommander(text, [...messages, userMsg]);
      const assistantMsg: CommanderChatMessage = {
        role: 'assistant',
        content: response.reply,
        toolCalls: response.toolCalls.length > 0 ? response.toolCalls : undefined,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: CommanderChatMessage = {
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Chat request failed'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  if (!open) return null;

  return (
    <>
      {/* Side panel — no backdrop, slides from right */}
      <div
        className="fixed top-0 right-0 z-40 h-full w-full max-w-[420px] flex flex-col bg-bg-surface border-l border-border shadow-2xl"
        style={{ animation: 'slide-in-right 0.25s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg-surface/95">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-7 w-7 rounded bg-accent-cyan/10 border border-accent-cyan/20">
              <Bot className="h-4 w-4 text-accent-cyan" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-text-primary">Fleet Commander</h3>
              <p className="text-[10px] text-text-muted mono-data">AI fleet management</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-elevated rounded transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 opacity-50">
              <Bot className="h-10 w-10 text-text-muted" />
              <div>
                <p className="text-sm text-text-secondary">Fleet Commander</p>
                <p className="text-xs text-text-muted mt-1">
                  Ask me to manage your fleet...
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 mt-2">
                {['list all bots', 'deploy seo team', 'what swarms are available?', 'spawn a new bot'].map((hint) => (
                  <button
                    key={hint}
                    onClick={() => { setInput(hint); inputRef.current?.focus(); }}
                    className="px-2 py-1 text-[11px] mono-data text-accent-cyan/70 border border-accent-cyan/20 rounded-sm hover:bg-accent-cyan/5 transition-colors"
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-sm px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-accent-cyan/10 border border-accent-cyan/20 text-text-primary'
                    : 'bg-bg-elevated border border-border text-text-secondary'
                }`}
              >
                {/* Tool calls (before content) */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {msg.toolCalls.map((tc, j) => (
                      <ToolCallItem key={j} tc={tc} />
                    ))}
                  </div>
                )}

                {/* Message content */}
                <div className="whitespace-pre-wrap break-words leading-relaxed">
                  {msg.content}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="space-y-2">
              <div className="flex justify-start">
                <div className="bg-bg-elevated border border-border rounded-sm px-3 py-2 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 text-accent-cyan animate-spin" />
                  <span className="text-xs text-text-muted mono-data">working...</span>
                </div>
              </div>
              {/* Live swarm/MoA activity feed */}
              <SwarmActivity />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border p-3 bg-bg-surface/95">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the commander..."
              rows={1}
              className="flex-1 resize-none bg-bg-elevated border border-border rounded-sm px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 transition-colors mono-data"
              style={{ minHeight: '36px', maxHeight: '120px' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="shrink-0 p-2 bg-accent-cyan/10 border border-accent-cyan/30 rounded-sm text-accent-cyan hover:bg-accent-cyan/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
