import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, RefreshCw, X } from 'lucide-react';
import { cn } from '../lib/cn';
import type { TagConvention } from '../lib/supabase';

// ============================================================
// Public API
// ============================================================

export type DocPreviewProps = {
  /** URL signée vers le PDF d'aperçu. */
  pdfUrl: string | null;
  /** Statut de chargement. */
  loading?: boolean;
  /** Message d'erreur si la conversion a échoué. */
  error?: string | null;
  /** Convention pour identifier les balises. */
  convention: TagConvention;
  /** Préfixe (li_prefix). */
  prefix: string;
  /** Balise active. */
  highlightKey: string | null;
  /** Liste ordonnée des clés (navigation prev/next). */
  navigableKeys: string[];
  /** Click sur une balise / nav prev-next. */
  onSelect: (key: string | null) => void;
  /** Demande une régénération côté worker. */
  onRefresh?: () => void;
};

export function DocPreviewPanel(
  props: DocPreviewProps & { onClose?: () => void },
) {
  return (
    <CanvasShell className="h-full border-l border-line shadow-[-8px_0_24px_-12px_rgba(15,23,42,0.08)]">
      <CanvasHeader {...props} />
      <CanvasBody {...props} />
    </CanvasShell>
  );
}

export function DocPreviewDialog({
  open,
  onClose,
  ...props
}: DocPreviewProps & { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex flex-col p-2">
      <CanvasShell className="flex-1 max-h-full rounded-2xl border border-line/80 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.06)]">
        <CanvasHeader {...props} onClose={onClose} />
        <CanvasBody {...props} />
      </CanvasShell>
    </div>
  );
}

// ============================================================
// Canvas shell — style "Claude Code canvas"
// ============================================================

function CanvasShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col bg-white overflow-hidden w-full', className)}>
      {children}
    </div>
  );
}

// ============================================================
// Header avec navigation
// ============================================================

function CanvasHeader({
  highlightKey,
  navigableKeys,
  onSelect,
  onRefresh,
  onClose,
}: DocPreviewProps & { onClose?: () => void }) {
  const idx = highlightKey ? navigableKeys.indexOf(highlightKey) : -1;
  const total = navigableKeys.length;
  const canPrev = total > 0 && (idx === -1 || idx > 0);
  const canNext = total > 0 && idx < total - 1;

  function go(delta: number) {
    if (total === 0) return;
    if (idx === -1) {
      onSelect(navigableKeys[0]);
      return;
    }
    const target = Math.max(0, Math.min(total - 1, idx + delta));
    onSelect(navigableKeys[target]);
  }

  return (
    <div className="h-10 px-3 border-b border-line/80 bg-white flex items-center gap-2 shrink-0">
      <FileText size={14} className="text-accent shrink-0" />
      <div className="text-sm font-medium text-ink truncate">Aperçu du document</div>
      {highlightKey && (
        <div className="text-xs text-muted truncate font-mono shrink min-w-0">
          · {idx >= 0 ? `${idx + 1}/${total} ` : ''}
          {highlightKey}
        </div>
      )}
      {!highlightKey && total > 0 && (
        <div className="text-xs text-muted truncate shrink-0">· {total} balise(s)</div>
      )}
      <div className="flex-1" />
      <div className="flex items-center gap-0.5 shrink-0">
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-line/50"
            title="Régénérer l'aperçu PDF"
            aria-label="Régénérer"
          >
            <RefreshCw size={15} />
          </button>
        )}
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={!canPrev}
          className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-line/50 disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Balise précédente"
          title="Précédente"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={!canNext}
          className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-line/50 disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Balise suivante"
          title="Suivante"
        >
          <ChevronRight size={16} />
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-1 p-1.5 rounded-md text-muted hover:text-ink hover:bg-line/50"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Body — rendu PDF page par page avec overlays cliquables
// ============================================================

function CanvasBody({
  pdfUrl,
  loading,
  error,
  convention,
  prefix,
  highlightKey,
  onSelect,
}: DocPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Charge le PDF
  useEffect(() => {
    if (!pdfUrl) {
      setPdfDoc(null);
      return;
    }
    let cancelled = false;
    setRenderError(null);
    loadPdf(pdfUrl)
      .then((doc) => {
        if (!cancelled) setPdfDoc(doc);
      })
      .catch((e) => {
        if (!cancelled) {
          setRenderError((e as Error).message);
          setPdfDoc(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  // Click delegation : un click sur un overlay .doc-tag remonte la sélection
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const handler = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest('[data-tag-key]') as HTMLElement | null;
      if (btn) {
        e.preventDefault();
        onSelect(btn.dataset.tagKey || null);
      }
    };
    node.addEventListener('click', handler);
    return () => node.removeEventListener('click', handler);
  }, [onSelect]);

  // Active highlight + scroll vers la 1ère occurrence
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    node.querySelectorAll('.doc-tag.is-active').forEach((el) =>
      el.classList.remove('is-active'),
    );
    if (!highlightKey) return;
    const matches = node.querySelectorAll<HTMLElement>(
      `[data-tag-key="${cssEscape(highlightKey)}"]`,
    );
    matches.forEach((el) => el.classList.add('is-active'));
    matches[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightKey, pdfDoc]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto bg-bg/40">
      <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6 space-y-4">
        {error && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-medium mb-1">Aperçu indisponible</div>
            <div className="text-amber-900/80">{error}</div>
          </div>
        )}
        {renderError && !error && (
          <div className="rounded-lg border border-danger/30 bg-red-50 p-4 text-sm text-danger">
            Échec du rendu PDF : {renderError}
          </div>
        )}
        {(loading || (pdfUrl && !pdfDoc && !renderError && !error)) && (
          <div className="text-center text-muted text-sm py-12">
            Chargement de l'aperçu PDF…
          </div>
        )}
        {!loading && !pdfUrl && !error && (
          <div className="text-center text-muted text-sm py-12">
            Importez un .docx pour voir l'aperçu.
          </div>
        )}
        {pdfDoc &&
          Array.from({ length: pdfDoc.numPages }, (_, i) => (
            <PdfPage
              key={i + 1}
              doc={pdfDoc}
              pageNumber={i + 1}
              convention={convention}
              prefix={prefix}
            />
          ))}
      </div>
    </div>
  );
}

// ============================================================
// PDF Page renderer
// ============================================================

function PdfPage({
  doc,
  pageNumber,
  convention,
  prefix,
}: {
  doc: PdfDocument;
  pageNumber: number;
  convention: TagConvention;
  prefix: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(pageNumber);
      const targetWidth = wrapperRef.current?.clientWidth ?? 720;
      const initialViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(2, targetWidth / initialViewport.width);
      const viewport = page.getViewport({ scale });
      if (cancelled) return;

      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d')!;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      ctx.scale(dpr, dpr);
      setSize({ w: viewport.width, h: viewport.height });

      await page.render({ canvasContext: ctx, viewport }).promise;
      if (cancelled) return;

      // Extract text + positions + build overlays
      const textContent = await page.getTextContent();
      const overlay = overlayRef.current!;
      overlay.innerHTML = '';
      buildTagOverlays(overlay, textContent, viewport, convention, prefix);
    })().catch((e) => {
      // eslint-disable-next-line no-console
      console.warn('PDF page render failed', e);
    });
    return () => {
      cancelled = true;
    };
  }, [doc, pageNumber, convention, prefix]);

  return (
    <div
      ref={wrapperRef}
      className="relative mx-auto bg-white shadow-sm border border-line/60 rounded-md overflow-hidden"
      style={size ? { width: size.w, height: size.h } : undefined}
    >
      <canvas ref={canvasRef} className="block" />
      <div
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none"
        aria-hidden
      />
    </div>
  );
}

// ============================================================
// Tag detection + overlay placement
// ============================================================

const PDF_ANNEX_RE = /@@(pdf|pdfdir|annex)(?::([\w\-.]+))?/gi;
const JINJA_VAR_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;
const JINJA_FOR_RE = /\{%\s*for\s+\w+\s+in\s+([a-zA-Z_][\w.]*)\s*%\}/g;
const BLOCK_SUFFIX_TAIL_RE = /(DEBUT|FIN|start|stop)$/i;

type TagHit = {
  start: number;
  end: number;
  key: string;
  type: 'field' | 'block' | 'pdf' | 'pdfdir' | 'annex' | 'loop';
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findTagsInText(
  text: string,
  convention: TagConvention,
  prefix: string,
): TagHit[] {
  const hits: TagHit[] = [];

  PDF_ANNEX_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PDF_ANNEX_RE.exec(text)) !== null) {
    const kind = m[1].toLowerCase();
    const slot = m[2];
    if (kind === 'annex') {
      hits.push({ start: m.index, end: m.index + m[0].length, key: 'annex', type: 'annex' });
    } else if (slot) {
      hits.push({
        start: m.index,
        end: m.index + m[0].length,
        key: slot,
        type: kind as 'pdf' | 'pdfdir',
      });
    }
  }

  if (convention === 'li_prefix' && prefix) {
    const pfx = prefix.toLowerCase();
    const esc = escapeRe(pfx);
    const blockRe = new RegExp(`${esc}((?:(?!${esc})\\w)+?)(DEBUT|FIN|start|stop)`, 'gi');
    const tokenRe = new RegExp(`${esc}(?:(?!${esc})\\w)+`, 'gi');

    const blockSpans: Array<[number, number]> = [];
    let bm: RegExpExecArray | null;
    while ((bm = blockRe.exec(text)) !== null) {
      const base = bm[1].replace(/_+$/, '').toLowerCase();
      hits.push({
        start: bm.index,
        end: bm.index + bm[0].length,
        key: base,
        type: 'block',
      });
      blockSpans.push([bm.index, bm.index + bm[0].length]);
    }

    let masked = text;
    for (const [s, e] of blockSpans) {
      masked = masked.slice(0, s) + ' '.repeat(e - s) + masked.slice(e);
    }
    const skipLen = pfx.length;
    let tm: RegExpExecArray | null;
    while ((tm = tokenRe.exec(masked)) !== null) {
      const tok = tm[0];
      const key = tok.slice(skipLen).toLowerCase();
      if (!key || BLOCK_SUFFIX_TAIL_RE.test(key)) continue;
      hits.push({
        start: tm.index,
        end: tm.index + tok.length,
        key,
        type: 'field',
      });
    }
  } else if (convention === 'jinja') {
    JINJA_VAR_RE.lastIndex = 0;
    let m2: RegExpExecArray | null;
    while ((m2 = JINJA_VAR_RE.exec(text)) !== null) {
      const raw = m2[1].trim();
      if (raw.startsWith('%') || raw.startsWith('#') || raw.startsWith('-')) continue;
      const key = raw.split('|')[0].split(' ')[0].trim();
      if (!key || !/^[a-zA-Z_][\w.]*$/.test(key)) continue;
      hits.push({ start: m2.index, end: m2.index + m2[0].length, key, type: 'field' });
    }
    JINJA_FOR_RE.lastIndex = 0;
    while ((m2 = JINJA_FOR_RE.exec(text)) !== null) {
      hits.push({
        start: m2.index,
        end: m2.index + m2[0].length,
        key: m2[1].trim(),
        type: 'loop',
      });
    }
  }

  hits.sort((a, b) => a.start - b.start);
  const filtered: TagHit[] = [];
  let lastEnd = 0;
  for (const h of hits) {
    if (h.start < lastEnd) continue;
    filtered.push(h);
    lastEnd = h.end;
  }
  return filtered;
}

type PdfTextItem = {
  str: string;
  transform: number[]; // [a, b, c, d, e, f]
  width: number;
  height: number;
  fontName?: string;
};

function buildTagOverlays(
  overlay: HTMLElement,
  textContent: { items: PdfTextItem[] },
  viewport: { transform: number[]; height: number },
  convention: TagConvention,
  prefix: string,
): void {
  for (const item of textContent.items) {
    if (!item.str) continue;
    const tags = findTagsInText(item.str, convention, prefix);
    if (tags.length === 0) continue;

    // Apply viewport transform on the item's transform
    // Result coords: x at left baseline, y at baseline (PDF.js convention)
    const t = applyTransform(viewport.transform, item.transform);
    const itemX = t[4];
    const itemY = t[5];
    const charWidth = item.str.length > 0 ? (item.width * Math.abs(viewport.transform[0])) / item.str.length : 0;
    const itemHeight = item.height * Math.abs(viewport.transform[3]) || 12;

    for (const tag of tags) {
      const left = itemX + tag.start * charWidth;
      const width = (tag.end - tag.start) * charWidth;
      // y (baseline) → top = y - height (approximation)
      const top = itemY - itemHeight + 2;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'doc-tag pdf-tag';
      btn.setAttribute('data-tag-key', tag.key);
      btn.setAttribute('data-tag-type', tag.type);
      btn.style.position = 'absolute';
      btn.style.left = `${left}px`;
      btn.style.top = `${top}px`;
      btn.style.width = `${Math.max(width, 4)}px`;
      btn.style.height = `${itemHeight + 2}px`;
      btn.style.pointerEvents = 'auto';
      btn.title = tag.key;
      overlay.appendChild(btn);
    }
  }
}

function applyTransform(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

// ============================================================
// PDF.js loader (lazy)
// ============================================================

type PdfDocument = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (opts: { scale: number }) => {
      width: number;
      height: number;
      transform: number[];
    };
    render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
      promise: Promise<void>;
    };
    getTextContent: () => Promise<{ items: PdfTextItem[] }>;
  }>;
};

let pdfjsModule: typeof import('pdfjs-dist') | null = null;

async function loadPdf(url: string): Promise<PdfDocument> {
  if (!pdfjsModule) {
    pdfjsModule = await import('pdfjs-dist');
    // Set the worker — Vite résoudra l'URL au build
    const workerUrl = (
      await import('pdfjs-dist/build/pdf.worker.mjs?url' as 'pdfjs-dist/build/pdf.worker.mjs')
    ).default as unknown as string;
    pdfjsModule.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  const task = pdfjsModule.getDocument(url);
  return (await task.promise) as unknown as PdfDocument;
}

function cssEscape(s: string): string {
  if (typeof window !== 'undefined' && 'CSS' in window && typeof CSS.escape === 'function') {
    return CSS.escape(s);
  }
  return s.replace(/["\\]/g, '\\$&');
}
