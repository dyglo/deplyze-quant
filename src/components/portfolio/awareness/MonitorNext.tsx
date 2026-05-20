/**
 * MonitorNext — institutional probe list. Each probe is "what to watch
 * next" given the current portfolio state. Never a trade.
 *
 * Layout mirrors Bloomberg PORT "watch items" — a dense vertical list of
 * categorised observations with a severity ribbon, headline, rationale,
 * and inline evidence pills. Clicking a probe expands inline evidence
 * detail (and a deep-link to the related holding when applicable).
 */

import React, { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Holding } from '../../../lib/portfolio/schemas';
import type { HoldingCurveInput } from '../../../lib/portfolio/clientStress';
import type { VulnerabilityResult } from '../../../services/reasoningService';
import type { SectorClassification } from '../../../hooks/useSectorMetadata';
import { computePositionMetrics, correlation } from '../../../lib/portfolio/holdingAnalytics';
import {
  buildMonitorProbes,
  categoryLabel,
  type MonitorProbe,
  type MonitorSeverity,
} from '../../../lib/portfolio/monitorNext';
import { SectionNarrative } from './SectionNarrative';

interface Props {
  holdings: Holding[];
  effectiveWeights: Record<string, number>;
  holdingCurves: HoldingCurveInput[];
  benchLogReturns: number[];
  sectorBySymbol: Record<string, SectorClassification>;
  vulnerability: VulnerabilityResult | null;
  benchmarkId?: string;
}

const SEV_COLOR: Record<MonitorSeverity, string> = {
  high:   'var(--destructive)',
  medium: 'var(--chart-4)',
  low:    'var(--chart-2)',
};

const SEV_LABEL: Record<MonitorSeverity, string> = {
  high:   'Watch',
  medium: 'Monitor',
  low:    'Note',
};

function fmtSectorWeights(
  holdings: Holding[],
  effectiveWeights: Record<string, number>,
  sectorBySymbol: Record<string, SectorClassification>,
): Array<{ sector: string; weight: number; memberCount: number }> {
  const groups = new Map<string, { weight: number; count: number }>();
  for (const h of holdings) {
    const sector = h.sector || sectorBySymbol[h.symbol]?.sector || 'Unclassified';
    const w = effectiveWeights[h.symbol] ?? 0;
    const cur = groups.get(sector) ?? { weight: 0, count: 0 };
    groups.set(sector, { weight: cur.weight + w, count: cur.count + 1 });
  }
  return Array.from(groups.entries())
    .map(([sector, g]) => ({ sector, weight: g.weight, memberCount: g.count }))
    .sort((a, b) => b.weight - a.weight);
}

const Pill: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'baseline', gap: 6,
    padding: '3px 8px', borderRadius: 5,
    background: 'var(--background)',
    border: '1px solid var(--border)',
    fontSize: 10, fontWeight: 600,
    color: 'var(--foreground)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  }}>
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
      textTransform: 'uppercase', color: 'var(--muted-foreground)',
    }}>
      {label}
    </span>
    {value}
  </span>
);

const ProbeRow: React.FC<{
  probe: MonitorProbe;
  expanded: boolean;
  onToggle: () => void;
  onOpenSymbol?: (sym: string) => void;
}> = ({ probe, expanded, onToggle, onOpenSymbol }) => {
  const tone = SEV_COLOR[probe.severity];
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          width: '100%', textAlign: 'left',
          border: 'none', background: expanded ? 'color-mix(in oklab, var(--primary) 4%, transparent)' : 'transparent',
          padding: '12px 16px',
          display: 'grid',
          gridTemplateColumns: '18px 88px 1fr auto',
          gap: 12, alignItems: 'flex-start',
          cursor: 'pointer',
          transition: 'background 120ms',
        }}
      >
        <span style={{ color: 'var(--muted-foreground)', marginTop: 1 }}>
          {expanded ? <ChevronDown size={14} strokeWidth={2.5} /> : <ChevronRight size={14} strokeWidth={2} />}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: tone,
          paddingTop: 3,
        }}>
          <span style={{
            display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
            background: tone, marginRight: 6, verticalAlign: 1,
          }} />
          {SEV_LABEL[probe.severity]} · {categoryLabel(probe.category)}
        </span>
        <div style={{ minWidth: 0 }}>
          <p style={{
            margin: 0, fontSize: 13, fontWeight: 600,
            color: 'var(--foreground)', letterSpacing: '-0.005em',
            lineHeight: 1.4,
          }}>
            {probe.title}
          </p>
          {!expanded && (
            <p style={{
              margin: '3px 0 0', fontSize: 11, color: 'var(--muted-foreground)',
              lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis',
              display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
            }}>
              {probe.rationale}
            </p>
          )}
        </div>
        <span />
      </button>
      {expanded && (
        <div style={{
          padding: '0 16px 14px 124px',
          background: 'color-mix(in oklab, var(--primary) 4%, transparent)',
        }}>
          <p style={{
            margin: 0, fontSize: 12, color: 'var(--foreground)',
            lineHeight: 1.6, maxWidth: 760,
          }}>
            {probe.rationale}
          </p>
          {probe.evidence.length > 0 && (
            <div style={{
              display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10,
            }}>
              {probe.evidence.map((e, i) => (
                <Pill key={`${e.label}-${i}`} label={e.label} value={e.value} />
              ))}
            </div>
          )}
          {probe.symbols && probe.symbols.length > 0 && onOpenSymbol && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {probe.symbols.slice(0, 4).map(sym => (
                <button
                  key={sym}
                  onClick={(e) => { e.stopPropagation(); onOpenSymbol(sym); }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 9px', borderRadius: 5,
                    border: '1px solid var(--border)', background: 'var(--card)',
                    fontSize: 10, fontWeight: 600, color: 'var(--foreground)',
                    cursor: 'pointer',
                  }}
                >
                  Open {sym} <ExternalLink size={9} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const MonitorNext: React.FC<Props> = ({
  holdings,
  effectiveWeights,
  holdingCurves,
  benchLogReturns,
  sectorBySymbol,
  vulnerability,
  benchmarkId,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const navigate = useNavigate();

  const positions = useMemo(
    () => computePositionMetrics(
      holdings.map(h => h.symbol),
      effectiveWeights,
      holdingCurves,
      benchLogReturns,
    ),
    [holdings, effectiveWeights, holdingCurves, benchLogReturns],
  );

  const sectorWeights = useMemo(
    () => fmtSectorWeights(holdings, effectiveWeights, sectorBySymbol),
    [holdings, effectiveWeights, sectorBySymbol],
  );

  const meanIntraCorr = useMemo(() => {
    const top = [...positions].sort((a, b) => b.weight - a.weight).slice(0, 8);
    if (top.length < 2) return 0;
    let sum = 0, count = 0;
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        sum += correlation(top[i].logRets, top[j].logRets);
        count += 1;
      }
    }
    return count > 0 ? sum / count : 0;
  }, [positions]);

  const probes = useMemo(
    () => buildMonitorProbes({
      positions,
      sectorBySymbol,
      sectorWeights,
      vulnerability,
      meanIntraCorr,
      benchmarkId,
    }),
    [positions, sectorBySymbol, sectorWeights, vulnerability, meanIntraCorr, benchmarkId],
  );

  const counts = useMemo(() => ({
    high:   probes.filter(p => p.severity === 'high').length,
    medium: probes.filter(p => p.severity === 'medium').length,
    low:    probes.filter(p => p.severity === 'low').length,
  }), [probes]);

  const narrativeLines: string[] = useMemo(() => {
    if (probes.length === 0) {
      return [`No elevated monitoring probes are active on your portfolio — the cross-section reads as calm.`];
    }
    const lines: string[] = [];
    if (counts.high > 0) {
      lines.push(`${counts.high} item${counts.high === 1 ? '' : 's'} worth close watching surfaced from your portfolio state.`);
    }
    const topProbe = probes[0];
    lines.push(`Top of the list: ${topProbe.title.replace(/^Monitor |^Watch |^Track /, '')}.`);
    if (probes.length > 1) {
      const categories = Array.from(new Set(probes.slice(0, 5).map(p => categoryLabel(p.category)))).join(' · ');
      lines.push(`Coverage spans ${categories}.`);
    }
    return lines;
  }, [probes, counts]);

  return (
    <section aria-label="Monitor next" style={{ padding: '0 32px', marginTop: 56 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <header style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 16, marginBottom: 14, flexWrap: 'wrap',
        }}>
          <div>
            <p style={{
              margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: 'var(--muted-foreground)',
            }}>
              Monitor Next
            </p>
            <h2 style={{
              margin: '4px 0 0', fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em',
              color: 'var(--foreground)',
            }}>
              What deserves continued attention.
            </h2>
          </div>
          {probes.length > 0 && (
            <div style={{ display: 'flex', gap: 6 }}>
              {counts.high > 0 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 9px', borderRadius: 5,
                  background: 'color-mix(in oklab, var(--destructive) 12%, transparent)',
                  color: 'var(--destructive)',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                }}>
                  {counts.high} Watch
                </span>
              )}
              {counts.medium > 0 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 9px', borderRadius: 5,
                  background: 'color-mix(in oklab, var(--chart-4) 14%, transparent)',
                  color: 'var(--chart-4)',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                }}>
                  {counts.medium} Monitor
                </span>
              )}
            </div>
          )}
        </header>

        <SectionNarrative lines={narrativeLines} />

        <div style={{
          borderRadius: 10, overflow: 'hidden',
          border: '1px solid var(--border)', background: 'var(--card)',
        }}>
          {probes.length === 0 ? (
            <p style={{ padding: '20px 16px', margin: 0, fontSize: 12, color: 'var(--muted-foreground)' }}>
              No elevated probes — your portfolio's cross-section reads calmly.
            </p>
          ) : (
            probes.map(p => (
              <ProbeRow
                key={p.id}
                probe={p}
                expanded={expandedId === p.id}
                onToggle={() => setExpandedId(prev => prev === p.id ? null : p.id)}
                onOpenSymbol={sym => navigate(`/instruments/${sym}`)}
              />
            ))
          )}
        </div>

        <p style={{
          margin: '10px 0 0', fontSize: 10, color: 'var(--muted-foreground)',
          lineHeight: 1.55, fontStyle: 'italic',
        }}>
          Probes are observations about what to monitor — they are never trade instructions.
          Severity is calibrated to the magnitude of the underlying condition (weight, vol, drawdown,
          correlation, regime score).
        </p>
      </div>
    </section>
  );
};
