import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eraser, PenLine, Type } from 'lucide-react';
import { PdfEditAnnotation } from '../types';
import { cancelPdfPageRender, renderPdfPageToCanvas } from '../services/pdfService';

export interface PdfSigningSettings {
  enabled: boolean;
  certificate: Uint8Array | null;
  passphrase: string;
  signerName: string;
}

interface PdfEditorProps {
  file: File;
  annotations: PdfEditAnnotation[];
  onAnnotationsChange: (annotations: PdfEditAnnotation[]) => void;
  signingSettings: PdfSigningSettings;
  onSigningSettingsChange: (settings: PdfSigningSettings) => void;
}

export const PdfEditor: React.FC<PdfEditorProps> = ({
  file,
  annotations,
  onAnnotationsChange,
  signingSettings,
  onSigningSettingsChange,
}) => {
  const [pageCount, setPageCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [placement, setPlacement] = useState<'text' | 'signature' | 'replace'>('text');
  const [text, setText] = useState('');
  const [replacementSelection, setReplacementSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [signatureMode, setSignatureMode] = useState<'draw' | 'type'>('draw');
  const [typedSignature, setTypedSignature] = useState('');
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    let active = true;
    const canvas = pageCanvasRef.current;
    if (!canvas) return;

    renderPdfPageToCanvas(file, pageIndex + 1, canvas)
      .then(({ pageCount: count }) => {
        if (active) {
          setPageCount(count);
          setPageIndex((current) => Math.min(current, count - 1));
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Could not render this PDF page.');
        }
      });

    return () => {
      active = false;
      cancelPdfPageRender(canvas);
    };
  }, [file, pageIndex]);

  const updateSignatureCanvas = (event: React.PointerEvent<HTMLCanvasElement>, start: boolean) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * canvas.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * canvas.height;

    if (start) {
      isDrawing.current = true;
      canvas.setPointerCapture(event.pointerId);
      context.beginPath();
      context.moveTo(x, y);
      context.lineWidth = 3;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = '#172033';
      return;
    }

    if (!isDrawing.current) return;
    context.lineTo(x, y);
    context.stroke();
    setSignatureData(canvas.toDataURL('image/png'));
  };

  const placeAnnotation = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (placement === 'replace') return;
    const canvas = pageCanvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));

    if (placement === 'text' && !text.trim()) {
      setError('Enter the text you want to place before clicking on the page.');
      return;
    }

    let imageData: string | undefined;
    let annotationText: string | undefined;
    if (placement === 'text') {
      annotationText = text.trim();
    } else if (signatureMode === 'draw') {
      imageData = signatureData ?? undefined;
      if (!imageData) {
        setError('Draw your signature in the signature box before placing it.');
        return;
      }
    } else {
      annotationText = typedSignature.trim();
      if (!annotationText) {
        setError('Enter your name before placing the typed signature.');
        return;
      }
    }

    onAnnotationsChange([
      ...annotations,
      {
        id: crypto.randomUUID(),
        pageIndex,
        x,
        y,
        kind: placement,
        text: annotationText,
        imageData,
      },
    ]);
    setError(null);
  };

  const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = pageCanvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  };

  const beginReplacementSelection = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (placement !== 'replace') return;
    const point = getCanvasPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectionStart(point);
    setReplacementSelection({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const updateReplacementSelection = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!selectionStart || placement !== 'replace') return;
    const point = getCanvasPoint(event);
    if (!point) return;
    setReplacementSelection({
      x: Math.min(selectionStart.x, point.x),
      y: Math.min(selectionStart.y, point.y),
      width: Math.abs(point.x - selectionStart.x),
      height: Math.abs(point.y - selectionStart.y),
    });
  };

  const finishReplacementSelection = (event: React.PointerEvent<HTMLCanvasElement>) => {
    updateReplacementSelection(event);
    setSelectionStart(null);
  };

  const addReplacement = () => {
    if (!replacementSelection || replacementSelection.width < 0.01 || replacementSelection.height < 0.005) {
      setError('Drag a rectangle around the text or area you want to replace.');
      return;
    }
    if (!text.trim()) {
      setError('Enter the replacement text before applying it.');
      return;
    }
    onAnnotationsChange([
      ...annotations,
      {
        id: crypto.randomUUID(),
        pageIndex,
        kind: 'replace',
        text: text.trim(),
        ...replacementSelection,
      },
    ]);
    setReplacementSelection(null);
    setText('');
    setError(null);
  };

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData(null);
  };

  const setSigningSetting = (changes: Partial<PdfSigningSettings>) => {
    onSigningSettingsChange({ ...signingSettings, ...changes });
  };

  const desktopSigningAvailable = Boolean(window.omniPdf?.signPdf);
  const pageAnnotations = annotations.filter((annotation) => annotation.pageIndex === pageIndex);

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Edit and sign this PDF</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Add text or a visible signature, or replace a selected page area. Choose a tool, then click or drag on the page.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
              disabled={pageIndex === 0}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Page {pageCount ? pageIndex + 1 : '…'} of {pageCount || '…'}
            </span>
            <button
              type="button"
              onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
              disabled={pageIndex >= pageCount - 1}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="relative mx-auto w-fit max-w-full overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-2 dark:border-slate-700 dark:bg-slate-800">
            <canvas
              ref={pageCanvasRef}
              onClick={placeAnnotation}
              onPointerDown={beginReplacementSelection}
              onPointerMove={updateReplacementSelection}
              onPointerUp={finishReplacementSelection}
              onPointerCancel={() => setSelectionStart(null)}
              className={`block h-auto max-h-[75vh] max-w-full bg-white shadow ${placement === 'replace' ? 'cursor-crosshair touch-none' : 'cursor-crosshair'}`}
              aria-label="PDF page. Click to place the selected text or signature."
            />
            {pageAnnotations.map((annotation) => (
              <div
                key={annotation.id}
                className={`pointer-events-none absolute overflow-hidden border border-dashed border-indigo-500 bg-white/70 px-1 text-left text-xs text-indigo-900 ${
                  annotation.kind === 'replace'
                    ? 'border-2'
                    : '-translate-y-1/2 max-w-[42%] text-ellipsis whitespace-nowrap'
                }`}
                style={{
                  left: `calc(8px + (100% - 16px) * ${annotation.x})`,
                  top: `calc(8px + (100% - 16px) * ${annotation.y})`,
                  width: annotation.kind === 'replace' ? `${(annotation.width ?? 0) * 100}%` : undefined,
                  height: annotation.kind === 'replace' ? `${(annotation.height ?? 0) * 100}%` : undefined,
                }}
              >
                {annotation.kind === 'signature' && annotation.imageData ? (
                  <img src={annotation.imageData} alt="Signature placement" className="h-10 max-w-36 object-contain" />
                ) : (
                  annotation.text
                )}
              </div>
            ))}
            {replacementSelection && (
              <div
                className="pointer-events-none absolute border-2 border-indigo-500 bg-indigo-200/30"
                style={{
                  left: `calc(8px + (100% - 16px) * ${replacementSelection.x})`,
                  top: `calc(8px + (100% - 16px) * ${replacementSelection.y})`,
                  width: `${replacementSelection.width * 100}%`,
                  height: `${replacementSelection.height * 100}%`,
                }}
              />
            )}
          </div>
          {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPlacement('text')}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                placement === 'text'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              <Type className="h-4 w-4" /> Add text
            </button>
            <button
              type="button"
              onClick={() => {
                setPlacement('replace');
                setReplacementSelection(null);
              }}
              className={`flex items-center justify-center rounded-lg border px-2 py-2 text-xs font-semibold ${
                placement === 'replace'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => setPlacement('signature')}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                placement === 'signature'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                  : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              <PenLine className="h-4 w-4" /> Signature
            </button>
          </div>

          {placement !== 'signature' ? (
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
              {placement === 'replace' ? 'Replacement text' : 'Text to place'}
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={300}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                placeholder="Type text, then click the page"
              />
              {placement === 'replace' && (
                <>
                  <p className="mt-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                    Drag over the content to replace, then apply it. The edited page is flattened to remove the covered original text; that page will no longer have selectable text.
                  </p>
                  <button
                    type="button"
                    onClick={addReplacement}
                    className="mt-2 w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Apply replacement
                  </button>
                </>
              )}
            </label>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setSignatureMode('draw')} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:text-slate-200">
                  Draw
                </button>
                <button type="button" onClick={() => setSignatureMode('type')} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:text-slate-200">
                  Type name
                </button>
              </div>
              {signatureMode === 'draw' ? (
                <div>
                  <canvas
                    ref={signatureCanvasRef}
                    width={400}
                    height={120}
                    onPointerDown={(event) => updateSignatureCanvas(event, true)}
                    onPointerMove={(event) => updateSignatureCanvas(event, false)}
                    onPointerUp={() => { isDrawing.current = false; }}
                    onPointerCancel={() => { isDrawing.current = false; }}
                    className="h-24 w-full touch-none rounded-lg border border-slate-300 bg-white dark:border-slate-700"
                    aria-label="Draw signature"
                  />
                  <button type="button" onClick={clearSignature} className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                    <Eraser className="h-3 w-3" /> Clear signature
                  </button>
                </div>
              ) : (
                <input
                  value={typedSignature}
                  onChange={(event) => setTypedSignature(event.target.value)}
                  maxLength={100}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm italic dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="Type your name"
                />
              )}
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                A visible mark only. Use certificate signing below for a cryptographic signature.
              </p>
            </div>
          )}

          <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">Placed items ({annotations.length})</h3>
              {annotations.length > 0 && (
                <button type="button" onClick={() => onAnnotationsChange([])} className="text-[11px] text-red-600">
                  Clear all
                </button>
              )}
            </div>
            <ul className="max-h-28 space-y-1 overflow-y-auto">
              {annotations.map((annotation, index) => (
                <li key={annotation.id} className="flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                  <span className="truncate">{index + 1}. Page {annotation.pageIndex + 1} · {annotation.kind === 'signature' ? 'Signature' : annotation.kind === 'replace' ? 'Text replacement' : annotation.text}</span>
                  <button
                    type="button"
                    onClick={() => onAnnotationsChange(annotations.filter((item) => item.id !== annotation.id))}
                    className="shrink-0 text-red-600"
                    aria-label={`Remove item ${index + 1}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <label className="flex items-start gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
          <input
            type="checkbox"
            checked={signingSettings.enabled}
            disabled={!desktopSigningAvailable}
            onChange={(event) => setSigningSetting({
              enabled: event.target.checked,
              ...(event.target.checked ? {} : { certificate: null, passphrase: '' }),
            })}
            className="mt-0.5 accent-indigo-600"
          />
          Add a certificate-based digital signature (desktop app)
        </label>
        {desktopSigningAvailable ? (
          signingSettings.enabled && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-[11px] text-slate-600 dark:text-slate-300">
                PKCS#12 certificate (.p12/.pfx)
                <input
                  type="file"
                  accept=".p12,.pfx,application/x-pkcs12"
                  onChange={async (event) => {
                    const selected = event.target.files?.[0];
                    if (!selected) {
                      setSigningSetting({ certificate: null });
                      return;
                    }
                    if (selected.size > 10 * 1024 * 1024) {
                      setError('Certificate files must be 10 MB or smaller.');
                      event.target.value = '';
                      return;
                    }
                    try {
                      setSigningSetting({ certificate: new Uint8Array(await selected.arrayBuffer()) });
                      setError(null);
                    } catch (cause) {
                      setError(cause instanceof Error ? cause.message : 'Could not read the selected certificate.');
                    }
                  }}
                  className="mt-1 block w-full text-[11px]"
                />
              </label>
              <label className="text-[11px] text-slate-600 dark:text-slate-300">
                Certificate password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={signingSettings.passphrase}
                  onChange={(event) => setSigningSetting({ passphrase: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>
              <label className="text-[11px] text-slate-600 dark:text-slate-300 sm:col-span-2">
                Signer name shown in signature details
                <input
                  value={signingSettings.signerName}
                  onChange={(event) => setSigningSetting({ signerName: event.target.value })}
                  maxLength={100}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 sm:col-span-2">
                The certificate and password are processed locally and are not saved. This does not provide a timestamp or verify your certificate chain.
              </p>
            </div>
          )
        ) : (
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            Certificate signing is available in the installed desktop app. The web/PWA version can add visible signatures only.
          </p>
        )}
      </div>
    </section>
  );
};
