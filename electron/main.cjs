const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

ipcMain.handle('omnipdf:sign-pdf', async (event, pdfBytes, certificateBytes, passphrase, signerName) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error('PDF signing requests must come from the OmniPDF window.');
  }
  if (!(pdfBytes instanceof Uint8Array) || pdfBytes.length === 0 || pdfBytes.length > 200 * 1024 * 1024) {
    throw new Error('The PDF is empty or exceeds the 200 MB signing limit.');
  }
  if (!(certificateBytes instanceof Uint8Array) || certificateBytes.length === 0 || certificateBytes.length > 10 * 1024 * 1024) {
    throw new Error('Select a valid PKCS#12 certificate no larger than 10 MB.');
  }
  if (typeof passphrase !== 'string' || passphrase.length > 1024) {
    throw new Error('The certificate password is invalid.');
  }
  if (typeof signerName !== 'string' || signerName.trim().length === 0 || signerName.length > 100) {
    throw new Error('Enter the signer name to include with the signature.');
  }

  const pdfBuffer = Buffer.from(pdfBytes);
  if (/\/ByteRange\s*\[/.test(pdfBuffer.toString('latin1'))) {
    throw new Error('This PDF already contains a digital signature. Editing it could invalidate that signature.');
  }

  const { PDFDocument } = require('pdf-lib');
  const { pdflibAddPlaceholder } = require('@signpdf/placeholder-pdf-lib');
  const { SignPdf } = require('@signpdf/signpdf');
  const { P12Signer } = require('@signpdf/signer-p12');
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  pdflibAddPlaceholder({
    pdfDoc,
    reason: 'Signed with OmniPDF',
    contactInfo: '',
    name: signerName.trim(),
    location: '',
    signatureLength: 32768,
  });
  const preparedPdf = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
  const signer = new P12Signer(Buffer.from(certificateBytes), { passphrase });
  const signedPdf = await new SignPdf().sign(preparedPdf, signer);
  return Uint8Array.from(signedPdf);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'OmniPDF by Maodo - PDF & Document Suite',
    icon: path.join(__dirname, '../public/pwa-512x512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });
  mainWindow = win;
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = app.isPackaged
      ? url.startsWith('file://') && url === win.webContents.getURL()
      : url.startsWith('http://localhost:3000/');
    if (!allowed) event.preventDefault();
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  // In production, load the built dist/index.html; in dev, load local dev server
  const isDev = !app.isPackaged;
  if (isDev && process.env.ELECTRON_START_URL) {
    win.loadURL(process.env.ELECTRON_START_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
