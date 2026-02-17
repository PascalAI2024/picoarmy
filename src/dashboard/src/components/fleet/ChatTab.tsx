import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { chatWithBot } from '../../lib/api';
import type { ChatMessage } from '../../lib/types';

interface ChatTabProps {
  botId: string;
  botName: string;
}

export function ChatTab({ botId, botName }: ChatTabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [providerInfo, setProviderInfo] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await chatWithBot(botId, text, messages);
      const assistantMsg: ChatMessage = { role: 'assistant', content: res.reply, timestamp: new Date().toISOString() };
      setMessages((prev) => [...prev, assistantMsg]);
      if (!providerInfo) setProviderInfo(`${res.model} via ${res.provider}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to send';
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${errMsg}`, timestamp: new Date().toISOString() }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="panel flex flex-col" style={{ height: '500px' }}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
        <div className="text-xs text-text-muted uppercase tracking-wider">
          Chat with {botName}
        </div>
        {providerInfo && (
          <div className="mono-data text-xs text-text-muted">{providerInfo}</div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-text-muted">
              Send a message to test {botName}'s personality
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`
                max-w-[80%] px-3 py-2 text-sm
                ${msg.role === 'user'
                  ? 'bg-accent-cyan/15 border border-accent-cyan/30 text-text-primary'
                  : 'bg-bg-elevated border border-border text-text-secondary'
                }
              `}
            >
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                {msg.content}
              </pre>
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-bg-elevated border border-border px-3 py-2">
              <span className="mono-data text-xs text-text-muted animate-pulse">
                thinking...
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 pt-3 border-t border-border mt-3">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a message..."
          disabled={sending}
          className="
            flex-1 bg-bg-surface border border-border px-3 py-2
            text-sm text-text-primary
            placeholder:text-text-muted
            focus:outline-none focus:border-accent-cyan
            disabled:opacity-50
            transition-colors
          "
        />
        <button
          onClick={send}
          disabled={!input.trim() || sending}
          className="
            p-2 bg-accent-cyan/20 border border-accent-cyan/30
            text-accent-cyan
            hover:bg-accent-cyan/30
            disabled:opacity-30 disabled:cursor-not-allowed
            transition-colors
          "
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
