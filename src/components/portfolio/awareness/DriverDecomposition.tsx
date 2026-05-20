/**
 * DriverDecomposition — five lenses on one horizontal-bar idiom.
 *
 * Lenses: Holding · Sector · Region · Asset class · Narrative theme.
 * (Factor / vol-regime lenses arrive in P3 when the backend synthesis
 * artifact lands.)
 *
 * The component is pure presentational: it consumes contribution rows
 * computed in `awarenessAttribution.ts` from cached portfolio performance
 * data, plus the narrative-exposure result already used elsewhere.
 */

import React, { useMemo, useState } from 'react';
import type { Holding } from '../../../lib/portfolio/schemas';
import {
  contributionByHolding,
  contributionBySector,
  contributionByRegion,
  contributionByAssetClass,
  totalAbsContribution,
  type ContributionRow,
  type HoldingCurveLike,
} from '../../../lib/portfolio/awarenessAttribution';
import type { NarrativeExposureResult } from '../../../services/reasoningService';

type LensKey = 'holding' | 'sector' | 'region' | 'asset' | 'narrative';

interface LensDef {
  key: LensKey;
  label: string;
  hint: string;
}

const LENSES: LensDef[] = [
  { key: 'holding',   label: 'By Holding',     hint: 'Individual position contribution' },
  { key: 'sector',    label: 'By Sector',      hint: 'Aggregated by sector classification' },
  { key: 'region',    label: 'By Region',      hint: 'Aggregated by region of listing' },
  { key: 'asset',     label: 'By Asset Class', hint: 'Aggregated by asset class' },
  { key: 'narrative', label: 'By Narrative',   hint: 'Theme exposure mapped from narrative memory' },
];

interface DriverDecompositionProps {
  holdings: Holding[];
  effectiveWeights: Record<string, number>;
  holdingCurves: HoldingCurveLike[];
  narrativeExposure: NarrativeExposureResult | null;
  totalReturn: number;
  periodLabel: string;
}

function fmtPct(v: number, signed = true): string {
  if (!isFinite(v)) return '—';
  const pct = v * 100;
  if (Math.abs(pct) < 0.005) return '0.00%';
  const s = pct.toFixed(2);
  return signed && pct > 0 ? `+${s}%` : `${s}%`;
}

const ContributionBar: React.FC<{
  row: ContributionRow;
  maxAbs: number;
}> = ({ row, maxAbs }) => {
  const pct = row.contribution * 100;
  const widthPct = maxAbs > 0 ? Math.min(100, (Math.abs(row.contribution) / maxAbs) * 100) : 0;
  const isPositive = pct >= 0;
  const color = isPositive ? 'var(--chart-2)' : 'var(--destructive)';
  const trackWeight = row.weight * 100;

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', letterSpacing: '-0.005em' }}>
          {row.label}
        </span>
        <span style={{ display: 'flex', gap: 12, alignItems: 'baseline', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
            {trackWeight.toFixed(1)}% weight
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color }}>
            {fmtPct(row.contribution)}
          </span>
        </span>
      </div>
      <div style={{
        position: 'relative', height: 4, borderRadius: 2,
        background: 'var(--muted)', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: isPositive ? '50%' : `${50 - widthPct / 2}%`,
          width: `${widthPct / 2}%`,
          background: color, opacity: 0.85,
        }} />
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: '50%', width: 1, background: 'var(--border)',
        }} />
      </div>
      {row.symbols && row.symbols.length > 1 && (
        <p style={{
          margin: '5px 0 0', fontSize: 10, color: 'var(--muted-foreground)',
          lineHeight: 1.4,
        }}>
          {row.symbols.slice(0, 6).join(' · ')}
          {row.symbols.length > 6 ? ` · +${row.symbols.length - 6} more` : ''}
        </p>
      )}
    </div>
  );
};

function narrativeRows(result: NarrativeExposureResult | null): ContributionRow[] {
  if (!result || !result.exposures.length) return [];
  return result.exposures.map(e => {
    const w = Number(e.portfolio_weight);
    const polarity = Number(e.polarity_score ?? 0);
    const intensity = Number(e.intensity ?? 1);
    const weight = isFinite(w) ? w : 0;
    const contribution = isFinite(weight * polarity * intensity)
      ? weight * polarity * intensity
      : 0;
    return {
      key: e.theme_id,
      label: e.theme_label,
      weight,
      contribution,
      count: e.matching_symbols.length,
      symbols: e.matching_symbols,
    };
  }).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

interface LensDiagnostic {
  classified: number;
  total: number;
  unclassifiedSymbols: string[];
}

function diagnoseLens(
  lens: LensKey,
  holdings: { symbol: string; sector?: string; region?: string; country?: string; assetClass?: unknown }[],
): LensDiagnostic {
  if (lens === 'holding' || lens === 'narrative') {
    return { classified: holdings.length, total: holdings.length, unclassifiedSymbols: [] };
  }
  const missing: string[] = [];
  for (const h of holdings) {
    let has = false;
    if (lens === 'sector') has = !!h.sector;
    else if (lens === 'region') has = !!(h.region || h.country);
    else if (lens === 'asset') has = !!h.assetClass;
    if (!has) missing.push(h.symbol);
  }
  return {
    classified: holdings.length - missing.length,
    total: holdings.length,
    unclassifiedSymbols: missing,
  };
}

export const DriverDecomposition: React.FC<DriverDecompositionProps> = ({
  holdings,
  effectiveWeights,
  holdingCurves,
  narrativeExposure,
  totalReturn,
  periodLabel,
}) => {
  const [lens, setLens] = useState<LensKey>('holding');

  const rows: ContributionRow[] = useMemo(() => {
    switch (lens) {
      case 'holding':   return contributionByHolding(holdings, effectiveWeights, holdingCurves);
      case 'sector':    return contributionBySector(holdings, effectiveWeights, holdingCurves);
      case 'region':    return contributionByRegion(holdings, effectiveWeights, holdingCurves);
      case 'asset':     return contributionByAssetClass(holdings, effectiveWeights, holdingCurves);
      case 'narrative': return narrativeRows(narrativeExposure);
    }
  }, [lens, holdings, effectiveWeights, holdingCurves, narrativeExposure]);

  const diagnostic = useMemo(() => diagnoseLens(lens, holdings), [lens, holdings]);

  const limited = rows.slice(0, 10);
  const maxAbs = totalAbsContribution(limited) > 0
    ? Math.max(...limited.map(r => Math.abs(r.contribution)))
    : 0;

  return (
    <section aria-label="Performance drivers" style={{ padding: '0 32px', marginTop: 48 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header style={{ marginBottom: 22 }}>
          <p style={{
            margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--muted-foreground)',
          }}>
            Drivers · {periodLabel}
          </p>
          <h2 style={{
            margin: '6px 0 0', fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em',
            color: 'var(--foreground)',
          }}>
            What drove the period.
          </h2>
          <p style={{
            margin: '6px 0 0', fontSize: 12, lineHeight: 1.6,
            color: 'var(--muted-foreground)', maxWidth: 720,
          }}>
            {lens === 'narrative'
              ? 'Theme-level exposure mapped from narrative memory. Positive contribution reflects favourable polarity × intensity.'
              : `Contribution decomposed as weight × period return. Total portfolio return ${fmtPct(totalReturn)}.`}
          </p>
        </header>

        {/* Lens selector */}
        <div role="tablist" aria-label="Decomposition lens" style={{
          display: 'flex', gap: 2, marginBottom: 18, padding: 3,
          borderRadius: 8, background: 'var(--muted)', width: 'fit-content',
        }}>
          {LENSES.map(l => (
            <button
              key={l.key}
              role="tab"
              aria-selected={lens === l.key}
              onClick={() => setLens(l.key)}
              title={l.hint}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                border: 'none', cursor: 'pointer', letterSpacing: '0.01em',
                background: lens === l.key ? 'var(--card)' : 'transparent',
                color: lens === l.key ? 'var(--foreground)' : 'var(--muted-foreground)',
                boxShadow: lens === l.key ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Diagnostic banner — explains why a lens looks sparse */}
        {(lens === 'sector' || lens === 'region' || lens === 'asset') && diagnostic.unclassifiedSymbols.length > 0 && (
          <div style={{
            padding: '10px 14px', marginBottom: 14, borderRadius: 8,
            border: '1px dashed var(--border)', background: 'var(--card)',
            fontSize: 11, lineHeight: 1.55, color: 'var(--muted-foreground)',
          }}>
            <strong style={{ color: 'var(--foreground)', fontWeight: 600 }}>
              {diagnostic.classified}/{diagnostic.total} holdings classified.
            </strong>{' '}
            {diagnostic.unclassifiedSymbols.length} holding{diagnostic.unclassifiedSymbols.length === 1 ? '' : 's'} lack{diagnostic.unclassifiedSymbols.length === 1 ? 's' : ''} {lens === 'asset' ? 'asset class' : lens} metadata:{' '}
            <span style={{ fontFamily: 'var(--font-mono, ui-monospace)', color: 'var(--foreground)' }}>
              {diagnostic.unclassifiedSymbols.slice(0, 12).join(' · ')}
              {diagnostic.unclassifiedSymbols.length > 12 ? ` · +${diagnostic.unclassifiedSymbols.length - 12} more` : ''}
            </span>.{' '}
            Set classifications on the Holdings page to populate this lens.
          </div>
        )}

        {/* Rows */}
        <div style={{
          borderTop: '1px solid var(--border)',
        }}>
          {limited.length === 0 ? (
            <p style={{
              padding: '24px 0', margin: 0, fontSize: 12, color: 'var(--muted-foreground)',
            }}>
              {lens === 'narrative'
                ? 'No active narrative themes match these holdings — the narrative pipeline may not have produced data for this portfolio yet.'
                : lens === 'holding'
                ? 'Contribution data will appear once the period has at least 10 sessions of returns.'
                : `No ${lens === 'asset' ? 'asset class' : lens} metadata is set on these holdings yet.`}
            </p>
          ) : (
            limited.map(row => <ContributionBar key={row.key} row={row} maxAbs={maxAbs} />)
          )}
        </div>

        {rows.length > limited.length && (
          <p style={{
            margin: '12px 0 0', fontSize: 10,
            color: 'var(--muted-foreground)', letterSpacing: '0.04em',
          }}>
            Showing top {limited.length} of {rows.length}. Smaller contributions omitted for clarity.
          </p>
        )}
      </div>
    </section>
  );
};
