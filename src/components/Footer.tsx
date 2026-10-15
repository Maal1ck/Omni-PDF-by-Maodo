import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { ToolCategory, ToolId } from '../types';

interface FooterProps {
  onSelectTool: (id: ToolId) => void;
  onSelectCategory: (cat: ToolCategory) => void;
}

export const Footer: React.FC<FooterProps> = ({ onSelectTool, onSelectCategory }) => {
  return (
    <footer className="mt-20 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand & Mission */}
          <div className="md:col-span-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                OmniPDF
              </span>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                by Maodo
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Professional, 100% private client-side document processing suite by Maodo.
              Merge, split, organize, compress, and convert documents directly in your browser.
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Zero server file transmission</span>
            </div>
          </div>

          {/* Quick Links: Core Tools */}
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">
              Frequent Tools
            </h4>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <button
                  onClick={() => onSelectTool('merge')}
                  className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                >
                  Merge PDF
                </button>
              </li>
              <li>
                <button
                  onClick={() => onSelectTool('split')}
                  className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                >
                  Split PDF
                </button>
              </li>
              <li>
                <button
                  onClick={() => onSelectTool('compress')}
                  className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                >
                  Compress PDF
                </button>
              </li>
              <li>
                <button
                  onClick={() => onSelectTool('organize')}
                  className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                >
                  Organize & Rotate Pages
                </button>
              </li>
            </ul>
          </div>

          {/* Quick Links: Convert to PDF */}
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">
              Convert to PDF
            </h4>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <button
                  onClick={() => onSelectTool('jpg-to-pdf')}
                  className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                >
                  JPG & PNG to PDF
                </button>
              </li>
              <li>
                <button
                  onClick={() => onSelectTool('word-to-pdf')}
                  className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                >
                  WORD DOCX to PDF
                </button>
              </li>
              <li>
                <button
                  onClick={() => onSelectTool('excel-to-pdf')}
                  className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                >
                  EXCEL XLSX to PDF
                </button>
              </li>
              <li>
                <button
                  onClick={() => onSelectTool('text-to-pdf')}
                  className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                >
                  TXT & Markdown to PDF
                </button>
              </li>
            </ul>
          </div>

          {/* Quick Links: Convert from PDF */}
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">
              Convert from PDF
            </h4>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <button
                  onClick={() => onSelectTool('pdf-to-jpg')}
                  className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                >
                  PDF to JPG & PNG
                </button>
              </li>
              <li>
                <button
                  onClick={() => onSelectTool('pdf-to-word')}
                  className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                >
                  PDF to WORD (.docx)
                </button>
              </li>
              <li>
                <button
                  onClick={() => onSelectTool('pdf-to-excel')}
                  className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                >
                  PDF to EXCEL (.xlsx)
                </button>
              </li>
              <li>
                <button
                  onClick={() => onSelectTool('pdf-to-text')}
                  className="hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                >
                  PDF to Plain Text (.txt)
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-500">
          <div>
            © {new Date().getFullYear()} OmniPDF by Maodo. High-speed client-side PDF & document engine.
          </div>
          <div className="flex items-center gap-1">
            <span>Built for high productivity & data privacy</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
