# Command Palette

Terminal-style command palette with keyboard-first navigation.

## Usage

```tsx
import { CommandBar } from '@/components/command';
import { useCommandBar } from '@/hooks';

function App() {
  const { open, setOpen } = useCommandBar(); // Handles Cmd+K / Ctrl+K

  return (
    <>
      {/* Your app content */}
      <CommandBar open={open} onOpenChange={setOpen} />
    </>
  );
}
```

## Features

- **Keyboard shortcut**: `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux)
- **Fuzzy search**: Type to filter commands
- **Arrow keys**: Navigate up/down through results
- **Enter**: Execute selected command
- **Escape**: Close palette
- **Mouse support**: Click to select and execute

## Available Commands

### Bot Management
- `spawn assistant` — Spawn assistant bot (1h TTL)
- `spawn seo-writer` — Spawn SEO content bot (2h TTL)
- `spawn support-agent` — Spawn support bot (1h TTL)
- `list bots` — Return to fleet overview

### Bot Actions (per bot)
- `go <bot-name>` — Navigate to bot detail view
- `destroy <bot-name>` — Destroy bot (with confirmation)

## Styling

Matches command center aesthetic:
- Dark background with cyan border glow
- Monospace JetBrains Mono font
- Terminal-style `>` prompt
- Cyan highlight for selected command
- Footer with keyboard shortcuts

## Extension

Add new commands by modifying the `commands` array in `CommandBar.tsx`:

```tsx
{
  id: 'my-command',
  label: 'my command label',
  keywords: ['search', 'keywords'],
  action: async () => {
    // Your command logic
    onOpenChange(false); // Close palette
  }
}
```
