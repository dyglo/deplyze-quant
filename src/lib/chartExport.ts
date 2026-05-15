/**
 * chartExport — institutional chart download utilities.
 *
 * Two export paths:
 *   exportChartAsPng   — SVG-based Recharts charts (finds <svg> in container)
 *   exportHeatmapAsPng — canvas-rendered correlation heatmap (HTML table → canvas)
 *
 * Both resolve CSS variables against the live document before exporting so
 * charts look identical to what the user sees on screen.
 */

import type { CorrelationSnapshot } from '../types';

// ─── CSS variable resolution ───────────────────────────────────────────────

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Walk original SVG and clone in parallel, inlining computed fill/stroke/color
 * so the exported image doesn't depend on CSS custom properties.
 */
function inlineComputedStyles(orig: Element, clone: Element): void {
  if (orig instanceof SVGElement && clone instanceof SVGElement) {
    const cs = getComputedStyle(orig);

    // Inline the four properties recharts sets via attributes or CSS vars
    const propsToInline: Array<keyof CSSStyleDeclaration & string> = [
      'fill', 'stroke', 'color', 'stopColor',
    ];
    for (const prop of propsToInline) {
      const attrVal = orig.getAttribute(prop);
      if (attrVal && attrVal.includes('var(')) {
        // Read computed value from the live element
        const resolved = (cs as unknown as Record<string, string>)[prop];
        if (resolved) clone.setAttribute(prop, resolved);
      }
    }

    // Also inline style="" that contains CSS vars
    const styleAttr = orig.getAttribute('style');
    if (styleAttr && styleAttr.includes('var(')) {
      const resolvedStyle = styleAttr.replace(/var\(--([^)]+)\)/g, (_, v) =>
        getCssVar(`--${v}`) || 'transparent',
      );
      clone.setAttribute('style', resolvedStyle);
    }
  }

  const origKids = Array.from(orig.children);
  const cloneKids = Array.from(clone.children);
  for (let i = 0; i < origKids.length; i++) {
    if (cloneKids[i]) inlineComputedStyles(origKids[i], cloneKids[i]);
  }
}

// ─── SVG → PNG (for Recharts charts) ──────────────────────────────────────

/**
 * Finds the SVG inside `container`, inlines computed styles, renders to a
 * hi-DPI canvas, and triggers a PNG download.
 */
export async function exportChartAsPng(
  container: HTMLElement,
  filename = 'chart.png',
): Promise<void> {
  const svg = container.querySelector<SVGSVGElement>('svg');
  if (!svg) throw new Error('No SVG chart found in the container.');

  const rect = svg.getBoundingClientRect();
  const width  = Math.max(rect.width,  svg.width?.baseVal?.value  ?? 800);
  const height = Math.max(rect.height, svg.height?.baseVal?.value ?? 400);

  // Clone → inline computed styles → set explicit dimensions
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineComputedStyles(svg, clone);
  clone.setAttribute('width',  String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('xmlns',  'http://www.w3.org/2000/svg');

  // Prepend background rect so the exported PNG has the app background colour
  const bg = getCssVar('--background') || '#ffffff';
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('width',  '100%');
  bgRect.setAttribute('height', '100%');
  bgRect.setAttribute('fill',   bg);
  clone.insertBefore(bgRect, clone.firstChild);

  const svgStr = new XMLSerializer().serializeToString(clone);
  const blob   = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url    = URL.createObjectURL(blob);

  return new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const dpr    = window.devicePixelRatio || 1;
      const canvas = document.createElement('canvas');
      canvas.width  = width  * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      triggerDownload(canvas.toDataURL('image/png'), filename);
      resolve();
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG render failed')); };
    img.src = url;
  });
}

// ─── Heatmap → PNG (for CorrelationHeatmap) ───────────────────────────────

/** Correlation colour — mirrors the CorrelationHeatmap colour function. */
function correlationColor(v: number): string {
  if (v > 0) {
    const t = Math.min(1, v);
    return `rgba(120, 140, 93, ${0.15 + t * 0.55})`;
  }
  const t = Math.min(1, -v);
  return `rgba(193, 95, 60, ${0.15 + t * 0.55})`;
}

/**
 * Renders the correlation heatmap data directly to a canvas (no DOM scraping)
 * and triggers a PNG download. Works even though the heatmap is HTML, not SVG.
 */
export function exportHeatmapAsPng(
  snapshot: CorrelationSnapshot,
  title = 'Correlation Matrix',
  filename = 'correlation-heatmap.png',
): void {
  const { symbols, cells } = snapshot;
  const n = symbols.length;

  const lookup = new Map<string, number>();
  for (const c of cells) lookup.set(`${c.rowSymbol}|${c.colSymbol}`, c.value);
  const get = (r: string, c: string) =>
    r === c ? 1 : (lookup.get(`${r}|${c}`) ?? lookup.get(`${c}|${r}`) ?? null);

  // Layout constants
  const labelW   = 100;
  const cellSize = 80;
  const titleH   = 36;
  const headerH  = 40;
  const padding  = 16;
  const dpr      = window.devicePixelRatio || 1;
  const W        = labelW + n * cellSize + padding * 2;
  const H        = titleH + headerH + n * cellSize + padding * 2;

  // Theme colours resolved from CSS vars
  const bg        = getCssVar('--background') || '#1a1a1a';
  const cardBg    = getCssVar('--card')        || '#222';
  const fg        = getCssVar('--foreground')  || '#f0f0f0';
  const mutedFg   = getCssVar('--muted-foreground') || '#888';
  const border    = getCssVar('--border')      || '#333';

  const canvas   = document.createElement('canvas');
  canvas.width   = W * dpr;
  canvas.height  = H * dpr;
  const ctx      = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Title bar
  ctx.fillStyle = cardBg;
  ctx.fillRect(0, 0, W, titleH);
  ctx.fillStyle = fg;
  ctx.font = `600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillText(title, padding, titleH / 2 + 5);

  // Subtitle: window label
  ctx.fillStyle = mutedFg;
  ctx.font = `11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillText(`${snapshot.windowDays}-day rolling Pearson · ${new Date(snapshot.ts).toLocaleDateString()}`, padding, titleH / 2 + 20);

  const ox = padding + labelW;
  const oy = titleH + headerH;

  // Column headers
  ctx.fillStyle = mutedFg;
  ctx.font = `600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  symbols.forEach((sym, j) => {
    ctx.fillText(sym, ox + j * cellSize + cellSize / 2, titleH + headerH - 10);
  });

  // Row labels + cells
  ctx.textAlign = 'right';
  symbols.forEach((row, i) => {
    // Row label
    ctx.fillStyle = mutedFg;
    ctx.font = `600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillText(row, ox - 10, oy + i * cellSize + cellSize / 2 + 4);

    symbols.forEach((col, j) => {
      const v = get(row, col);
      const x = ox + j * cellSize;
      const y = oy + i * cellSize;

      // Cell background
      ctx.fillStyle = v === null ? (cardBg) : correlationColor(v ?? 0);
      ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);

      // Cell border
      ctx.strokeStyle = border;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);

      // Cell value
      ctx.fillStyle = fg;
      ctx.font = `${v === 1 ? 600 : 400} 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(
        v === null ? '—' : v.toFixed(2),
        x + cellSize / 2,
        y + cellSize / 2 + 5,
      );
    });
  });

  // Branding watermark
  ctx.fillStyle = mutedFg;
  ctx.font = `11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText('Deplyze Quant', W - padding, H - 6);

  triggerDownload(canvas.toDataURL('image/png'), filename);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function triggerDownload(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href     = dataUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
