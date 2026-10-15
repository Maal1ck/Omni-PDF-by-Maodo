import React, { useState, useEffect } from 'react';
import { ToolCategory, ToolId, ProcessHistoryItem } from './types';
import { TOOLS_LIST } from './data/toolsData';
import { Navbar } from './components/Navbar';
import { ToolGrid } from './components/ToolGrid';
import { ToolWorkspace } from './components/ToolWorkspace';
import { RecentFilesDrawer } from './components/RecentFilesDrawer';
import { InstallModal } from './components/InstallModal';
import { Footer } from './components/Footer';
import { useTheme } from './hooks/useTheme';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [activeCategory, setActiveCategory] = useState<ToolCategory>('all');
  const [selectedToolId, setSelectedToolId] = useState<ToolId | null>(null);
  const [initialUseSample, setInitialUseSample] = useState(false);
  const [historyItems, setHistoryItems] = useState<ProcessHistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isInstallOpen, setIsInstallOpen] = useState(false);

  // Sync hash state if user changes URL or uses back button
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (!hash) {
        setSelectedToolId(null);
      } else {
        const found = TOOLS_LIST.find((t) => t.id === hash);
        if (found) setSelectedToolId(found.id);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSelectTool = (toolId: ToolId, useSample: boolean = false) => {
    setSelectedToolId(toolId);
    setInitialUseSample(useSample);
    window.location.hash = toolId;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToHome = () => {
    setSelectedToolId(null);
    setInitialUseSample(false);
    window.location.hash = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveToHistory = (item: ProcessHistoryItem) => {
    setHistoryItems((prev) => [item, ...prev]);
  };

  const handleClearHistory = () => {
    setHistoryItems([]);
  };

  const selectedTool = selectedToolId ? TOOLS_LIST.find((t) => t.id === selectedToolId) : null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-rose-500/20 selection:text-rose-900 transition-colors duration-200">
      {/* Navigation Header */}
      <Navbar
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenInstall={() => setIsInstallOpen(true)}
        historyCount={historyItems.length}
        onBackToHome={handleBackToHome}
        isInsideTool={!!selectedTool}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main View Area */}
      <main className="flex-1">
        {selectedTool ? (
          <ToolWorkspace
            tool={selectedTool}
            onBack={handleBackToHome}
            onSaveToHistory={handleSaveToHistory}
            initialUseSample={initialUseSample}
          />
        ) : (
          <ToolGrid
            activeCategory={activeCategory}
            onSelectCategory={setActiveCategory}
            onSelectTool={handleSelectTool}
          />
        )}
      </main>

      {/* Footer */}
      <Footer
        onSelectTool={handleSelectTool}
        onSelectCategory={(cat) => {
          setActiveCategory(cat);
          handleBackToHome();
        }}
      />

      {/* Processed Files History Drawer */}
      <RecentFilesDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        items={historyItems}
        onClearHistory={handleClearHistory}
      />

      {/* Install on PC / Executable Modal */}
      <InstallModal
        isOpen={isInstallOpen}
        onClose={() => setIsInstallOpen(false)}
      />
    </div>
  );
}
