import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface ShellProps {
  children: React.ReactNode;
  onSpawnClick?: () => void;
}

export function Shell({ children, onSpawnClick }: ShellProps) {
  return (
    <div className="min-h-screen bg-bg flex">
      {/* Fixed sidebar */}
      <Sidebar onSpawnClick={onSpawnClick} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col ml-60">
        <TopBar />

        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
