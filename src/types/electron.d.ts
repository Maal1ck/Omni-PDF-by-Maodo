interface Window {
  omniPdf?: {
    signPdf: (
      pdfBytes: Uint8Array,
      certificateBytes: Uint8Array,
      passphrase: string,
      signerName: string
    ) => Promise<Uint8Array>;
  };
}
