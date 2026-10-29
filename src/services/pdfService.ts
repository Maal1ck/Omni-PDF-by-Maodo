import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { Document, Paragraph, TextRun, Packer, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun } from 'docx';
import mammoth from 'mammoth';
import { renderAsync as renderDocx } from 'docx-preview';
import html2canvas from 'html2canvas';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PdfEditAnnotation } from '../types';

// Initialize PDF.js worker
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

const pdfPageRenderTasks = new WeakMap<HTMLCanvasElement, pdfjsLib.RenderTask>();
const pdfPageRenderTokens = new WeakMap<HTMLCanvasElement, number>();

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

export async function renderPdfPageToCanvas(
  file: File,
  pageNumber: number,
  canvas: HTMLCanvasElement
): Promise<{ pageCount: number }> {
  const token = (pdfPageRenderTokens.get(canvas) ?? 0) + 1;
  pdfPageRenderTokens.set(canvas, token);
  pdfPageRenderTasks.get(canvas)?.cancel();

  const loadingTask = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
  const pdf = await loadingTask.promise;
  try {
    if (token !== pdfPageRenderTokens.get(canvas)) return { pageCount: pdf.numPages };
    if (pageNumber < 1 || pageNumber > pdf.numPages) {
      throw new Error(`Page ${pageNumber} is outside this PDF's page range.`);
    }

    const page = await pdf.getPage(pageNumber);
    if (token !== pdfPageRenderTokens.get(canvas)) return { pageCount: pdf.numPages };
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1.35, 760 / baseViewport.width);
    const viewport = page.getViewport({ scale });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not create a PDF preview canvas.');
    const task = page.render({ canvasContext: context, viewport });
    pdfPageRenderTasks.set(canvas, task);
    try {
      await task.promise;
    } finally {
      if (pdfPageRenderTasks.get(canvas) === task) pdfPageRenderTasks.delete(canvas);
    }
    return { pageCount: pdf.numPages };
  } finally {
    await pdf.destroy();
  }
}

export function cancelPdfPageRender(canvas: HTMLCanvasElement): void {
  pdfPageRenderTokens.set(canvas, (pdfPageRenderTokens.get(canvas) ?? 0) + 1);
  pdfPageRenderTasks.get(canvas)?.cancel();
  pdfPageRenderTasks.delete(canvas);
}

export async function editPdf(file: File, annotations: PdfEditAnnotation[]): Promise<Blob> {
  const fileBytes = await file.arrayBuffer();
  if (/\/ByteRange\s*\[/.test(new TextDecoder('latin1').decode(fileBytes))) {
    throw new Error('This PDF already contains a digital signature. Editing it could invalidate that signature.');
  }
  const sourceDoc = await PDFDocument.load(fileBytes);
  if (annotations.length === 0) throw new Error('Add text or a signature before exporting.');
  if (annotations.some((annotation) => !Number.isInteger(annotation.pageIndex) || annotation.pageIndex < 0 || annotation.pageIndex >= sourceDoc.getPageCount())) {
    throw new Error('An edit refers to a page that is not in this PDF.');
  }
  const outputDoc = await PDFDocument.create();
  const pdfJsTask = pdfjsLib.getDocument({ data: fileBytes.slice(0) });
  const pdfJsDoc = await pdfJsTask.promise;
  const replacementPages = new Set(
    annotations.filter((annotation) => annotation.kind === 'replace').map((annotation) => annotation.pageIndex)
  );
  const font = await outputDoc.embedFont(StandardFonts.Helvetica);
  const italicFont = await outputDoc.embedFont(StandardFonts.HelveticaOblique);

  for (let pageIndex = 0; pageIndex < sourceDoc.getPageCount(); pageIndex += 1) {
    const pageAnnotations = annotations.filter((annotation) => annotation.pageIndex === pageIndex);
    if (pageAnnotations.length === 0) {
      const [copiedPage] = await outputDoc.copyPages(sourceDoc, [pageIndex]);
      outputDoc.addPage(copiedPage);
      continue;
    }

    if (replacementPages.has(pageIndex)) {
      const renderedPage = await pdfJsDoc.getPage(pageIndex + 1);
      const viewport = renderedPage.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not flatten the edited PDF page.');
      await renderedPage.render({ canvasContext: context, viewport }).promise;

      for (const annotation of pageAnnotations) {
        const x = annotation.x * canvas.width;
        const y = annotation.y * canvas.height;
        if (annotation.kind === 'replace') {
          const width = (annotation.width ?? 0) * canvas.width;
          const height = (annotation.height ?? 0) * canvas.height;
          context.fillStyle = '#ffffff';
          context.fillRect(x, y, width, height);
          context.fillStyle = '#141923';
          context.font = `${Math.max(14, Math.min(32, height * 0.62))}px Arial, sans-serif`;
          context.textBaseline = 'middle';
          context.fillText(annotation.text ?? '', x + 5, y + height / 2, Math.max(1, width - 10));
        } else if (annotation.kind === 'signature' && annotation.imageData) {
          const image = new Image();
          image.src = annotation.imageData;
          await image.decode();
          const width = Math.min(canvas.width * 0.32, 300);
          const height = width * (image.height / image.width);
          context.drawImage(image, x, y, width, height);
        } else if (annotation.text) {
          context.fillStyle = '#141923';
          context.font = `${annotation.kind === 'signature' ? 'italic 28px' : '16px'} Arial, sans-serif`;
          context.textBaseline = 'top';
          context.fillText(annotation.text, x, y, canvas.width - x);
        }
      }

      const imageBytes = Uint8Array.from(
        atob(canvas.toDataURL('image/png').split(',')[1]),
        (char) => char.charCodeAt(0)
      );
      const image = await outputDoc.embedPng(imageBytes);
      const flattenedPage = outputDoc.addPage([viewport.width / 2, viewport.height / 2]);
      flattenedPage.drawImage(image, {
        x: 0,
        y: 0,
        width: flattenedPage.getWidth(),
        height: flattenedPage.getHeight(),
      });
      canvas.width = 0;
      canvas.height = 0;
      continue;
    }

    const [page] = await outputDoc.copyPages(sourceDoc, [pageIndex]);
    outputDoc.addPage(page);
    for (const annotation of pageAnnotations) {
      const x = annotation.x * page.getWidth();
      const topY = (1 - annotation.y) * page.getHeight();
      if (annotation.kind === 'signature' && annotation.imageData) {
        const base64 = annotation.imageData.split(',')[1];
        if (!base64) throw new Error('The signature image is not valid.');
        const signatureBytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        const image = await outputDoc.embedPng(signatureBytes);
        const width = Math.min(150, page.getWidth() * 0.32);
        const height = width * (image.height / image.width);
        page.drawImage(image, {
          x,
          y: Math.max(0, topY - height),
          width,
          height,
        });
      } else if (annotation.text) {
        page.drawText(annotation.text, {
          x,
          y: Math.max(0, topY - 16),
          size: annotation.kind === 'signature' ? 22 : 12,
          font: annotation.kind === 'signature' ? italicFont : font,
          color: rgb(0.08, 0.1, 0.16),
          maxWidth: page.getWidth() - x,
        });
      }
    }
  }

  await pdfJsDoc.destroy();
  return bytesToBlob(await outputDoc.save(), 'application/pdf');
}

export async function signPdfWithP12(
  pdf: Blob,
  certificate: Uint8Array,
  passphrase: string,
  signerName: string
): Promise<Blob> {
  if (!window.omniPdf?.signPdf) {
    throw new Error('Certificate-based signing is available only in the installed desktop app.');
  }
  if (certificate.length === 0 || !passphrase || !signerName.trim()) {
    throw new Error('Select your certificate, enter its password, and provide a signer name.');
  }
  const signedBytes = await window.omniPdf.signPdf(
    new Uint8Array(await pdf.arrayBuffer()),
    certificate,
    passphrase,
    signerName.trim()
  );
  return bytesToBlob(signedBytes, 'application/pdf');
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

export async function pdfToWord(file: File, mode: 'visual' | 'editable' = 'editable'): Promise<Blob> {
  if (mode === 'visual') {
    const loadingTask = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
    const pdf = await loadingTask.promise;
    const paragraphs: Paragraph[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not render a PDF page image.');
      await page.render({ canvasContext: context, viewport }).promise;

      const imageData = canvas.toDataURL('image/png').split(',')[1];
      if (!imageData) throw new Error(`Could not create an image for page ${pageNumber}.`);
      const imageBytes = Uint8Array.from(atob(imageData), (char) => char.charCodeAt(0));
      const maxWidth = 624;
      const maxHeight = 864;
      const scale = Math.min(maxWidth / viewport.width, maxHeight / viewport.height);
      const image = new ImageRun({
        type: 'png',
        data: imageBytes,
        transformation: {
          width: Math.round(viewport.width * scale),
          height: Math.round(viewport.height * scale),
        },
      });
      paragraphs.push(new Paragraph({ children: [image], pageBreakBefore: pageNumber > 1 }));
    }

    return Packer.toBlob(new Document({ sections: [{ children: paragraphs }] }));
  }

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
  const loadingTask = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
  const pdf = await loadingTask.promise;
  const workbook = new ExcelJS.Workbook();
  let hasData = false;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines: Array<{ y: number; items: Array<{ x: number; width: number; text: string }> }> = [];

    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = item.transform[5];
      let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 3);
      if (!line) {
        line = { y, items: [] };
        lines.push(line);
      }
      line.items.push({ x: item.transform[4], width: item.width, text: item.str.trim() });
    }

    const rows = lines
      .sort((a, b) => b.y - a.y)
      .map((line) => {
        const sortedItems = line.items.sort((a, b) => a.x - b.x);
        const cells: string[] = [];
        let currentText = '';
        let currentEnd = Number.NEGATIVE_INFINITY;

        for (const item of sortedItems) {
          const gap = item.x - currentEnd;
          if (currentText && gap > 16) {
            cells.push(currentText.trim());
            currentText = item.text;
          } else {
            currentText = currentText ? `${currentText} ${item.text}` : item.text;
          }
          currentEnd = item.x + item.width;
        }
        if (currentText) cells.push(currentText.trim());
        return cells;
      })
      .filter((row) => row.length > 0);

    if (rows.length) {
      hasData = true;
      const worksheet = workbook.addWorksheet(`Page ${pageNumber}`);
      const columnCount = Math.max(...rows.map((row) => row.length));
      worksheet.columns = Array.from({ length: columnCount }, (_, column) => ({
        width: Math.min(42, Math.max(12, ...rows.map((row) => String(row[column] ?? '').length))),
      }));
      worksheet.addRows(rows);
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      const header = worksheet.getRow(1);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF334155' },
      };
    }
  }
  await pdf.destroy();

  if (!hasData) {
    const worksheet = workbook.addWorksheet('Data');
    worksheet.addRows([['Extracted Text'], ['No tabular data detected in PDF']]);
  }

  const wbout = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(wbout)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ----------------------------------------------------
// 7. WORD (.docx) TO PDF
// ----------------------------------------------------
export async function wordToPdf(file: File, mode: 'visual' | 'editable' = 'editable'): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  if (mode === 'editable') {
    const result = await mammoth.extractRawText({ arrayBuffer });
    const rawText = result.value || 'Empty document';
    return textToPdf(rawText, file.name.replace(/\.docx$/i, ''));
  }

  const body = document.createElement('div');
  const styles = document.createElement('div');
  Object.assign(body.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    zIndex: '-1',
    background: '#fff',
  });
  document.body.append(styles, body);

  try {
    await renderDocx(arrayBuffer, body, styles, {
      breakPages: true,
      ignoreWidth: false,
      ignoreHeight: false,
      renderHeaders: true,
      renderFooters: true,
      useBase64URL: true,
    });

    const pageElements = Array.from(body.querySelectorAll<HTMLElement>('.docx'));
    if (pageElements.length === 0) throw new Error('No pages could be rendered from this Word document.');

    const pdfDoc = await PDFDocument.create();
    for (let index = 0; index < pageElements.length; index += 1) {
      const element = pageElements[index];
      const pageWidth = element.offsetWidth;
      const pageHeight = element.offsetHeight;
      if (!pageWidth || !pageHeight) {
        throw new Error(`Could not measure Word page ${index + 1} for conversion.`);
      }

      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2,
        width: pageWidth,
        height: pageHeight,
        logging: false,
        onclone: (clonedDocument) => {
          const nodes = [clonedDocument.documentElement, clonedDocument.body, ...clonedDocument.querySelectorAll('*')];
          const clonedWindow = clonedDocument.defaultView;
          if (!clonedWindow) return;
          for (const node of nodes) {
            if (!(node instanceof clonedWindow.HTMLElement)) continue;
            const computed = clonedWindow.getComputedStyle(node);
            for (const property of [
              'color',
              'background-color',
              'border-top-color',
              'border-right-color',
              'border-bottom-color',
              'border-left-color',
              'outline-color',
              'text-decoration-color',
            ]) {
              if (computed.getPropertyValue(property).includes('oklch')) {
                node.style.setProperty(property, property === 'color' ? '#000000' : '#ffffff', 'important');
              }
            }
          }
        },
      });
      const imageData = canvas.toDataURL('image/jpeg', 0.96).split(',')[1];
      if (!imageData) throw new Error(`Could not render Word page ${index + 1}.`);
      const imageBytes = Uint8Array.from(atob(imageData), (char) => char.charCodeAt(0));
      const page = pdfDoc.addPage([pageWidth * 0.75, pageHeight * 0.75]);
      const image = await pdfDoc.embedJpg(imageBytes);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: page.getWidth(),
        height: page.getHeight(),
      });
    }

    return bytesToBlob(await pdfDoc.save(), 'application/pdf');
  } finally {
    body.remove();
    styles.remove();
  }
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
  const workbook = new ExcelJS.Workbook();
  if (/\.csv$/i.test(file.name)) {
    const parsedCsv = Papa.parse<string[]>(await file.text(), { skipEmptyLines: true });
    if (parsedCsv.errors.length > 0) {
      throw new Error(`Could not parse CSV data: ${parsedCsv.errors[0].message}`);
    }
    workbook.addWorksheet(file.name.replace(/\.csv$/i, '') || 'CSV').addRows(parsedCsv.data);
  } else {
    await workbook.xlsx.load(await file.arrayBuffer());
  }
  if (workbook.worksheets.length === 0) throw new Error('The spreadsheet contains no worksheets.');

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const fontSize = 8.5;

  const wrapCell = (value: string, width: number): string[] => {
    const words = value.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const fragments: string[] = [];
      let fragment = '';
      for (const character of word) {
        if (fragment && font.widthOfTextAtSize(`${fragment}${character}`, fontSize) > width - 10) {
          fragments.push(fragment);
          fragment = character;
        } else {
          fragment += character;
        }
      }
      if (fragment) fragments.push(fragment);

      for (const part of fragments) {
        const candidate = line ? `${line} ${part}` : part;
        if (line && font.widthOfTextAtSize(candidate, fontSize) > width - 10) {
          lines.push(line);
          line = part;
        } else {
          line = candidate;
        }
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  };

  const getExcelColor = (argb?: string) => {
    const hex = argb?.slice(-6);
    if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return undefined;
    return rgb(
      parseInt(hex.slice(0, 2), 16) / 255,
      parseInt(hex.slice(2, 4), 16) / 255,
      parseInt(hex.slice(4, 6), 16) / 255
    );
  };

  for (const sheet of workbook.worksheets) {
    const rows: Array<{ sourceRow: number; values: string[] }> = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (row.number > 100000 || row.cellCount > 200) {
        throw new Error(`Worksheet "${sheet.name}" exceeds the 100,000-row or 200-column conversion limit.`);
      }
      rows.push({
        sourceRow: row.number,
        values: Array.from({ length: Math.max(row.cellCount, sheet.columnCount) }, (_, index) =>
          row.getCell(index + 1).text
        ),
      });
    });

    const columnCount = Math.max(1, sheet.columnCount, ...rows.map((row) => row.values.length));
    const weights = Array.from({ length: columnCount }, (_, column) => {
      const longest = rows.reduce((max, row) => Math.max(max, row.values[column]?.length ?? 0), 8);
      return Math.max(8, Math.min(34, sheet.getColumn(column + 1).width || longest));
    });
    const columnGroups: number[][] = [];
    let currentGroup: number[] = [];
    let groupWidth = 0;
    for (let column = 0; column < columnCount; column += 1) {
      const estimatedWidth = contentWidth * (weights[column] / weights.reduce((sum, width) => sum + width, 0));
      if (currentGroup.length > 0 && (currentGroup.length >= 6 || groupWidth + estimatedWidth > contentWidth)) {
        columnGroups.push(currentGroup);
        currentGroup = [];
        groupWidth = 0;
      }
      currentGroup.push(column);
      groupWidth += estimatedWidth;
    }
    if (currentGroup.length) columnGroups.push(currentGroup);

    for (const columns of columnGroups) {
      const groupWeight = columns.reduce((sum, column) => sum + weights[column], 0);
      const columnWidths = columns.map((column) => contentWidth * (weights[column] / groupWeight));
      let page = pdfDoc.addPage([pageWidth, pageHeight]);
      let y = pageHeight - margin;

      const drawPageHeading = () => {
        page.drawText(`${file.name} — ${sheet.name}`, {
          x: margin,
          y,
          size: 13,
          font: boldFont,
          color: rgb(0.1, 0.15, 0.25),
        });
        y -= 24;
        if (columnGroups.length > 1) {
          page.drawText(`Columns ${columns[0] + 1}–${columns[columns.length - 1] + 1}`, {
            x: margin,
            y,
            size: 8,
            font,
            color: rgb(0.35, 0.4, 0.48),
          });
          y -= 14;
        }
      };

      const drawHeaderRow = () => {
        if (rows.length === 0) return;
        const values = columns.map((column) => rows[0]?.values[column] ?? '');
        const wrapped = values.map((value, index) => wrapCell(value, columnWidths[index]));
        const height = Math.max(20, ...wrapped.map((lines) => lines.length * (fontSize + 2) + 8));
        page.drawRectangle({
          x: margin,
          y: y - height + 5,
          width: contentWidth,
          height,
          color: rgb(0.9, 0.93, 0.97),
        });
        let x = margin;
        wrapped.forEach((lines, index) => {
          const sourceCell = sheet.getCell(rows[0].sourceRow, columns[index] + 1);
          const fill = sourceCell.fill;
          const fillColor = fill?.type === 'pattern' && fill.pattern === 'solid'
            ? getExcelColor(fill.fgColor?.argb)
            : undefined;
          if (fillColor) {
            page.drawRectangle({
              x,
              y: y - height + 5,
              width: columnWidths[index],
              height,
              color: fillColor,
            });
          }
          const textColor = getExcelColor(sourceCell.font?.color?.argb) ?? rgb(0.1, 0.15, 0.2);
          lines.forEach((line, lineIndex) => {
            page.drawText(line, {
              x: x + 5,
              y: y - 10 - lineIndex * (fontSize + 2),
              size: fontSize,
              font: sourceCell.font?.bold === false ? font : boldFont,
              color: textColor,
            });
          });
          x += columnWidths[index];
        });
        y -= height;
      };

      drawPageHeading();
      if (rows.length === 0) {
        page.drawText('Sheet contains no data.', { x: margin, y, size: 10, font });
        continue;
      }
      drawHeaderRow();

      for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
        const sourceRow = rows[rowIndex];
        const values = columns.map((column) => sourceRow?.values[column] ?? '');
        const wrapped = values.map((value, index) => wrapCell(value, columnWidths[index]));
        const height = Math.max(17, ...wrapped.map((lines) => lines.length * (fontSize + 2) + 6));
        if (y - height < margin) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
          drawPageHeading();
          drawHeaderRow();
        }

        if (rowIndex % 2 === 0) {
          page.drawRectangle({
            x: margin,
            y: y - height + 5,
            width: contentWidth,
            height,
            color: rgb(0.98, 0.99, 1),
          });
        }

        let x = margin;
        wrapped.forEach((lines, index) => {
          const sourceCell = sheet.getCell(sourceRow.sourceRow, columns[index] + 1);
          const fill = sourceCell.fill;
          const fillColor = fill?.type === 'pattern' && fill.pattern === 'solid'
            ? getExcelColor(fill.fgColor?.argb)
            : undefined;
          if (fillColor) {
            page.drawRectangle({
              x,
              y: y - height + 5,
              width: columnWidths[index],
              height,
              color: fillColor,
            });
          }
          const textColor = getExcelColor(sourceCell.font?.color?.argb) ?? rgb(0.2, 0.25, 0.3);
          lines.forEach((line, lineIndex) => {
            page.drawText(line, {
              x: x + 5,
              y: y - 10 - lineIndex * (fontSize + 2),
              size: fontSize,
              font: sourceCell.font?.bold || sourceCell.font?.italic ? boldFont : font,
              color: textColor,
            });
          });
          x += columnWidths[index];
        });

        page.drawLine({
          start: { x: margin, y: y - height + 5 },
          end: { x: pageWidth - margin, y: y - height + 5 },
          thickness: 0.5,
          color: rgb(0.85, 0.88, 0.9),
        });
        y -= height;
      }
    }
  }

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
