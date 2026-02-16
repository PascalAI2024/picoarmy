import { useState, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface ShellProps {
  children: React.ReactNode;
  onSpawnClick?: () => void;
  sseConnected: boolean;
  sseError: string | null;
  onCommandBarOpen: () => void;
}

export function Shell({ children, onSpawnClick, sseConnected, sseError, onCommandBarOpen }: ShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const toggleMobileMenu = useCallback(() => setMobileMenuOpen((v) => !v), []);

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Fixed sidebar */}
      <Sidebar onSpawnClick={onSpawnClick} mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col ml-0 md:ml-60">
        <TopBar
          sseConnected={sseConnected}
          sseError={sseError}
          onCommandBarOpen={onCommandBarOpen}
          onMobileMenuToggle={toggleMobileMenu}
        />

        <main className="flex-1 overflow-y-auto p-6 bg-dot-grid">
          {children}
        </main>
      </div>
    </div>
  );
}
