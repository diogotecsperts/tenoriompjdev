/**
 * pdf-preprocess.ts
 *
 * Utilitário compartilhado (browser-only) para preparar PDFs grandes antes do
 * OCR: rasteriza cada página em JPEG e remonta um PDF novo, só-imagens, sem
 * herança de recursos. Também expõe split por páginas para respeitar o limite
 * duro do GLM-OCR (100 páginas, ~50 MB por chamada).
 *
 * Este módulo é uma **duplicação intencional** das funções puras equivalentes
 * em `src/modules/previdenciario/api/pautas.ts`. O Prev continua com sua cópia
 * intocada. Se um bugfix futuro precisar consolidar, é uma refatoração
 * dedicada, com sign-off explícito.
 *
 * Roda **exclusivamente no browser** (usa `document.createElement('canvas')`
 * via pdfjs). Não importe de edge functions Deno.
 */

/** Limite defensivo de bytes por parte (GLM aceita ~50 MB por request). */
export const RASTER_SPLIT_MAX_BYTES = 48 * 1024 * 1024;

/** Limite defensivo de páginas por parte (GLM aceita ≤ 100 págs). */
export const RASTER_SPLIT_MAX_PAGES = 90;

export interface RebuildRasterOptions {
  /** DPI base (default 150). O fallback usa 120 se o PDF ainda ficar grande. */
  dpi?: number;
  /** Qualidade JPEG 0..1 (default 0.75). Fallback usa 0.65. */
  jpegQuality?: number;
  /** Concorrência de rasterização (default 4). */
  parallelism?: number;
  /** Aborta a operação. */
  signal?: AbortSignal;
  /** Callback de progresso por página. */
  onPageProgress?: (done: number, total: number) => void;
}

export interface PdfSplitPart {
  blob: Blob;
  startPage: number; // 1-based
  endPage: number;   // 1-based, inclusive
  totalPages: number;
  /**
   * Sinaliza que esta parte (tipicamente uma página única com conteúdo pesado
   * genuíno) não coube em `maxBytes` mesmo após clone+remove. O caller pode
   * optar por rasterizar novamente ou rejeitar.
   */
  needsClientRasterize?: boolean;
}

/**
 * Rasteriza todas as páginas de um PDF e remonta um PDF novo, só-imagens.
 * Faz uma segunda passada com DPI/qualidade menores se o resultado exceder
 * `maxBytes`. Retorna o Blob final (sempre `application/pdf`).
 */
export async function rebuildPdfAsRasterClean(
  source: Blob | File | Uint8Array,
  maxBytes: number = RASTER_SPLIT_MAX_BYTES,
  opts: RebuildRasterOptions = {},
): Promise<{ blob: Blob; pageCount: number; dpiUsed: number; qualityUsed: number }> {
  const parallelism = Math.max(1, Math.min(8, opts.parallelism ?? 4));

  const doRebuild = async (dpi: number, quality: number) => {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const pdfjs = await import("pdfjs-dist");
    // @ts-ignore worker via Vite ?url
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    }
    const bytes =
      source instanceof Uint8Array
        ? source
        : new Uint8Array(await (source as Blob).arrayBuffer());
    const bufCopy = bytes.slice();
    const loadingTask = pdfjs.getDocument({ data: bufCopy } as any);
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;

    const renderPage = async (pageNum: number): Promise<Uint8Array> => {
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const page = await pdf.getPage(pageNum);
      const scale = dpi / 72;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Canvas 2D indisponível");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, background: "white" } as any).promise;
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob null"))),
          "image/jpeg",
          quality,
        );
      });
      const buf = new Uint8Array(await blob.arrayBuffer());
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      return buf;
    };

    const jpegs: Uint8Array[] = new Array(totalPages);
    let nextIdx = 0;
    let done = 0;
    const workers: Promise<void>[] = [];
    for (let w = 0; w < parallelism; w++) {
      workers.push(
        (async () => {
          while (true) {
            const i = nextIdx++;
            if (i >= totalPages) return;
            jpegs[i] = await renderPage(i + 1);
            done++;
            opts.onPageProgress?.(done, totalPages);
          }
        })(),
      );
    }
    await Promise.all(workers);

    const { PDFDocument } = await import("pdf-lib");
    const out = await PDFDocument.create();
    for (let i = 0; i < totalPages; i++) {
      const jpg = await out.embedJpg(jpegs[i]);
      const page = out.addPage([jpg.width, jpg.height]);
      page.drawImage(jpg, { x: 0, y: 0, width: jpg.width, height: jpg.height });
      jpegs[i] = undefined as unknown as Uint8Array;
    }
    const outBytes = await out.save({ useObjectStreams: true });
    const outBuf = new ArrayBuffer(outBytes.byteLength);
    new Uint8Array(outBuf).set(outBytes);
    const outBlob = new Blob([outBuf], { type: "application/pdf" });
    return { blob: outBlob, pageCount: totalPages };
  };

  const dpi1 = opts.dpi ?? 150;
  const q1 = opts.jpegQuality ?? 0.75;
  const first = await doRebuild(dpi1, q1);
  console.info(
    `[pdf-preprocess] passada 1: ${first.pageCount} págs @ ${dpi1}dpi q=${q1} → ${(first.blob.size / 1024 / 1024).toFixed(1)}MB`,
  );
  if (first.blob.size <= maxBytes) {
    return { blob: first.blob, pageCount: first.pageCount, dpiUsed: dpi1, qualityUsed: q1 };
  }

  const dpi2 = 120;
  const q2 = 0.65;
  console.warn(
    `[pdf-preprocess] passada 1 excedeu ${(maxBytes / 1024 / 1024).toFixed(0)}MB — refazendo @ ${dpi2}dpi q=${q2}`,
  );
  const second = await doRebuild(dpi2, q2);
  console.info(`[pdf-preprocess] passada 2: ${(second.blob.size / 1024 / 1024).toFixed(1)}MB`);
  return { blob: second.blob, pageCount: second.pageCount, dpiUsed: dpi2, qualityUsed: q2 };
}

/** Lê o pageCount de um PDF sem rasterizar. Custo ~50-200ms. */
export async function probePdfPageCount(source: Blob | File | Uint8Array): Promise<number> {
  const { PDFDocument } = await import("pdf-lib");
  const bytes =
    source instanceof Uint8Array
      ? source
      : new Uint8Array(await (source as Blob).arrayBuffer());
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

/**
 * Divide um PDF **já rasterizado limpo** em partes sequenciais de até
 * `maxPages` páginas E ≤ `maxBytes`. Só faz sentido em cima do output de
 * `rebuildPdfAsRasterClean` — o PDF original pode ter recursos compartilhados
 * que inflam qualquer range.
 */
export async function splitCleanPdfByPages(
  cleanSource: Blob | Uint8Array,
  maxPages: number = RASTER_SPLIT_MAX_PAGES,
  maxBytes: number = RASTER_SPLIT_MAX_BYTES,
): Promise<PdfSplitPart[]> {
  const { PDFDocument } = await import("pdf-lib");
  const bytes =
    cleanSource instanceof Uint8Array
      ? cleanSource
      : new Uint8Array(await (cleanSource as Blob).arrayBuffer());
  const probe = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const totalPages = probe.getPageCount();

  const serializeRange = async (startIdx: number, endIdx: number): Promise<Blob> => {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const n = doc.getPageCount();
    for (let i = n - 1; i > endIdx; i--) doc.removePage(i);
    for (let i = startIdx - 1; i >= 0; i--) doc.removePage(i);
    const out = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
    const buf = new ArrayBuffer(out.byteLength);
    new Uint8Array(buf).set(out);
    return new Blob([buf], { type: "application/pdf" });
  };

  const parts: PdfSplitPart[] = [];

  const emitRange = async (startIdx: number, endIdx: number): Promise<void> => {
    const blob = await serializeRange(startIdx, endIdx);
    const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
    if (blob.size <= maxBytes) {
      console.info(`[pdf-preprocess-split] parte págs ${startIdx + 1}-${endIdx + 1}: ${sizeMB}MB (OK)`);
      parts.push({ blob, startPage: startIdx + 1, endPage: endIdx + 1, totalPages });
      return;
    }
    if (endIdx === startIdx) {
      console.warn(
        `[pdf-preprocess-split] página raster ${startIdx + 1} ficou ${sizeMB}MB > ${(maxBytes / 1024 / 1024).toFixed(0)}MB`,
      );
      parts.push({
        blob,
        startPage: startIdx + 1,
        endPage: endIdx + 1,
        totalPages,
        needsClientRasterize: true,
      });
      return;
    }
    console.info(
      `[pdf-preprocess-split] janela ${startIdx + 1}-${endIdx + 1} = ${sizeMB}MB > ${(maxBytes / 1024 / 1024).toFixed(0)}MB — subdividindo`,
    );
    const mid = Math.floor((startIdx + endIdx) / 2);
    await emitRange(startIdx, mid);
    await emitRange(mid + 1, endIdx);
  };

  for (let start = 0; start < totalPages; start += maxPages) {
    const end = Math.min(start + maxPages - 1, totalPages - 1);
    await emitRange(start, end);
  }
  console.info(
    `[pdf-preprocess-split] ${totalPages} págs → ${parts.length} partes (maxPages=${maxPages}, maxBytes=${(maxBytes / 1024 / 1024).toFixed(0)}MB)`,
  );
  return parts;
}

/** Decide se um PDF precisa passar por raster+split (por tamanho OU páginas). */
export async function pdfNeedsRasterSplit(
  source: Blob | File | Uint8Array,
  maxBytes: number = RASTER_SPLIT_MAX_BYTES,
  maxPages: number = RASTER_SPLIT_MAX_PAGES,
): Promise<{ needs: boolean; pageCount: number; sizeBytes: number }> {
  const sizeBytes =
    source instanceof Uint8Array ? source.byteLength : (source as Blob).size;
  const pageCount = await probePdfPageCount(source);
  return { needs: sizeBytes > maxBytes || pageCount > maxPages, pageCount, sizeBytes };
}
