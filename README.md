# OmniPDF by Maodo

A fast, 100% private client-side PDF and document manipulation suite built with React, TypeScript, Vite, and Tailwind CSS.

## Features
- **Merge & Split PDFs**: Combine or extract page ranges with visual previews.
- **Multi-Document Organize**: Reorder, rotate, delete, or duplicate pages across multiple uploaded PDFs.
- **Convert to PDF**: Convert Images (JPG, PNG, WebP), Word (.docx), Excel (.xlsx, .csv), and Text (.txt, .md) to clean PDF format in batches.
- **Convert from PDF**: Extract PDF pages into high-resolution JPG/PNG images, editable Word (.docx) files, Excel (.xlsx) spreadsheets, and clean plain text (.txt).
- **Utility Tools**: Compress PDFs with file size savings calculations, add customizable watermarks, insert page numbering, and rotate documents.
- **Edit & Sign PDFs**: Add text and drawn signatures, replace a selected page area, or apply a certificate-based digital signature in the desktop app.
- **Desktop Ready**: Install directly in 1 click as an offline Progressive Web App (PWA) or compile into a native Windows executable (.exe) using Electron.

## Editing, signatures, and conversion fidelity

The **Edit & Sign PDF** tool adds text and visible signatures at a chosen location.
Replacing an area rasterizes that page so the covered content is removed from the
export; text on that page will no longer be selectable. Editing a PDF that already
has a digital signature is blocked because changes can invalidate its signature.

Certificate-based signing is available in the Electron desktop app with a
password-protected PKCS#12 (`.p12`/`.pfx`) certificate. The certificate and
password are handled locally and are not saved. This basic signing flow does not
provide a trusted timestamp or validate the certificate chain/revocation status;
confirm that it meets your legal and organizational requirements.

Word↔PDF conversions offer two modes:

- **Match appearance** renders PDF pages as images in the output, which better
  preserves page layout but makes that page's text non-editable/non-searchable.
- **Editable text** extracts or rebuilds text for editing, but layout and
  formatting can differ from the original.

Excel-to-PDF exports all worksheets and paginates wide sheets. PDF-to-Excel uses
text positions to estimate table columns; scanned pages and complex layouts may
need OCR or manual correction. No converter can guarantee an exact match to
Microsoft Office for every document, font, or source file.

## Windows desktop installer

Install dependencies and build the Windows x64 installer:

```sh
npm ci
npm run electron:build:win
```

The installer is written to `release/`. It lets the user choose a per-user
installation (only the current Windows account) or a per-machine installation
(all accounts, which may require administrator approval), and choose the
installation folder. Desktop and Start Menu shortcuts are created.

The installer is unsigned unless it is built with a trusted code-signing
certificate configured through Electron Builder's `CSC_LINK` and
`CSC_KEY_PASSWORD` environment variables. Keep certificate files and passwords
out of the repository. Signing and a stable publisher identity can reduce
Windows Smart App Control warnings, but Windows makes its own trust decision;
no installer setting can guarantee that Smart App Control will allow an app.

## License
MIT
