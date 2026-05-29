/**
 * historicalResearchExport — turn a saved ResearchResult into downloadable
 * artifacts (PDF, Markdown, JSON).
 *
 * Design choices:
 * - PDF is a *report*, not a page screenshot. jsPDF + autoTable render clean
 *   selectable text with proper tables. We deliberately do NOT embed chart
 *   images: institutional users care about the numbers + narrative, and
 *   raster snapshots make the file fat, unsearchable, and ugly.
 * - Markdown is the same content in a format an analyst can drop into Notion,
 *   Slack, or a deck.
 * - JSON is the full ResearchResult, for re-import / programmatic use.
 *
 * Everything runs client-side: no gateway round-trip, no Puppeteer dep.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ResearchResult } from '../hooks/useHistoricalResearch';
import type { ResearchObservation } from '../services/historicalResearchService';

// ─── Filename helpers ─────────────────────────────────────────────────────

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'investigation';
}

function fname(r: ResearchResult, ext: string): string {
  const date = new Date(r.completedAt).toISOString().slice(0, 10);
  return `deplyze-${date}-${slug(r.query)}.${ext}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── JSON ─────────────────────────────────────────────────────────────────

export function exportJson(result: ResearchResult): void {
  const json = JSON.stringify(result, null, 2);
  downloadBlob(new Blob([json], { type: 'application/json' }), fname(result, 'json'));
}

// ─── Markdown ─────────────────────────────────────────────────────────────

export function exportMarkdown(result: ResearchResult): void {
  const md = buildMarkdown(result);
  downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), fname(result, 'md'));
}

function buildMarkdown(r: ResearchResult): string {
  const lines: string[] = [];
  const date = new Date(r.completedAt).toISOString().slice(0, 10);

  lines.push(`# Deep Research — ${r.query}`);
  lines.push('');
  lines.push(`_Generated ${date} via Deplyze Quant._`);
  lines.push('');

  // Plan summary
  lines.push('## Plan');
  lines.push('');
  lines.push(`- **Intent**: ${r.plan.intent}`);
  lines.push(`- **Assets**: ${r.plan.assets.join(', ')}`);
  if (r.plan.benchmark) lines.push(`- **Benchmark**: ${r.plan.benchmark}`);
  const tf = r.plan.timeframe;
  const win = tf.start && tf.end ? `${tf.start} → ${tf.end}` : `last ${tf.lookbackYears} years`;
  lines.push(`- **Window**: ${win}`);
  lines.push(`- **Actual data**: ${r.dataWindow.actualStart} → ${r.dataWindow.actualEnd} (${r.dataWindow.actualYears.toFixed(1)}y)`);
  lines.push('');

  // Regimes
  if (r.regimeMetrics && r.regimeMetrics.length > 0) {
    lines.push('## Regime comparison');
    lines.push('');
    const symbols = r.assets.map((a) => a.symbol);
    const header = ['Regime', 'Window', ...symbols.map((s) => `${s} (ret · DD · vol)`)];
    if (symbols.length >= 2) header.push('Pair correlation');
    lines.push(`| ${header.join(' | ')} |`);
    lines.push(`| ${header.map(() => '---').join(' | ')} |`);
    for (const rm of r.regimeMetrics) {
      const row: string[] = [
        rm.spec.label,
        `${rm.spec.start} → ${rm.spec.end}`,
      ];
      for (const s of symbols) {
        const m = rm.perAsset.find((a) => a.symbol === s);
        if (!m || m.bars < 5) { row.push('—'); continue; }
        row.push(`${pct(m.totalReturn)} · ${pct(m.maxDrawdown)} · ${pct(m.annVol)}`);
      }
      if (symbols.length >= 2) {
        row.push(rm.pairwiseCorrelations.map((p) => `${p.a}/${p.b} ${p.r.toFixed(2)}`).join('; ') || '—');
      }
      lines.push(`| ${row.join(' | ')} |`);
    }
    lines.push('');
  }

  // Performance summary
  if (r.analytics.performance.length > 0) {
    lines.push('## Performance summary');
    lines.push('');
    lines.push('| Asset | Total ret | CAGR | Ann vol | Sharpe | Sortino | Max DD | Skew | Kurt |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const p of r.analytics.performance) {
      lines.push(`| ${p.symbol} | ${pct(p.totalReturn)} | ${pct(p.cagr)} | ${pct(p.annVol)} | ${p.sharpe.toFixed(2)} | ${p.sortino.toFixed(2)} | ${pct(p.maxDrawdown)} | ${p.skew.toFixed(2)} | ${p.kurtosis.toFixed(2)} |`);
    }
    lines.push('');
  }

  // Narrative
  if (r.narrative) {
    lines.push('## Narrative');
    lines.push('');
    lines.push(r.narrative);
    lines.push('');
  }

  // Observations
  if (r.observations.length > 0) {
    lines.push('## Observations');
    lines.push('');
    for (const o of r.observations) {
      lines.push(`- **${o.label}**: ${o.value}${o.period ? ` _(${o.period})_` : ''}`);
    }
    lines.push('');
  }

  // Follow-ups
  if (r.followups && r.followups.length > 0) {
    lines.push('## Follow-ups');
    lines.push('');
    for (const t of r.followups) {
      lines.push(`**Q.** ${t.question}`);
      lines.push('');
      lines.push(t.answer);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('_Numbers computed locally from real OHLCV data. Narrative grounded to the observation list above — no figure cited that is not in that list._');
  return lines.join('\n');
}

// ─── PDF ──────────────────────────────────────────────────────────────────

export function exportPdf(result: ResearchResult): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const usable = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (h: number) => {
    if (y + h > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const drawHeading = (text: string, level: 1 | 2) => {
    ensureSpace(level === 1 ? 36 : 24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(level === 1 ? 18 : 13);
    doc.setTextColor(20, 20, 20);
    doc.text(text, margin, y);
    y += level === 1 ? 22 : 16;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(50, 50, 50);
  };

  const drawParagraph = (text: string, opts?: { fontSize?: number; color?: [number, number, number] }) => {
    const size = opts?.fontSize ?? 10;
    doc.setFontSize(size);
    doc.setTextColor(...(opts?.color ?? [40, 40, 40]));
    const lines = doc.splitTextToSize(text, usable);
    for (const ln of lines) {
      ensureSpace(size + 4);
      doc.text(ln, margin, y);
      y += size + 3;
    }
    y += 4;
  };

  // ── Title ────────────────────────────────────────────────────────────
  drawHeading('Deep Research', 1);
  drawParagraph(`"${result.query}"`, { fontSize: 11, color: [40, 40, 40] });
  drawParagraph(
    `Generated ${new Date(result.completedAt).toISOString().slice(0, 10)} via Deplyze Quant.`,
    { fontSize: 9, color: [120, 120, 120] },
  );

  // ── Plan ─────────────────────────────────────────────────────────────
  drawHeading('Plan', 2);
  const tf = result.plan.timeframe;
  const win = tf.start && tf.end ? `${tf.start} → ${tf.end}` : `last ${tf.lookbackYears} years`;
  const planLines = [
    `Intent: ${result.plan.intent}`,
    `Assets: ${result.plan.assets.join(', ')}`,
    result.plan.benchmark ? `Benchmark: ${result.plan.benchmark}` : '',
    `Window: ${win}`,
    `Actual data: ${result.dataWindow.actualStart} → ${result.dataWindow.actualEnd} (${result.dataWindow.actualYears.toFixed(1)}y)`,
  ].filter(Boolean);
  for (const line of planLines) drawParagraph(line);

  // ── Regimes ──────────────────────────────────────────────────────────
  if (result.regimeMetrics && result.regimeMetrics.length > 0) {
    drawHeading('Regime comparison', 2);
    const symbols = result.assets.map((a) => a.symbol);
    const head: string[] = ['Regime', 'Window'];
    for (const s of symbols) head.push(`${s}\nret · DD · vol`);
    if (symbols.length >= 2) head.push('Pair corr');

    const body: string[][] = result.regimeMetrics.map((rm) => {
      const row: string[] = [
        rm.spec.label + (rm.spec.hypothesis ? `\n${rm.spec.hypothesis}` : ''),
        `${rm.spec.start.slice(0, 7)}\n→ ${rm.spec.end.slice(0, 7)}`,
      ];
      for (const s of symbols) {
        const m = rm.perAsset.find((a) => a.symbol === s);
        if (!m || m.bars < 5) { row.push('—'); continue; }
        row.push(`${pct(m.totalReturn)}\n${pct(m.maxDrawdown)} · ${pct(m.annVol)}`);
      }
      if (symbols.length >= 2) {
        row.push(rm.pairwiseCorrelations.map((p) => `${p.a}/${p.b} ${p.r.toFixed(2)}`).join('\n') || '—');
      }
      return row;
    });

    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 5, valign: 'top' },
      headStyles: { fillColor: [91, 107, 142], textColor: 255, fontStyle: 'bold' },
      margin: { left: margin, right: margin },
      didDrawPage: (data) => { y = data.cursor?.y ?? y; },
    });
    // autoTable advances y via the cursor callback.
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 16;
  }

  // ── Performance ──────────────────────────────────────────────────────
  if (result.analytics.performance.length > 0) {
    drawHeading('Performance summary', 2);
    autoTable(doc, {
      startY: y,
      head: [['Asset', 'Total', 'CAGR', 'Ann vol', 'Sharpe', 'Sortino', 'Max DD', 'Skew', 'Kurt']],
      body: result.analytics.performance.map((p) => [
        p.symbol, pct(p.totalReturn), pct(p.cagr), pct(p.annVol),
        p.sharpe.toFixed(2), p.sortino.toFixed(2),
        pct(p.maxDrawdown), p.skew.toFixed(2), p.kurtosis.toFixed(2),
      ]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 5 },
      headStyles: { fillColor: [91, 107, 142], textColor: 255, fontStyle: 'bold' },
      margin: { left: margin, right: margin },
    });
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 16;
  }

  // ── Narrative ────────────────────────────────────────────────────────
  if (result.narrative) {
    drawHeading('Narrative', 2);
    drawParagraph(result.narrative, { fontSize: 11 });
  }

  // ── Observations ─────────────────────────────────────────────────────
  if (result.observations.length > 0) {
    drawHeading('Observations', 2);
    autoTable(doc, {
      startY: y,
      head: [['Label', 'Value', 'Period']],
      body: result.observations.map((o: ResearchObservation) => [
        o.label, String(o.value), o.period ?? '',
      ]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: 'bold' },
      margin: { left: margin, right: margin },
    });
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 16;
  }

  // ── Follow-ups ───────────────────────────────────────────────────────
  if (result.followups && result.followups.length > 0) {
    drawHeading('Follow-ups', 2);
    for (const t of result.followups) {
      doc.setFont('helvetica', 'bold');
      drawParagraph(`Q. ${t.question}`, { fontSize: 10 });
      doc.setFont('helvetica', 'normal');
      drawParagraph(t.answer, { fontSize: 10 });
    }
  }

  // ── Footer note ──────────────────────────────────────────────────────
  ensureSpace(40);
  y += 8;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, margin + usable, y);
  y += 10;
  drawParagraph(
    'Numbers computed locally from real OHLCV data. Narrative grounded to the observation list above — no figure cited that is not in that list.',
    { fontSize: 8, color: [120, 120, 120] },
  );

  doc.save(fname(result, 'pdf'));
}

// ─── Print ────────────────────────────────────────────────────────────────

export function exportPrint(): void {
  window.print();
}

// ─── helpers ──────────────────────────────────────────────────────────────

function pct(x: number): string { return `${(x * 100).toFixed(1)}%`; }
