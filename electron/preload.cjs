const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('omniPdf', {
  signPdf: (pdfBytes, certificateBytes, passphrase, signerName) =>
    ipcRenderer.invoke('omnipdf:sign-pdf', pdfBytes, certificateBytes, passphrase, signerName),
});
