import React from 'react';
import { X, Download, Trash2, Clock, FileText } from 'lucide-react';
import { ProcessHistoryItem } from '../types';

interface RecentFilesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: ProcessHistoryItem[];
  onClearHistory: () => void;
}

export const RecentFilesDrawer: React.FC<RecentFilesDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onClearHistory,
}) => {
  if (!isOpen) return null;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatTime = (ts: number): string => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const handleDownload = (item: ProcessHistoryItem) => {
    const a = document.createElement('a');
    a.href = item.downloadUrl;
    a.download = item.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col transition-colors">
          {/* Header */}
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Recent Processed Files</h2>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {items.length} {items.length === 1 ? 'file' : 'files'} processed this session
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {items.length === 0 ? (
              <div className="text-center py-16 text-slate-500 dark:text-slate-400">
                <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400 dark:text-slate-500">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">No files processed yet</div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                  Files you merge, split, compress, or convert will show up here for quick re-download.
                </p>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 bg-slate-50 hover:bg-slate-100/70 dark:bg-slate-800/80 dark:hover:bg-slate-800 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl flex items-center justify-between transition-colors group"
                >
                  <div className="flex items-center gap-3 overflow-hidden min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>

                    <div className="truncate">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{item.fileName}</div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                        <span className="text-rose-600 dark:text-rose-400 font-sans font-medium">{item.toolTitle}</span>
                        <span>·</span>
                        <span>{formatFileSize(item.size)}</span>
                        <span>·</span>
                        <span className="font-sans text-slate-400 dark:text-slate-500">{formatTime(item.timestamp)}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDownload(item)}
                    className="p-2 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-white dark:hover:bg-slate-700 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-600 shadow-2xs transition-all shrink-0 ml-2 cursor-pointer"
                    title="Download file again"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Stored safely in browser memory</span>
              <button
                onClick={onClearHistory}
                className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear history</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
