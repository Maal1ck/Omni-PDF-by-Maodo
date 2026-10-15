import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  ArrowLeft,
  Upload,
  Download,
  Plus,
  Trash2,
  RotateCw,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileText,
  FileCode,
  FileSpreadsheet,
  Image as ImageIcon,
  Loader2,
  MoveUp,
  MoveDown,
  Eye,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { ToolDefinition, FileItem, PageThumb, ProcessResult, ProcessHistoryItem } from '../types';
import { ToolIcon } from './ToolIcon';
import {
  mergePdfs,
  splitPdf,
  imagesToPdf,
  pdfToImages,
  pdfToWord,
  pdfToExcel,
  pdfToText,
  wordToPdf,
  excelToPdf,
  textToPdf,
  rotatePdf,
  organizePdf,
  organizePdfFiles,
  watermarkPdf,
  addPageNumbersPdf,
  compressPdf,
  getPdfPageCount,
  renderAllPdfPageThumbnails,
  renderPdfPageThumbnail,
  fileToDataUrl,
  zipFiles,
} from '../services/pdfService';
import {
  createSamplePdf,
  createSampleDocx,
  createSampleXlsx,
  createSampleText,
  createSampleImage,
} from '../services/sampleFiles';

interface ToolWorkspaceProps {
  tool: ToolDefinition;
  onBack: () => void;
  onSaveToHistory: (item: ProcessHistoryItem) => void;
  initialUseSample?: boolean;
}

export const ToolWorkspace: React.FC<ToolWorkspaceProps> = ({
  tool,
  onBack,
  onSaveToHistory,
  initialUseSample = false,
}) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);

  // Tool-specific configurations
  // 1. Split
  const [splitMode, setSplitMode] = useState<'range' | 'extract_all'>('range');
  const [splitRange, setSplitRange] = useState('1-2');
  const [splitAsZip, setSplitAsZip] = useState(false);

  // 2. Images to PDF
  const [imgOrientation, setImgOrientation] = useState<'auto' | 'portrait' | 'landscape'>('auto');
  const [imgMargin, setImgMargin] = useState<'none' | 'small' | 'large'>('small');
  const [imgPageSize, setImgPageSize] = useState<'fit' | 'a4' | 'letter'>('a4');

  // 3. PDF to Images
  const [imgFormat, setImgFormat] = useState<'jpeg' | 'png'>('jpeg');
  const [imgScale, setImgScale] = useState<number>(2.0);
  const [pdfRenderedImages, setPdfRenderedImages] = useState<{ pageNumber: number; dataUrl: string; blob: Blob }[]>([]);

  // 4. Organize PDF
  const [pagesList, setPagesList] = useState<PageThumb[]>([]);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [draggedPageIndex, setDraggedPageIndex] = useState<number | null>(null);

  // 5. Watermark
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.4);
  const [watermarkFontSize, setWatermarkFontSize] = useState(36);
  const [watermarkPosition, setWatermarkPosition] = useState<'diagonal' | 'center' | 'top' | 'bottom'>('diagonal');
  const [watermarkColor, setWatermarkColor] = useState('#dc2626');

  // 6. Page Numbers
  const [pageNumFormat, setPageNumFormat] = useState<'page_of_total' | 'page_only' | 'page_label'>('page_of_total');
  const [pageNumPos, setPageNumPos] = useState<'bottom_center' | 'bottom_right' | 'bottom_left' | 'top_right'>('bottom_center');
  const [pageNumStart, setPageNumStart] = useState(1);

  // 7. Rotate
  const [globalRotation, setGlobalRotation] = useState<number>(90);

  // 8. Compress
  const [compressLevel, setCompressLevel] = useState<'recommended' | 'extreme' | 'low'>('recommended');
  const [compressedStats, setCompressedStats] = useState<{ original: number; compressed: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Load sample file automatically if requested
  useEffect(() => {
    if (initialUseSample) {
      handleLoadSample();
    }
  }, [initialUseSample, tool.id]);

  // When files change, load metadata and thumbnails if Organize tool
  useEffect(() => {
    if (tool.id === 'organize' && files.length > 0) {
      loadOrganizePages(files.map((f) => f.file));
    }
  }, [files, tool.id]);

  const loadOrganizePages = async (selectedFiles: File[]) => {
    setIsLoadingPages(true);
    try {
      const thumbs: PageThumb[] = [];
      let currentDisplayIndex = 1;

      for (let fileIndex = 0; fileIndex < selectedFiles.length; fileIndex += 1) {
        const file = selectedFiles[fileIndex];
        const fileThumbs = await renderAllPdfPageThumbnails(file);

        fileThumbs.forEach((t) => {
          thumbs.push({
            pageNumber: currentDisplayIndex,
            sourceFileIndex: fileIndex,
            sourcePageNumber: t.pageNumber,
            sourceFileName: file.name,
            thumbnailUrl: t.dataUrl,
            rotation: 0,
            isDeleted: false,
          });
          currentDisplayIndex += 1;
        });
      }

      setPagesList(thumbs);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingPages(false);
    }
  };

  const handleFilesAdded = async (newFileList: FileList | File[]) => {
    setError(null);
    setResult(null);
    setPdfRenderedImages([]);

    const fileArray = Array.from(newFileList);
    if (fileArray.length === 0) return;

    const processedItems: FileItem[] = [];

    for (const f of fileArray) {
      const item: FileItem = {
        id: Math.random().toString(36).substring(2, 9),
        file: f,
        name: f.name,
        size: f.size,
      };

      if (f.type.includes('pdf')) {
        try {
          item.pageCount = await getPdfPageCount(f);
          item.previewUrl = await renderPdfPageThumbnail(f, 1, 0.35);
        } catch {
          // ignore
        }
      } else if (f.type.startsWith('image/')) {
        item.previewUrl = await fileToDataUrl(f);
      }

      processedItems.push(item);
    }

    if (tool.multiple) {
      setFiles((prev) => [...prev, ...processedItems]);
    } else {
      setFiles([processedItems[0]]);
      if (processedItems[0].pageCount && tool.id === 'split') {
        const count = processedItems[0].pageCount;
        setSplitRange(count > 1 ? `1-${Math.ceil(count / 2)}` : '1');
      }
    }
  };

  const handleLoadSample = async () => {
    setError(null);
    setResult(null);
    let sampleFile: File;

    if (tool.id === 'word-to-pdf') {
      sampleFile = await createSampleDocx();
    } else if (tool.id === 'excel-to-pdf') {
      sampleFile = createSampleXlsx();
    } else if (tool.id === 'text-to-pdf') {
      sampleFile = createSampleText();
    } else if (tool.id === 'jpg-to-pdf') {
      sampleFile = await createSampleImage('document_receipt_sample.jpg');
    } else if (tool.id === 'merge') {
      const f1 = await createSamplePdf('Contract_Section_A.pdf', 2);
      const f2 = await createSamplePdf('Contract_Section_B.pdf', 2);
      await handleFilesAdded([f1, f2]);
      return;
    } else {
      sampleFile = await createSamplePdf('Financial_Audit_Report.pdf', 4);
    }

    await handleFilesAdded([sampleFile]);
  };

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (files.length <= 1) {
      setResult(null);
    }
  };

  const handleMoveFile = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === files.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newFiles = [...files];
    const temp = newFiles[index];
    newFiles[index] = newFiles[targetIndex];
    newFiles[targetIndex] = temp;
    setFiles(newFiles);
  };

  const reorderPages = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= pagesList.length || toIndex >= pagesList.length) {
      return;
    }

    setPagesList((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // ----------------------------------------------------
  // Execution Dispatcher
  // ----------------------------------------------------
  const handleExecuteTool = async () => {
    if (files.length === 0) {
      setError('Please add at least one file to proceed.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      let outputBlob: Blob;
      let outputName: string;
      let details = '';

      switch (tool.id) {
        case 'merge': {
          setProcessingStatus(`Merging ${files.length} PDF documents...`);
          outputBlob = await mergePdfs(files.map((f) => f.file));
          outputName = `merged_${files[0].name.replace(/\.pdf$/i, '')}_plus_${files.length - 1}.pdf`;
          details = `Merged ${files.length} files successfully into a single document`;
          break;
        }

        case 'split': {
          setProcessingStatus('Splitting PDF pages...');
          const splitRes = await splitPdf(files[0].file, {
            mode: splitMode,
            rangeString: splitRange,
            extractAsZip: splitAsZip,
          });
          outputBlob = splitRes.blob;
          outputName = splitRes.fileName;
          details = splitRes.isZip
            ? 'Pages extracted into archive'
            : `Selected pages extracted into ${outputName}`;
          break;
        }

        case 'organize': {
          setProcessingStatus('Applying page sequence and rotations...');
          const actions = pagesList
            .filter((p) => !p.isDeleted)
            .map((p) => ({
              sourceFileIndex: p.sourceFileIndex ?? 0,
              originalIndex: (p.sourcePageNumber ?? p.pageNumber) - 1,
              rotation: p.rotation,
              isDeleted: false,
            }));

          if (actions.length === 0) {
            throw new Error('At least one page must remain in the document.');
          }

          outputBlob = await organizePdfFiles(files.map((f) => f.file), actions);
          outputName = files.length > 1 ? 'organized_multiple_pdfs.pdf' : `organized_${files[0].name}`;
          const keptCount = actions.length;
          details = `Exported ${keptCount} pages with custom layout across ${files.length} PDF${files.length > 1 ? 's' : ''}`;
          break;
        }

        case 'compress': {
          setProcessingStatus('Optimizing PDF structure and stream objects...');
          const compRes = await compressPdf(files[0].file, compressLevel);
          outputBlob = compRes.blob;
          outputName = `compressed_${files[0].name}`;
          setCompressedStats({ original: compRes.originalSize, compressed: compRes.newSize });
          const pct = Math.round(((compRes.originalSize - compRes.newSize) / compRes.originalSize) * 100);
          details = `Reduced from ${formatFileSize(compRes.originalSize)} to ${formatFileSize(compRes.newSize)} (${pct}% reduction)`;
          break;
        }

        case 'rotate': {
          setProcessingStatus(`Rotating PDF by ${globalRotation}°...`);
          outputBlob = await rotatePdf(files[0].file, globalRotation);
          outputName = `rotated_${files[0].name}`;
          details = `All pages rotated by ${globalRotation}° clockwise`;
          break;
        }

        case 'jpg-to-pdf': {
          setProcessingStatus(`Converting ${files.length} images to PDF...`);
          outputBlob = await imagesToPdf(files.map((f) => f.file), {
            orientation: imgOrientation,
            margin: imgMargin,
            pageSize: imgPageSize,
          });
          outputName = `converted_${files[0].name.replace(/\.[^/.]+$/, '')}.pdf`;
          details = `Combined ${files.length} images into clean PDF`;
          break;
        }

        case 'pdf-to-jpg': {
          setProcessingStatus('Rendering PDF pages to high-resolution images...');
          if (files.length > 1) {
            const batchResults = await Promise.all(files.map(async (item) => {
              const rendered = await pdfToImages(item.file, imgFormat, imgScale);
              const zipBlob = rendered.zipBlob ?? new Blob([await rendered.images[0].blob.arrayBuffer()], { type: rendered.images[0].blob.type || 'application/octet-stream' });
              return {
                fileName: `${item.name.replace(/\.pdf$/i, '')}_images.zip`,
                blob: zipBlob,
              };
            }));
            outputBlob = await zipFiles(batchResults);
            outputName = `pdf_to_${imgFormat.toLowerCase()}_batch.zip`;
            details = `Extracted ${files.length} PDFs into a batch ZIP archive`;
            break;
          }

          const rendered = await pdfToImages(files[0].file, imgFormat, imgScale);
          setPdfRenderedImages(rendered.images);

          if (rendered.isMultiple && rendered.zipBlob) {
            outputBlob = rendered.zipBlob;
            outputName = `${files[0].name.replace(/\.pdf$/i, '')}_images.zip`;
            details = `Extracted ${rendered.images.length} pages as high-res ${imgFormat.toUpperCase()} images in ZIP`;
          } else {
            outputBlob = rendered.images[0].blob;
            outputName = `${files[0].name.replace(/\.pdf$/i, '')}_page_1.${imgFormat === 'png' ? 'png' : 'jpg'}`;
            details = `Extracted page image (${imgFormat.toUpperCase()})`;
          }
          break;
        }

        case 'word-to-pdf': {
          setProcessingStatus('Parsing Word document layout and formatting...');
          if (files.length > 1) {
            const converted = await Promise.all(files.map(async (item) => ({
              fileName: `${item.name.replace(/\.docx$/i, '')}.pdf`,
              blob: await wordToPdf(item.file),
            })));
            outputBlob = await zipFiles(converted);
            outputName = 'word_to_pdf_batch.zip';
            details = `Converted ${files.length} Word documents into a ZIP archive`;
            break;
          }
          outputBlob = await wordToPdf(files[0].file);
          outputName = `${files[0].name.replace(/\.docx$/i, '')}.pdf`;
          details = 'Converted Microsoft Word document to standard PDF';
          break;
        }

        case 'pdf-to-word': {
          setProcessingStatus('Extracting text structure into Word DOCX document...');
          if (files.length > 1) {
            const converted = await Promise.all(files.map(async (item) => ({
              fileName: `${item.name.replace(/\.pdf$/i, '')}.docx`,
              blob: await pdfToWord(item.file),
            })));
            outputBlob = await zipFiles(converted);
            outputName = 'pdf_to_word_batch.zip';
            details = `Converted ${files.length} PDFs into a ZIP archive of DOCX files`;
            break;
          }
          outputBlob = await pdfToWord(files[0].file);
          outputName = `${files[0].name.replace(/\.pdf$/i, '')}.docx`;
          details = 'Created editable Microsoft Word (.docx) document';
          break;
        }

        case 'excel-to-pdf': {
          setProcessingStatus('Formatting spreadsheet columns and table cells...');
          if (files.length > 1) {
            const converted = await Promise.all(files.map(async (item) => ({
              fileName: `${item.name.replace(/\.(xlsx|csv)$/i, '')}.pdf`,
              blob: await excelToPdf(item.file),
            })));
            outputBlob = await zipFiles(converted);
            outputName = 'excel_to_pdf_batch.zip';
            details = `Converted ${files.length} spreadsheets into a ZIP archive of PDFs`;
            break;
          }
          outputBlob = await excelToPdf(files[0].file);
          outputName = `${files[0].name.replace(/\.(xlsx|csv)$/i, '')}.pdf`;
          details = 'Formatted spreadsheet into clean tabular PDF';
          break;
        }

        case 'pdf-to-excel': {
          setProcessingStatus('Detecting table rows and columns for spreadsheet...');
          if (files.length > 1) {
            const converted = await Promise.all(files.map(async (item) => ({
              fileName: `${item.name.replace(/\.pdf$/i, '')}.xlsx`,
              blob: await pdfToExcel(item.file),
            })));
            outputBlob = await zipFiles(converted);
            outputName = 'pdf_to_excel_batch.zip';
            details = `Converted ${files.length} PDFs into a ZIP archive of XLSX files`;
            break;
          }
          outputBlob = await pdfToExcel(files[0].file);
          outputName = `${files[0].name.replace(/\.pdf$/i, '')}.xlsx`;
          details = 'Extracted records into Microsoft Excel (.xlsx) workbook';
          break;
        }

        case 'text-to-pdf': {
          setProcessingStatus('Formatting text and rendering styled PDF...');
          if (files.length > 1) {
            const converted = await Promise.all(files.map(async (item) => ({
              fileName: `${item.name.replace(/\.(txt|md)$/i, '')}.pdf`,
              blob: await textToPdf(await item.file.text(), item.name.replace(/\.(txt|md)$/i, '')),
            })));
            outputBlob = await zipFiles(converted);
            outputName = 'text_to_pdf_batch.zip';
            details = `Converted ${files.length} text files into a ZIP archive of PDFs`;
            break;
          }
          outputBlob = await textToPdf(await files[0].file.text(), files[0].name.replace(/\.(txt|md)$/i, ''));
          outputName = `${files[0].name.replace(/\.(txt|md)$/i, '')}.pdf`;
          details = 'Converted plain text to PDF document';
          break;
        }

        case 'pdf-to-text': {
          setProcessingStatus('Extracting text content from all pages...');
          if (files.length > 1) {
            const converted = await Promise.all(files.map(async (item) => ({
              fileName: `${item.name.replace(/\.pdf$/i, '')}.txt`,
              blob: await pdfToText(item.file),
            })));
            outputBlob = await zipFiles(converted);
            outputName = 'pdf_to_text_batch.zip';
            details = `Extracted text from ${files.length} PDFs into one ZIP archive`;
            break;
          }
          outputBlob = await pdfToText(files[0].file);
          outputName = `${files[0].name.replace(/\.pdf$/i, '')}.txt`;
          details = 'Extracted text saved to plain text file';
          break;
        }

        case 'watermark': {
          setProcessingStatus('Stamping watermark text across pages...');
          outputBlob = await watermarkPdf(files[0].file, {
            text: watermarkText,
            fontSize: watermarkFontSize,
            opacity: watermarkOpacity,
            rotation: watermarkPosition === 'diagonal' ? 45 : 0,
            colorHex: watermarkColor,
            position: watermarkPosition,
          });
          outputName = `watermarked_${files[0].name}`;
          details = `Stamped "${watermarkText}" across all pages`;
          break;
        }

        case 'page-numbers': {
          setProcessingStatus('Inserting page number indicators...');
          outputBlob = await addPageNumbersPdf(files[0].file, {
            format: pageNumFormat,
            position: pageNumPos,
            fontSize: 10,
            startFrom: pageNumStart,
          });
          outputName = `numbered_${files[0].name}`;
          details = 'Page numbers placed seamlessly on document';
          break;
        }

        default:
          throw new Error('Tool not implemented yet');
      }

      const downloadUrl = URL.createObjectURL(outputBlob);
      const resItem: ProcessResult = {
        fileName: outputName,
        blob: outputBlob,
        downloadUrl,
        size: outputBlob.size,
        details,
      };

      setResult(resItem);

      // Save to recent files history
      onSaveToHistory({
        id: Math.random().toString(36).substring(2, 9),
        toolId: tool.id,
        toolTitle: tool.title,
        fileName: outputName,
        size: outputBlob.size,
        downloadUrl,
        timestamp: Date.now(),
      });

      // Confetti celebration
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#e11d48', '#3b82f6', '#10b981', '#f59e0b'],
        });
      } catch {
        // ignore
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'An unexpected error occurred while processing the document.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const handleTriggerDownload = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.downloadUrl;
    a.download = result.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-colors">
      {/* Workspace Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-8 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors shrink-0 cursor-pointer"
            title="Back to all tools"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
              <span className="hover:text-slate-900 dark:hover:text-white cursor-pointer" onClick={onBack}>
                Tools
              </span>
              <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-500" />
              <span className="text-slate-900 dark:text-white font-semibold">{tool.title}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-0.5">{tool.title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleLoadSample}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs whitespace-nowrap cursor-pointer"
            title="Load realistic sample document for instant testing"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Load Sample Document</span>
          </button>
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-200/60 dark:border-emerald-900/60">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">100% Client-Side</span>
          </div>
        </div>
      </div>

      {/* Main Workspace Layout */}
      {result ? (
        /* Result Screen */
        <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 sm:p-10 shadow-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-6 shadow-sm">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Your file is ready!</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
            {result.details || 'The file has been processed successfully and is ready to download.'}
          </p>

          {/* File Card */}
          <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 rounded-2xl flex items-center justify-between text-left max-w-lg mx-auto">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="truncate">
                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{result.fileName}</div>
                <div className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                  {formatFileSize(result.size)}
                  {compressedStats && (
                    <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-semibold">
                      (from {formatFileSize(compressedStats.original)})
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Multiple Extracted Images Preview (if PDF to JPG) */}
          {pdfRenderedImages.length > 0 && (
            <div className="mt-6">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Preview of Extracted Pages ({pdfRenderedImages.length}):
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-56 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                {pdfRenderedImages.map((img) => (
                  <div key={img.pageNumber} className="border border-slate-200 dark:border-slate-700 rounded-lg p-1 bg-white dark:bg-slate-800">
                    <img
                      src={img.dataUrl}
                      alt={`Page ${img.pageNumber}`}
                      className="w-full h-24 object-contain rounded"
                      referrerPolicy="no-referrer"
                    />
                    <div className="text-[10px] text-center text-slate-500 dark:text-slate-400 mt-1 font-mono">
                      Page {img.pageNumber}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Primary CTA Download Button */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={handleTriggerDownload}
              className="w-full sm:w-auto px-8 py-3.5 text-sm font-bold text-white bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 rounded-xl shadow-md shadow-rose-600/20 hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download {result.fileName.endsWith('.zip') ? 'ZIP Archive' : 'File'}</span>
            </button>

            <button
              onClick={() => {
                setResult(null);
                setCompressedStats(null);
                setPdfRenderedImages([]);
              }}
              className="w-full sm:w-auto px-5 py-3.5 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Process Another File
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: File Manager / Dropzone / Preview (Span 8) */}
          <div className="lg:col-span-8 space-y-6">
            {/* Drop Zone when no files or when multi-file allowed */}
            {(files.length === 0 || (tool.multiple && files.length > 0)) && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files) handleFilesAdded(e.dataTransfer.files);
                }}
                className={`relative border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center transition-all cursor-pointer ${
                  isDragging
                    ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 scale-[1.01]'
                    : files.length > 0
                    ? 'border-slate-300 dark:border-slate-700 hover:border-rose-400 dark:hover:border-rose-500 bg-white/60 dark:bg-slate-900/60 p-6'
                    : 'border-slate-300 dark:border-slate-700 hover:border-rose-400 dark:hover:border-rose-500 bg-white dark:bg-slate-900 shadow-2xs'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={tool.acceptTypes}
                  multiple={tool.multiple}
                  onChange={(e) => e.target.files && handleFilesAdded(e.target.files)}
                  className="hidden"
                />

                {tool.multiple && (
                  <input
                    ref={folderInputRef}
                    type="file"
                    accept={tool.acceptTypes}
                    multiple
                    {...({ webkitdirectory: '', directory: '' } as any)}
                    onChange={(e) => e.target.files && handleFilesAdded(e.target.files)}
                    className="hidden"
                  />
                )}

                <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>

                <div className="text-base font-bold text-slate-900 dark:text-white">
                  {files.length > 0 ? 'Add more files' : `Choose ${tool.acceptLabel}`}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Drag and drop files here, or choose how to add them below.
                </p>

                <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                  >
                    Select files
                  </button>

                  {tool.multiple && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        folderInputRef.current?.click();
                      }}
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:border-rose-300 dark:hover:border-rose-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                    >
                      Select folder
                    </button>
                  )}
                </div>

                <div className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
                  Accepts: {tool.acceptLabel} · batch mode: select multiple files or a full folder · 100% Private Client-Side
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-800 text-xs">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Execution Error</div>
                  <div className="mt-0.5">{error}</div>
                </div>
              </div>
            )}

            {/* Organize Tool Specific Visual Grid */}
            {tool.id === 'organize' && files.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Page Layout ({pagesList.filter((p) => !p.isDeleted).length} of {pagesList.length} pages active)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Rotate, reorder, or delete individual pages.</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setPagesList((prev) =>
                          prev.map((p) => ({ ...p, rotation: (p.rotation + 90) % 360 }))
                        );
                      }}
                      className="px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                      title="Rotate all pages 90° clockwise"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Rotate All</span>
                    </button>
                    <button
                      onClick={() => {
                        setPagesList((prev) => prev.map((p) => ({ ...p, isDeleted: false, rotation: 0 })));
                      }}
                      className="px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                      title="Reset page ordering and rotations"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>

                {isLoadingPages ? (
                  <div className="py-12 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-rose-600 dark:text-rose-400" />
                    <span className="text-xs">Generating high-fidelity page previews...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[500px] overflow-y-auto p-1">
                    {pagesList.map((page, idx) => (
                      <div
                        key={`${page.sourceFileName ?? 'file'}-${page.sourcePageNumber ?? page.pageNumber}`}
                        draggable={!page.isDeleted}
                        onDragStart={() => setDraggedPageIndex(idx)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (draggedPageIndex === null) return;
                          reorderPages(draggedPageIndex, idx);
                          setDraggedPageIndex(null);
                        }}
                        onDragEnd={() => setDraggedPageIndex(null)}
                        className={`relative group border rounded-xl p-2 transition-all flex flex-col justify-between cursor-grab active:cursor-grabbing ${
                          page.isDeleted
                            ? 'opacity-40 bg-slate-100 dark:bg-slate-800/80 border-dashed border-slate-300 dark:border-slate-700'
                            : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-750 hover:border-rose-400 dark:hover:border-rose-500 hover:shadow-xs'
                        }`}
                      >
                        <div className="relative aspect-[3/4] bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center">
                          {page.thumbnailUrl ? (
                            <img
                              src={page.thumbnailUrl}
                              alt={`Page ${page.pageNumber}`}
                              style={{ transform: `rotate(${page.rotation}deg)` }}
                              className="w-full h-full object-contain transition-transform"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="text-slate-400 dark:text-slate-500 text-xs">Page {page.pageNumber}</div>
                          )}

                          {page.isDeleted && (
                            <div className="absolute inset-0 bg-red-900/30 backdrop-blur-[1px] flex items-center justify-center text-xs font-bold text-red-500 dark:text-red-400 uppercase">
                              Deleted
                            </div>
                          )}
                        </div>

                        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
                          <span className="font-mono font-bold">#{idx + 1}</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => reorderPages(idx, Math.max(0, idx - 1))}
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                              title="Move page up"
                            >
                              <MoveUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => reorderPages(idx, Math.min(pagesList.length - 1, idx + 1))}
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                              title="Move page down"
                            >
                              <MoveDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setPagesList((prev) =>
                                  prev.map((p, i) =>
                                    i === idx ? { ...p, rotation: (p.rotation + 90) % 360 } : p
                                  )
                                );
                              }}
                              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                              title="Rotate 90° clockwise"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setPagesList((prev) =>
                                  prev.map((p, i) => (i === idx ? { ...p, isDeleted: !p.isDeleted } : p))
                                );
                              }}
                              className={`p-1 rounded cursor-pointer ${
                                page.isDeleted
                                  ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300'
                                  : 'hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400'
                              }`}
                              title={page.isDeleted ? 'Restore page' : 'Delete page'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Standard File List (Merge, Images, Single Files) */}
            {files.length > 0 && tool.id !== 'organize' && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-2xs">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    Selected {files.length === 1 ? 'File' : `Files (${files.length})`}
                  </div>
                  {tool.multiple && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add files</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2.5">
                  {files.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3.5 bg-slate-50/80 hover:bg-slate-50 dark:bg-slate-800/60 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-xl transition-colors group"
                    >
                      <div className="flex items-center gap-3 overflow-hidden min-w-0">
                        {item.previewUrl ? (
                          <img
                            src={item.previewUrl}
                            alt=""
                            className="w-10 h-10 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                        )}

                        <div className="truncate">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{item.name}</div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            <span>{formatFileSize(item.size)}</span>
                            {item.pageCount && (
                              <>
                                <span>·</span>
                                <span>{item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-3">
                        {tool.multiple && files.length > 1 && (
                          <>
                            <button
                              onClick={() => handleMoveFile(index, 'up')}
                              disabled={index === 0}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                              title="Move up in order"
                            >
                              <MoveUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleMoveFile(index, 'down')}
                              disabled={index === files.length - 1}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                              title="Move down in order"
                            >
                              <MoveDown className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleRemoveFile(item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                          title="Remove file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Tool Settings & Action Execution (Span 4) */}
          <div className="lg:col-span-4 space-y-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                <SlidersHorizontal className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span>Options & Settings</span>
              </div>

              {/* Tool-specific configuration controls */}
              {/* 1. SPLIT PDF */}
              {tool.id === 'split' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                      Split Mode
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setSplitMode('range')}
                        className={`px-3 py-2 text-xs font-medium rounded-lg border text-center transition-all cursor-pointer ${
                          splitMode === 'range'
                            ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        Custom Range
                      </button>
                      <button
                        onClick={() => setSplitMode('extract_all')}
                        className={`px-3 py-2 text-xs font-medium rounded-lg border text-center transition-all cursor-pointer ${
                          splitMode === 'extract_all'
                            ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        Extract All Pages
                      </button>
                    </div>
                  </div>

                  {splitMode === 'range' && (
                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                        Page Range (e.g., 1-2, 4)
                      </label>
                      <input
                        type="text"
                        value={splitRange}
                        onChange={(e) => setSplitRange(e.target.value)}
                        placeholder="e.g. 1-3, 5"
                        className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      />
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        Total pages in file: {files[0]?.pageCount || 'loading...'}
                      </p>

                      <div className="mt-3 flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="splitZipCheck"
                          checked={splitAsZip}
                          onChange={(e) => setSplitAsZip(e.target.checked)}
                          className="rounded border-slate-300 dark:border-slate-700 text-rose-600 focus:ring-rose-500"
                        />
                        <label htmlFor="splitZipCheck" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                          Download ranges as separate files in ZIP
                        </label>
                      </div>
                    </div>
                  )}

                  {splitMode === 'extract_all' && (
                    <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/60 rounded-xl text-xs text-amber-800 dark:text-amber-200">
                      Every single page of the document will be converted into its own PDF file and packaged in a ZIP archive.
                    </div>
                  )}
                </div>
              )}

              {/* 2. COMPRESS PDF */}
              {tool.id === 'compress' && (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">Compression Level</label>
                  {(
                    [
                      {
                        id: 'extreme',
                        title: 'Extreme Compression',
                        desc: 'Maximum file size reduction (~70% less)',
                      },
                      {
                        id: 'recommended',
                        title: 'Recommended Compression',
                        desc: 'Optimal balance of visual quality and size (~50% less)',
                      },
                      {
                        id: 'low',
                        title: 'Low Compression',
                        desc: 'High visual quality with stream optimization (~20% less)',
                      },
                    ] as const
                  ).map((lvl) => (
                    <div
                      key={lvl.id}
                      onClick={() => setCompressLevel(lvl.id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        compressLevel === lvl.id
                          ? 'border-rose-500 dark:border-rose-600 bg-rose-50/50 dark:bg-rose-950/40 shadow-2xs'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/60'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900 dark:text-white">{lvl.title}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{lvl.desc}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* 3. IMAGES TO PDF */}
              {tool.id === 'jpg-to-pdf' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Orientation
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['auto', 'portrait', 'landscape'] as const).map((ori) => (
                        <button
                          key={ori}
                          onClick={() => setImgOrientation(ori)}
                          className={`py-1.5 text-xs font-medium rounded-lg border capitalize cursor-pointer transition-colors ${
                            imgOrientation === ori
                              ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {ori}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Margins
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['none', 'small', 'large'] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setImgMargin(m)}
                          className={`py-1.5 text-xs font-medium rounded-lg border capitalize cursor-pointer transition-colors ${
                            imgMargin === m
                              ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Page Size
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['a4', 'letter', 'fit'] as const).map((ps) => (
                        <button
                          key={ps}
                          onClick={() => setImgPageSize(ps)}
                          className={`py-1.5 text-xs font-medium rounded-lg border uppercase cursor-pointer transition-colors ${
                            imgPageSize === ps
                              ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {ps}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 4. PDF TO JPG / PNG */}
              {tool.id === 'pdf-to-jpg' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                      Image Format
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setImgFormat('jpeg')}
                        className={`py-2 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
                          imgFormat === 'jpeg'
                            ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        JPG (Smaller)
                      </button>
                      <button
                        onClick={() => setImgFormat('png')}
                        className={`py-2 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
                          imgFormat === 'png'
                            ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        PNG (Crisp)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Render Resolution
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setImgScale(1.5)}
                        className={`py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
                          imgScale === 1.5
                            ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        Standard (150 DPI)
                      </button>
                      <button
                        onClick={() => setImgScale(2.5)}
                        className={`py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
                          imgScale === 2.5
                            ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        Ultra High (300 DPI)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 5. ROTATE PDF */}
              {tool.id === 'rotate' && (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">Rotation Angle</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[90, 180, 270].map((deg) => (
                      <button
                        key={deg}
                        onClick={() => setGlobalRotation(deg)}
                        className={`py-2 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
                          globalRotation === deg
                            ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        +{deg}°
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Rotates all pages clockwise and preserves bookmarks.
                  </p>
                </div>
              )}

              {/* 6. WATERMARK PDF */}
              {tool.id === 'watermark' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Watermark Stamp Text
                    </label>
                    <input
                      type="text"
                      value={watermarkText}
                      onChange={(e) => setWatermarkText(e.target.value)}
                      placeholder="e.g. CONFIDENTIAL"
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Placement
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(['diagonal', 'center', 'top', 'bottom'] as const).map((pos) => (
                        <button
                          key={pos}
                          onClick={() => setWatermarkPosition(pos)}
                          className={`py-1.5 text-xs font-medium rounded-lg border capitalize cursor-pointer transition-colors ${
                            watermarkPosition === pos
                              ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {pos}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      <span>Opacity</span>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{Math.round(watermarkOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="0.9"
                      step="0.05"
                      value={watermarkOpacity}
                      onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
                      className="w-full accent-rose-600"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">Stamp Color</label>
                    <div className="flex items-center gap-2">
                      {[
                        { hex: '#dc2626', label: 'Red' },
                        { hex: '#475569', label: 'Slate' },
                        { hex: '#2563eb', label: 'Blue' },
                        { hex: '#16a34a', label: 'Green' },
                      ].map((c) => (
                        <button
                          key={c.hex}
                          onClick={() => setWatermarkColor(c.hex)}
                          style={{ backgroundColor: c.hex }}
                          className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                            watermarkColor === c.hex ? 'border-slate-900 dark:border-white scale-110' : 'border-white dark:border-slate-700'
                          }`}
                          title={c.label}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 7. PAGE NUMBERS */}
              {tool.id === 'page-numbers' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Numbering Format
                    </label>
                    <div className="space-y-1.5">
                      {[
                        { id: 'page_of_total', label: 'Page 1 of 5' },
                        { id: 'page_only', label: '1 (Number only)' },
                        { id: 'page_label', label: 'p. 1 / 5' },
                      ].map((fmt) => (
                        <button
                          key={fmt.id}
                          onClick={() => setPageNumFormat(fmt.id as any)}
                          className={`w-full text-left px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
                            pageNumFormat === fmt.id
                              ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {fmt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                      Position
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'bottom_center', label: 'Bottom Center' },
                        { id: 'bottom_right', label: 'Bottom Right' },
                        { id: 'bottom_left', label: 'Bottom Left' },
                        { id: 'top_right', label: 'Top Right' },
                      ].map((pos) => (
                        <button
                          key={pos.id}
                          onClick={() => setPageNumPos(pos.id as any)}
                          className={`py-1.5 text-xs font-medium rounded-lg border text-center cursor-pointer transition-colors ${
                            pageNumPos === pos.id
                              ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Conversion Format Info for Document interops */}
              {['word-to-pdf', 'excel-to-pdf', 'text-to-pdf', 'pdf-to-word', 'pdf-to-excel', 'pdf-to-text'].includes(
                tool.id
              ) && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                  <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Native High-Fidelity Converter</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Preserves structure, font styles, and tabular cell data directly in your browser.
                  </p>
                </div>
              )}

              {/* Primary Action Button */}
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={handleExecuteTool}
                  disabled={files.length === 0 || isProcessing}
                  className="w-full py-3.5 text-sm font-bold text-white bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 disabled:from-slate-300 disabled:to-slate-300 dark:disabled:from-slate-800 dark:disabled:to-slate-800 dark:disabled:text-slate-500 disabled:cursor-not-allowed rounded-xl shadow-md shadow-rose-600/20 hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{processingStatus || 'Processing...'}</span>
                    </>
                  ) : (
                    <>
                      <ToolIcon name={tool.iconName} className="w-4 h-4" />
                      <span>Execute {tool.title}</span>
                    </>
                  )}
                </button>
                <div className="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
                  Runs instantly with zero server uploads
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
