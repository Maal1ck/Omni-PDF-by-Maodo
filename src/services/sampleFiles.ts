import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { Document, Paragraph, TextRun, Packer, HeadingLevel } from 'docx';

export async function createSamplePdf(title: string = 'Invoice_Report_2026.pdf', pages: number = 3): Promise<File> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (let i = 1; i <= pages; i++) {
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    // Top decorative bar
    page.drawRectangle({
      x: 0,
      y: height - 16,
      width: width,
      height: 16,
      color: rgb(0.88, 0.22, 0.25),
    });

    // Header
    page.drawText('OmniPDF Document Services by Maodo', {
      x: 50,
      y: height - 55,
      size: 18,
      font: boldFont,
      color: rgb(0.1, 0.15, 0.25),
    });

    page.drawText(`Page ${i} of ${pages} — Document ID #DOC-${1000 + i}`, {
      x: 50,
      y: height - 75,
      size: 10,
      font: font,
      color: rgb(0.4, 0.45, 0.55),
    });

    // Content Block
    page.drawText(i === 1 ? 'Annual Summary & Executive Overview' : i === 2 ? 'Quarterly Breakdown & Performance Data' : 'Terms, Verification & Audit Notes', {
      x: 50,
      y: height - 120,
      size: 14,
      font: boldFont,
      color: rgb(0.15, 0.2, 0.3),
    });

    const sampleText = [
      'This document is a sample file generated client-side to test PDF manipulation tools.',
      'You can freely merge, split, rotate, watermark, compress, or convert this document.',
      'All processing runs 100% locally in your browser with zero server uploads.',
      '',
      `Section ${i}.1 - Operational Metrics:`,
      '• Throughput efficiency: 98.4%',
      '• Validation integrity: 100% passed',
      '• Digital signature stamp: Verified by client runtime',
      '',
      'Thank you for testing OmniPDF by Maodo!',
    ];

    let yOffset = height - 160;
    for (const line of sampleText) {
      page.drawText(line, {
        x: 50,
        y: yOffset,
        size: 11,
        font: line.startsWith('Section') ? boldFont : font,
        color: rgb(0.2, 0.25, 0.35),
      });
      yOffset -= 22;
    }

    // Footer
    page.drawText(`Generated on ${new Date().toLocaleDateString()} · Page ${i}`, {
      x: 50,
      y: 40,
      size: 9,
      font: font,
      color: rgb(0.6, 0.65, 0.7),
    });
  }

  const pdfBytes = await pdfDoc.save();
  return new File([pdfBytes.buffer as ArrayBuffer], title, { type: 'application/pdf' });
}

export async function createSampleDocx(title: string = 'Quarterly_Strategy_Draft.docx'): Promise<File> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: 'Quarterly Strategic Plan 2026',
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Prepared for document conversion workflow testing.',
                italics: true,
              }),
            ],
          }),
          new Paragraph({
            text: '1. Executive Summary',
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            text: 'This Microsoft Word document is generated in the browser to demonstrate Word-to-PDF conversion. It contains structured headings, multiple paragraphs, and styled sections.',
          }),
          new Paragraph({
            text: '2. Key Objectives',
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            text: '• Seamless conversion of .docx structures into standard PDF format.\n• Preservation of text hierarchy and line breaks.\n• Immediate preview and one-click download for high productivity.',
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return new File([blob], title, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export function createSampleXlsx(title: string = 'Financial_Q3_Spreadsheet.xlsx'): File {
  const wb = XLSX.utils.book_new();
  const data = [
    ['Quarter', 'Department', 'Budget (USD)', 'Actual (USD)', 'Variance (%)'],
    ['Q1', 'Engineering', 450000, 428000, '+4.8%'],
    ['Q1', 'Marketing', 220000, 231500, '-5.2%'],
    ['Q2', 'Operations', 180000, 172000, '+4.4%'],
    ['Q2', 'Product Design', 130000, 126400, '+2.7%'],
    ['Q3', 'Customer Success', 95000, 92100, '+3.0%'],
    ['Q3', 'Legal & Compliance', 60000, 58000, '+3.3%'],
    ['Total', 'Consolidated', 1135000, 1108000, '+2.4%'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Financial Summary');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new File([wbout], title, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function createSampleText(title: string = 'Meeting_Notes_Project_Specs.txt'): File {
  const content = `OmniPDF by Maodo - Project Specification Notes
=============================================
Date: 2026-10-12
Status: Approved

Summary:
This plain text document is ready to convert into a clean, beautifully formatted PDF document.

Items Covered:
1. Merge PDF documents seamlessly with custom ordering.
2. Split multi-page documents by page range or extract all pages.
3. Convert between images, Word docs, spreadsheets, and PDF.
4. Add watermarks, page numbers, and custom rotation.

Client-side Security:
All transformations occur directly inside your web browser. No files are ever sent to an external server.`;

  return new File([content], title, { type: 'text/plain' });
}

export function createSampleImage(title: string = 'receipt_scan.jpg'): Promise<File> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 800;
    const ctx = canvas.getContext('2d')!;

    // Clean background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 600, 800);

    // Border line
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 4;
    ctx.strokeRect(16, 16, 568, 768);

    // Header banner
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(20, 20, 560, 100);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('OFFICIAL RECEIPT / SCAN', 40, 70);

    ctx.fillStyle = '#64748b';
    ctx.font = '14px sans-serif';
    ctx.fillText('Order #883921 · Date: October 2026', 40, 95);

    // Lines of content
    ctx.fillStyle = '#1e293b';
    ctx.font = '16px sans-serif';
    ctx.fillText('Item 1: Enterprise Document License', 40, 180);
    ctx.fillText('$120.00', 480, 180);

    ctx.fillText('Item 2: Client Cloud Security Addon', 40, 230);
    ctx.fillText('$45.00', 480, 230);

    ctx.fillText('Item 3: Priority Conversion Engine', 40, 280);
    ctx.fillText('$35.00', 480, 280);

    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(40, 320);
    ctx.lineTo(540, 320);
    ctx.stroke();

    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('Total Amount Paid:', 40, 360);
    ctx.fillText('$200.00', 470, 360);

    // Watermark / stamp
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.strokeRect(380, 420, 140, 50);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('PAID IN FULL', 390, 452);

    canvas.toBlob((blob) => {
      resolve(new File([blob!], title, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.95);
  });
}
