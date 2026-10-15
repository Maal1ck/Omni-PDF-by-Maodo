import React, { useState } from 'react';
import { Search, Sparkles, ArrowRight, Shield, Zap, FileSpreadsheet } from 'lucide-react';
import { ToolDefinition, ToolCategory, ToolId } from '../types';
import { TOOLS_LIST } from '../data/toolsData';
import { ToolIcon } from './ToolIcon';

interface ToolGridProps {
  activeCategory: ToolCategory;
  onSelectCategory: (cat: ToolCategory) => void;
  onSelectTool: (toolId: ToolId, useSample?: boolean) => void;
}

export const ToolGrid: React.FC<ToolGridProps> = ({
  activeCategory,
  onSelectCategory,
  onSelectTool,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTools = TOOLS_LIST.filter((tool) => {
    const matchesCategory = activeCategory === 'all' || tool.category === activeCategory;
    const matchesSearch =
      tool.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.shortDesc.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 transition-colors">
      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/60 rounded-full mb-4">
          <Zap className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          <span>Every PDF Tool You Need, Completely Client-Side & Private</span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
          Every tool you need to work with PDFs in one place
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
          Merge, split, organize, compress, and convert documents to and from PDF format in seconds.
          All files are processed directly in your browser.
        </p>

        {/* Search & Category Filter Bar */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search PDF tools (merge, split, word...)"
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xs focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 dark:bg-slate-800/80 rounded-xl overflow-x-auto max-w-full">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'organize', label: 'Merge & Split' },
                { id: 'to-pdf', label: 'Convert to PDF' },
                { id: 'from-pdf', label: 'Convert from PDF' },
                { id: 'edit-security', label: 'Edit & Security' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all ${
                  activeCategory === cat.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Trust & Spec Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 p-3.5 bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-xl shadow-2xs">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-white">Zero Server Uploads</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Your documents never leave your browser</div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3.5 bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-xl shadow-2xs">
          <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-white">Instant Execution</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">High-speed WebAssembly & Canvas engine</div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3.5 bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-xl shadow-2xs">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-white">Full Format Interop</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">PDF, Word DOCX, Excel XLSX, Images, TXT</div>
          </div>
        </div>
      </div>

      {/* Tools Grid */}
      {filteredTools.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl max-w-md mx-auto">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No tools matched "{searchQuery}"</p>
          <button
            onClick={() => {
              setSearchQuery('');
              onSelectCategory('all');
            }}
            className="mt-3 text-xs text-rose-600 dark:text-rose-400 font-semibold hover:underline"
          >
            Clear search & filter
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredTools.map((tool) => (
            <div
              key={tool.id}
              onClick={() => onSelectTool(tool.id)}
              className="group relative bg-white dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 hover:border-rose-400 dark:hover:border-rose-500/80 hover:shadow-md transition-all duration-200 flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3.5">
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tool.color} flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform`}
                  >
                    <ToolIcon name={tool.iconName} className="w-6 h-6" />
                  </div>
                  {tool.badge && (
                    <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded-full border border-rose-100 dark:border-rose-900/60">
                      {tool.badge}
                    </span>
                  )}
                </div>

                <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                  {tool.title}
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                  {tool.shortDesc}
                </p>
              </div>

              <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                  {tool.multiple ? 'Multi-file' : 'Single file'}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTool(tool.id, true);
                    }}
                    className="text-[11px] font-medium text-slate-500 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 bg-slate-50 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-2 py-1 rounded border border-slate-200/70 dark:border-slate-700 flex items-center gap-1 transition-colors"
                    title="Load with sample test data immediately"
                  >
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>Try Sample</span>
                  </button>

                  <div className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 group-hover:bg-rose-600 group-hover:text-white dark:group-hover:bg-rose-600 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors">
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
