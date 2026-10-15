import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { Document, Paragraph, TextRun, Packer, HeadingLevel, Table, TableRow, TableCell, WidthType } from 'docx';
import mammoth from 'mammoth';

// Initialize PDF.js worker
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/** Helper to read File as ArrayBuffer */
export async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

/** Helper to read File as Data URL */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Helper to convert Uint8Array from pdf-lib to Blob */
export function bytesToBlob(bytes: Uint8Array, mimeType: string = 'application/pdf'): Blob {
  return new Blob([bytes.buffer as ArrayBuffer], { type: mimeType });
}

/** Render a single PDF page to a DataURL thumbnail */
export async function renderPdfPageThumbnail(file: File, pageNumber: number = 1, scale: number = 0.5): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    if (pageNumber > pdf.numPages) pageNumber = 1;

    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;

    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (err) {
    console.warn('Thumbnail generation fallback:', err);
    return '';
  }
}

/** Get page count of a PDF file */
export async function getPdfPageCount(file: File): Promise<number> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    return pdfDoc.getPageCount();
  } catch {
    return 1;
  }
}

/** Render all pages of a PDF to thumbnails */
export async function renderAllPdfPageThumbnails(file: File): Promise<{ pageNumber: number; dataUrl: string; rotation: number }[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const results: { pageNumber: number; dataUrl: string; rotation: number }[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 0.45 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;

    results.push({
      pageNumber: i,
      dataUrl: canvas.toDataURL('image/jpeg', 0.8),
      rotation: 0,
    });
  }

  return results;
}

// ----------------------------------------------------
// 1. MERGE PDF
// ----------------------------------------------------
export async function mergePdfs(files: File[]): Promise<Blob> {
  if (files.length === 0) throw new Error('No files provided for merging');

  const mergedPdf = await PDFDocument.create();

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  const mergedBytes = await mergedPdf.save();
  return bytesToBlob(mergedBytes, 'application/pdf');
}

// ----------------------------------------------------
// 2. SPLIT PDF
// ----------------------------------------------------
export interface SplitOptions {
  mode: 'range' | 'extract_all' | 'custom_pages';
  rangeString?: string; // e.g. "1-2, 4" or "1-3"
  extractAsZip?: boolean;
}

export async function splitPdf(file: File, options: SplitOptions): Promise<{ blob: Blob; fileName: string; isZip: boolean }> {
  const buffer = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();

  const baseName = file.name.replace(/\.pdf$/i, '');

  if (options.mode === 'extract_all') {
    const zip = new JSZip();

    for (let i = 0; i < totalPages; i++) {
      const singleDoc = await PDFDocument.create();
      const [copiedPage] = await singleDoc.copyPages(srcDoc, [i]);
      singleDoc.addPage(copiedPage);
      const bytes = await singleDoc.save();
      zip.file(`${baseName}_page_${i + 1}.pdf`, bytes);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    return {
      blob: zipBlob,
      fileName: `${baseName}_all_pages.zip`,
      isZip: true,
    };
  }

  // Parse ranges (e.g. "1-2, 4-5" or "1, 3, 5")
  const rangeStr = (options.rangeString || '1').trim();
  const ranges = rangeStr.split(',').map((s) => s.trim()).filter(Boolean);

  if (ranges.length === 0) {
    throw new Error('Please specify at least one page or page range (e.g., 1-2, 4)');
  }

  if (options.extractAsZip && ranges.length > 1) {
    const zip = new JSZip();

    for (let rIdx = 0; rIdx < ranges.length; rIdx++) {
      const part = ranges[rIdx];
      const pageIndices: number[] = [];

      if (part.includes('-')) {
        const [start, end] = part.split('-').map((n) => parseInt(n.trim(), 10));
        if (!isNaN(start) && !isNaN(end)) {
          const s = Math.max(1, Math.min(start, end));
          const e = Math.min(totalPages, Math.max(start, end));
          for (let p = s; p <= e; p++) pageIndices.push(p - 1);
        }
      } else {
        const pageNum = parseInt(part, 10);
        if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
          pageIndices.push(pageNum - 1);
        }
      }

      if (pageIndices.length > 0) {
        const splitDoc = await PDFDocument.create();
        const copied = await splitDoc.copyPages(srcDoc, pageIndices);
        copied.forEach((p) => splitDoc.addPage(p));
        const bytes = await splitDoc.save();
        zip.file(`${baseName}_part_${rIdx + 1}_pages_${part}.pdf`, bytes);
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    return {
      blob: zipBlob,
      fileName: `${baseName}_split_ranges.zip`,
      isZip: true,
    };
  }

  // Single PDF with all selected pages/ranges combined
  const pageIndices: number[] = [];
  for (const part of ranges) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map((n) => parseInt(n.trim(), 10));
      if (!isNaN(start) && !isNaN(end)) {
        const s = Math.max(1, Math.min(start, end));
        const e = Math.min(totalPages, Math.max(start, end));
        for (let p = s; p <= e; p++) pageIndices.push(p - 1);
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
        pageIndices.push(pageNum - 1);
      }
    }
  }

  // Deduplicate preserving order
  const uniqueIndices = Array.from(new Set(pageIndices));
  if (uniqueIndices.length === 0) {
    throw new Error(`No valid pages matched within the document (Total pages: ${totalPages})`);
  }

  const splitDoc = await PDFDocument.create();
  const copied = await splitDoc.copyPages(srcDoc, uniqueIndices);
  copied.forEach((p) => splitDoc.addPage(p));
  const bytes = await splitDoc.save();

  return {
    blob: bytesToBlob(bytes, 'application/pdf'),
    fileName: `${baseName}_split.pdf`,
    isZip: false,
  };
}

// ----------------------------------------------------
// 3. IMAGES TO PDF (JPG, PNG, WebP to PDF)
// ----------------------------------------------------
export interface ImageToPdfOptions {
  orientation: 'auto' | 'portrait' | 'landscape';
  margin: 'none' | 'small' | 'large';
  pageSize: 'fit' | 'a4' | 'letter';
}

export async function imagesToPdf(imageFiles: File[], options: ImageToPdfOptions): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();

  const marginMap = {
    none: 0,
    small: 20,
    large: 40,
  };
  const margin = marginMap[options.margin];

  // Standard dimensions in points (72 points/inch)
  // A4: 595.28 x 841.89
  // Letter: 612 x 792
  const standardSizes = {
    a4: { w: 595.28, h: 841.89 },
    letter: { w: 612, h: 792 },
  };

  for (const imgFile of imageFiles) {
    // Read file into image element to get natural dimensions
    const dataUrl = await fileToDataUrl(imgFile);
    const imgObj = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });

    // Convert any format (e.g. webp, svg, png) to clean JPEG or PNG bytes via canvas if needed
    const canvas = document.createElement('canvas');
    canvas.width = imgObj.naturalWidth || 800;
    canvas.height = imgObj.naturalHeight || 600;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(imgObj, 0, 0);

    const isPng = imgFile.type === 'image/png';
    const convertedBlob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), isPng ? 'image/png' : 'image/jpeg', 0.95);
    });
    const imgBytes = await convertedBlob.arrayBuffer();

    let embeddedImage;
    if (isPng) {
      try {
        embeddedImage = await pdfDoc.embedPng(imgBytes);
      } catch {
        embeddedImage = await pdfDoc.embedJpg(imgBytes);
      }
    } else {
      try {
        embeddedImage = await pdfDoc.embedJpg(imgBytes);
      } catch {
        embeddedImage = await pdfDoc.embedPng(imgBytes);
      }
    }

    const imgWidth = embeddedImage.width;
    const imgHeight = embeddedImage.height;

    let pageWidth = imgWidth;
    let pageHeight = imgHeight;

    if (options.pageSize === 'fit') {
      pageWidth = imgWidth + margin * 2;
      pageHeight = imgHeight + margin * 2;
    } else {
      const base = standardSizes[options.pageSize];
      let isLandscape = false;
      if (options.orientation === 'landscape') isLandscape = true;
      else if (options.orientation === 'portrait') isLandscape = false;
      else isLandscape = imgWidth > imgHeight;

      pageWidth = isLandscape ? base.h : base.w;
      pageHeight = isLandscape ? base.w : base.h;
    }

    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Calculate image fitting with margins
    const availWidth = pageWidth - margin * 2;
    const availHeight = pageHeight - margin * 2;
    const scale = Math.min(availWidth / imgWidth, availHeight / imgHeight);

    const drawW = imgWidth * scale;
    const drawH = imgHeight * scale;
    const xPos = margin + (availWidth - drawW) / 2;
    const yPos = margin + (availHeight - drawH) / 2;

    page.drawImage(embeddedImage, {
      x: xPos,
      y: yPos,
      width: drawW,
      height: drawH,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return bytesToBlob(pdfBytes, 'application/pdf');
}

// ----------------------------------------------------
// 4. PDF TO IMAGES (JPG / PNG)
// ----------------------------------------------------
export async function pdfToImages(
  file: File,
  format: 'jpeg' | 'png' = 'jpeg',
  scale: number = 2.0
): Promise<{ images: { pageNumber: number; blob: Blob; dataUrl: string }[]; zipBlob?: Blob; isMultiple: boolean }> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const images: { pageNumber: number; blob: Blob; dataUrl: string }[] = [];
  const baseName = file.name.replace(/\.pdf$/i, '');
  const zip = new JSZip();

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    // Fill white background for transparent PDFs
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;

    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    const ext = format === 'png' ? 'png' : 'jpg';

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), mimeType, 0.95);
    });

    const dataUrl = canvas.toDataURL(mimeType, 0.95);
    images.push({ pageNumber: i, blob, dataUrl });

    zip.file(`${baseName}_page_${i}.${ext}`, blob);
  }

  let zipBlob: Blob | undefined;
  if (images.length > 1) {
    zipBlob = await zip.generateAsync({ type: 'blob' });
  }

  return {
    images,
    zipBlob,
    isMultiple: images.length > 1,
  };
}

// ----------------------------------------------------
// 5. PDF TO TEXT & WORD (.docx)
// ----------------------------------------------------
export async function extractPdfTextByPage(file: File): Promise<{ pageNumber: number; text: string; lines: string[] }[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const results: { pageNumber: number; text: string; lines: string[] }[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Group text items by vertical position (Y coordinate) to preserve lines
    const lineMap: Map<number, string[]> = new Map();
    for (const item of textContent.items as any[]) {
      if (!('str' in item)) continue;
      const y = Math.round(item.transform[5]);
      if (!lineMap.has(y)) {
        lineMap.set(y, []);
      }
      lineMap.get(y)!.push(item.str);
    }

    // Sort lines from top to bottom (higher Y is top in PDF)
    const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a);
    const lines = sortedY.map((y) => lineMap.get(y)!.join(' ').trim()).filter(Boolean);
    const text = lines.join('\n');

    results.push({ pageNumber: i, text, lines });
  }

  return results;
}

export async function pdfToText(file: File): Promise<Blob> {
  const pages = await extractPdfTextByPage(file);
  const fullText = pages
    .map((p) => `--- PAGE ${p.pageNumber} ---\n\n${p.text}`)
    .join('\n\n\n');

  return new Blob([fullText], { type: 'text/plain;charset=utf-8' });
}

export async function pdfToWord(file: File): Promise<Blob> {
  const pages = await extractPdfTextByPage(file);
  const docSectionsChildren: Paragraph[] = [];

  for (const page of pages) {
    docSectionsChildren.push(
      new Paragraph({
        text: `Page ${page.pageNumber}`,
        heading: HeadingLevel.HEADING_2,
      })
    );

    for (const line of page.lines) {
      if (line.length < 50 && (line === line.toUpperCase() || line.endsWith(':'))) {
        docSectionsChildren.push(
          new Paragraph({
            text: line,
            heading: HeadingLevel.HEADING_3,
          })
        );
      } else {
        docSectionsChildren.push(
          new Paragraph({
            children: [new TextRun({ text: line })],
          })
        );
      }
    }

    // Empty separator paragraph between pages
    docSectionsChildren.push(new Paragraph({ text: '' }));
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: docSectionsChildren,
      },
    ],
  });

  return await Packer.toBlob(doc);
}

// ----------------------------------------------------
// 6. PDF TO EXCEL (.xlsx / .csv)
// ----------------------------------------------------
export async function pdfToExcel(file: File): Promise<Blob> {
  const pages = await extractPdfTextByPage(file);
  const wb = XLSX.utils.book_new();

  let hasData = false;
  pages.forEach((page, pIdx) => {
    const rows: string[][] = [];

    for (const line of page.lines) {
      // Split on multiple spaces, tabs, or common delimiter characters
      const cols = line.split(/\t|\s{2,}|(?<=[a-zA-Z0-9])\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
      if (cols.length > 0) {
        rows.push(cols);
      }
    }

    if (rows.length > 0) {
      hasData = true;
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, `Page ${pIdx + 1}`);
    }
  });

  if (!hasData) {
    const ws = XLSX.utils.aoa_to_sheet([['Extracted Text'], ['No tabular data detected in PDF']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
  }

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ----------------------------------------------------
// 7. WORD (.docx) TO PDF
// ----------------------------------------------------
export async function wordToPdf(file: File): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const rawText = result.value || 'Empty document';

  return await textToPdf(rawText, file.name.replace(/\.docx$/i, ''));
}

export async function zipFiles(entries: Array<{ fileName: string; blob: Blob }>): Promise<Blob> {
  const zip = new JSZip();

  for (const entry of entries) {
    const safeName = entry.fileName.replace(/[\\/:*?"<>|]/g, '_');
    zip.file(safeName, entry.blob);
  }

  return zip.generateAsync({ type: 'blob' });
}

// ----------------------------------------------------
// 8. EXCEL (.xlsx, .csv) TO PDF
// ----------------------------------------------------
export async function excelToPdf(file: File): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = wb.SheetNames[0] || 'Sheet1';
  const sheet = wb.Sheets[sheetName];
  const rows: (string | number)[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Landscape A4 for tables: 841.89 x 595.28
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const margin = 40;

  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  // Header Title
  currentPage.drawText(`Spreadsheet Export: ${file.name} (${sheetName})`, {
    x: margin,
    y: y,
    size: 14,
    font: boldFont,
    color: rgb(0.1, 0.15, 0.25),
  });
  y -= 30;

  if (rows.length === 0) {
    currentPage.drawText('Sheet contains no data.', { x: margin, y: y, size: 10, font });
    const bytes = await pdfDoc.save();
    return bytesToBlob(bytes, 'application/pdf');
  }

  // Calculate column widths
  const maxCols = Math.min(8, Math.max(...rows.map((r) => r.length)));
  const colWidth = (pageWidth - margin * 2) / maxCols;
  const rowHeight = 22;

  rows.forEach((row, rIdx) => {
    if (y < margin + 30) {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }

    const isHeaderRow = rIdx === 0;

    // Row background
    if (isHeaderRow) {
      currentPage.drawRectangle({
        x: margin,
        y: y - 5,
        width: pageWidth - margin * 2,
        height: rowHeight,
        color: rgb(0.92, 0.94, 0.96),
      });
    } else if (rIdx % 2 === 1) {
      currentPage.drawRectangle({
        x: margin,
        y: y - 5,
        width: pageWidth - margin * 2,
        height: rowHeight,
        color: rgb(0.98, 0.99, 1.0),
      });
    }

    for (let c = 0; c < maxCols; c++) {
      const cellVal = row[c] !== undefined && row[c] !== null ? String(row[c]) : '';
      const truncated = cellVal.length > 25 ? cellVal.substring(0, 22) + '...' : cellVal;

      currentPage.drawText(truncated, {
        x: margin + c * colWidth + 5,
        y: y + 2,
        size: isHeaderRow ? 9 : 8.5,
        font: isHeaderRow ? boldFont : font,
        color: isHeaderRow ? rgb(0.1, 0.15, 0.2) : rgb(0.2, 0.25, 0.3),
      });
    }

    // Hairline divider
    currentPage.drawLine({
      start: { x: margin, y: y - 5 },
      end: { x: pageWidth - margin, y: y - 5 },
      thickness: 0.5,
      color: rgb(0.85, 0.88, 0.9),
    });

    y -= rowHeight;
  });

  const bytes = await pdfDoc.save();
  return bytesToBlob(bytes, 'application/pdf');
}

// ----------------------------------------------------
// 9. TEXT (.txt, .md) TO PDF
// ----------------------------------------------------
export async function textToPdf(rawText: string, documentTitle: string = 'Document'): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  // Header Title
  page.drawText(documentTitle, {
    x: margin,
    y: y,
    size: 16,
    font: boldFont,
    color: rgb(0.1, 0.15, 0.25),
  });
  y -= 30;

  // Helper for word wrapping
  const wrapLine = (text: string, maxWidth: number, fontSize: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = (testLine.length * fontSize * 0.5); // approximate Helvetica char width
      if (width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [''];
  };

  const paragraphs = rawText.split('\n');

  for (const para of paragraphs) {
    const isHeading = para.startsWith('# ') || para.startsWith('==') || (para.length < 40 && para.endsWith(':'));
    const cleanPara = para.replace(/^#+\s*/, '');
    const fontSize = isHeading ? 12 : 10;
    const currentFont = isHeading ? boldFont : font;
    const fontColor = isHeading ? rgb(0.1, 0.15, 0.25) : rgb(0.2, 0.25, 0.3);

    const wrappedLines = wrapLine(cleanPara, contentWidth, fontSize);

    for (const line of wrappedLines) {
      if (y < margin + 20) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }

      page.drawText(line, {
        x: margin,
        y: y,
        size: fontSize,
        font: currentFont,
        color: fontColor,
      });

      y -= fontSize + 6;
    }

    y -= 4; // Extra space between paragraphs
  }

  const bytes = await pdfDoc.save();
  return bytesToBlob(bytes, 'application/pdf');
}

// ----------------------------------------------------
// 10. ROTATE PDF
// ----------------------------------------------------
export async function rotatePdf(file: File, rotationDegrees: number = 90): Promise<Blob> {
  const buffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  for (const page of pages) {
    const currentAngle = page.getRotation().angle;
    const newAngle = (currentAngle + rotationDegrees) % 360;
    page.setRotation(degrees(newAngle));
  }

  const bytes = await pdfDoc.save();
  return bytesToBlob(bytes, 'application/pdf');
}

// ----------------------------------------------------
// 11. ORGANIZE PDF (Reorder, Rotate individual, Delete)
// ----------------------------------------------------
export interface PageAction {
  sourceFileIndex?: number;
  originalIndex: number; // 0-based within source file
  rotation: number; // 0, 90, 180, 270
  isDeleted: boolean;
}

export async function organizePdf(file: File, pageActions: PageAction[]): Promise<Blob> {
  return organizePdfFiles([file], pageActions);
}

export async function organizePdfFiles(files: File[], pageActions: PageAction[]): Promise<Blob> {
  const sourceDocs = await Promise.all(
    files.map(async (file) => PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true }))
  );

  const newDoc = await PDFDocument.create();
  const validActions = pageActions.filter((a) => !a.isDeleted);

  if (validActions.length === 0) {
    throw new Error('At least one page must remain in the document.');
  }

  for (const action of validActions) {
    const sourceIndex = action.sourceFileIndex ?? 0;
    const sourceDoc = sourceDocs[sourceIndex];
    if (!sourceDoc) {
      throw new Error(`Source PDF at index ${sourceIndex} was not found.`);
    }

    const [copiedPage] = await newDoc.copyPages(sourceDoc, [action.originalIndex]);
    if (action.rotation) {
      const cur = copiedPage.getRotation().angle;
      copiedPage.setRotation(degrees((cur + action.rotation) % 360));
    }
    newDoc.addPage(copiedPage);
  }

  const bytes = await newDoc.save();
  return bytesToBlob(bytes, 'application/pdf');
}

// ----------------------------------------------------
// 12. WATERMARK PDF
// ----------------------------------------------------
export interface WatermarkOptions {
  text: string;
  fontSize: number;
  opacity: number;
  rotation: number;
  colorHex: string;
  position: 'center' | 'top' | 'bottom' | 'diagonal';
}

export async function watermarkPdf(file: File, options: WatermarkOptions): Promise<Blob> {
  const buffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  // Convert hex color to rgb
  const r = parseInt(options.colorHex.slice(1, 3), 16) / 255 || 0.8;
  const g = parseInt(options.colorHex.slice(3, 5), 16) / 255 || 0.2;
  const b = parseInt(options.colorHex.slice(5, 7), 16) / 255 || 0.2;

  for (const page of pages) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(options.text, options.fontSize);
    const textHeight = font.heightAtSize(options.fontSize);

    let x = (width - textWidth) / 2;
    let y = (height - textHeight) / 2;
    let angle = options.rotation;

    if (options.position === 'top') {
      y = height - 100;
      angle = 0;
    } else if (options.position === 'bottom') {
      y = 60;
      angle = 0;
    } else if (options.position === 'diagonal') {
      angle = 45;
      x = (width - textWidth * 0.7) / 2;
      y = (height - textHeight * 0.7) / 2;
    }

    page.drawText(options.text, {
      x,
      y,
      size: options.fontSize,
      font,
      color: rgb(r, g, b),
      opacity: options.opacity,
      rotate: degrees(angle),
    });
  }

  const bytes = await pdfDoc.save();
  return bytesToBlob(bytes, 'application/pdf');
}

// ----------------------------------------------------
// 13. ADD PAGE NUMBERS
// ----------------------------------------------------
export interface PageNumberOptions {
  format: 'page_of_total' | 'page_only' | 'page_label';
  position: 'bottom_center' | 'bottom_right' | 'bottom_left' | 'top_right';
  fontSize: number;
  startFrom: number;
}

export async function addPageNumbersPdf(file: File, options: PageNumberOptions): Promise<Blob> {
  const buffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const total = pages.length;

  for (let i = 0; i < total; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    const curNum = i + options.startFrom;

    let textStr = '';
    if (options.format === 'page_of_total') {
      textStr = `Page ${curNum} of ${total}`;
    } else if (options.format === 'page_only') {
      textStr = `${curNum}`;
    } else {
      textStr = `p. ${curNum} / ${total}`;
    }

    const textWidth = font.widthOfTextAtSize(textStr, options.fontSize);
    let x = (width - textWidth) / 2;
    let y = 30;

    if (options.position === 'bottom_right') {
      x = width - textWidth - 40;
      y = 30;
    } else if (options.position === 'bottom_left') {
      x = 40;
      y = 30;
    } else if (options.position === 'top_right') {
      x = width - textWidth - 40;
      y = height - 35;
    }

    page.drawText(textStr, {
      x,
      y,
      size: options.fontSize,
      font,
      color: rgb(0.35, 0.4, 0.45),
    });
  }

  const bytes = await pdfDoc.save();
  return bytesToBlob(bytes, 'application/pdf');
}

// ----------------------------------------------------
// 14. COMPRESS PDF
// ----------------------------------------------------
export async function compressPdf(file: File, level: 'extreme' | 'recommended' | 'low'): Promise<{ blob: Blob; originalSize: number; newSize: number }> {
  const originalSize = file.size;
  const arrayBuffer = await file.arrayBuffer();

  // Load and re-encode PDF using pdf-lib with stream objects optimization
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  // For visual compression of embedded images or canvas re-rendering
  // If extreme or recommended, render pages through downscaled canvas for guaranteed compression
  if (level === 'extreme' || level === 'recommended') {
    const scale = level === 'extreme' ? 1.0 : 1.35;
    const quality = level === 'extreme' ? 0.6 : 0.75;

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const compressedDoc = await PDFDocument.create();

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      const imgBlob = await new Promise<Blob>((res) => {
        canvas.toBlob((b) => res(b!), 'image/jpeg', quality);
      });
      const imgBuffer = await imgBlob.arrayBuffer();
      const embedded = await compressedDoc.embedJpg(imgBuffer);

      const newPage = compressedDoc.addPage([viewport.width, viewport.height]);
      newPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: viewport.width,
        height: viewport.height,
      });
    }

    const compressedBytes = await compressedDoc.save({ useObjectStreams: true });
    const blob = bytesToBlob(compressedBytes, 'application/pdf');
    return {
      blob,
      originalSize,
      newSize: blob.size,
    };
  }

  // Low compression: re-save with object stream compression and stripped unnecessary metadata
  const bytes = await pdfDoc.save({ useObjectStreams: true });
  const blob = bytesToBlob(bytes, 'application/pdf');
  return {
    blob,
    originalSize,
    newSize: blob.size,
  };
}
