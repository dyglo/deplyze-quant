import React, { useCallback } from 'react';
import { Trash2, RotateCcw } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import type { LabSession } from '../../types';

interface Props {
  sessions: LabSession[];
  loading: boolean;
  onDelete: (id: string) => void;
  onRestore?: (session: LabSession) => void;
}

const PANEL_COLOR: Record<string, string> = {
  risk:      'var(--chart-1)',
  alpha:     'var(--chart-2)',
  portfolio: 'var(--chart-3)',
};

function relTime(ms: number): string {
  const diff = Date.now() - ms;
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return new Date(ms).toLocaleDateString();
}

// Mini sparkline using rawSnapshot equity curve
const MiniCurve: React.FC<{ curve: number[] | undefined; color: string }> = ({ curve, color }) => {
  if (!curve?.length) return null;
  const data = curve.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Tooltip contentStyle={{ display: 'none' }} />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
};

// Weight allocation bar (portfolio sessions)
const WeightBar: React.FC<{ assets: Array<{ symbol: string; weight?: number }> }> = ({ assets }) => {
  const colors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', '#B87333'];
  const total = assets.reduce((s, a) => s + (a.weight ?? 0), 0);
  if (total === 0) return null;
  return (
    <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
      {assets.map((a, i) => (
        <div key={a.symbol} title={`${a.symbol}: ${((a.weight ?? 0) * 100).toFixed(0)}%`}
          style={{ flex: (a.weight ?? 0) / total, background: colors[i % colors.length], minWidth: 2 }} />
      ))}
    </div>
  );
};

// Alpha metrics ranked list
const AlphaRankList: React.FC<{ metrics: LabSession['rawSnapshot'] extends { alphaMetrics?: infer M } ? M : never }> = ({ metrics }) => {
  if (!metrics?.length) return null;
  const sorted = [...metrics].sort((a, b) => b.annReturn - a.annReturn);
  return (
    <div style={{ display: 'grid', gap: 2, marginTop: 4 }}>
      {sorted.slice(0, 5).map((m, i) => (
        <div key={m.symbol} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
          <span style={{ color: 'var(--muted-foreground)', width: 14 }}>#{i + 1}</span>
          <span style={{ fontWeight: 600, width: 48 }}>{m.symbol}</span>
          <span style={{ color: m.annReturn >= 0 ? '#788C5D' : 'var(--chart-1)', width: 52 }}>
            {(m.annReturn * 100).toFixed(1)}%
          </span>
          <span style={{ color: 'var(--muted-foreground)' }}>Sharpe {m.sharpe.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
};

export const LabSessionsTab: React.FC<Props> = ({ sessions, loading, onDelete, onRestore }) => {
  if (loading) return <p className="ds-caption" style={{ color: 'var(--muted-foreground)', padding: '16px 0' }}>Loading sessions…</p>;
  if (!sessions.length) return (
    <div className="ds-empty" style={{ minHeight: 200 }}>
      <p className="ds-heading">No saved sessions yet</p>
      <p className="ds-caption" style={{ maxWidth: 320, textAlign: 'center' }}>
        Run any analysis and click "Save Session" to persist it here. Sessions store detailed snapshots for later review.
      </p>
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {sessions.map(s => {
        const color = PANEL_COLOR[s.panel] ?? 'var(--muted-foreground)';
        const snap = s.rawSnapshot;
        const curve = snap?.riskMetrics?.equityCurve ?? snap?.portfolioMetrics?.equityCurve;
        const basketAssets = snap?.basket ?? snap?.alphaMetrics;

        return (
          <div key={s.id} className="ds-surface" style={{ borderRadius: 10, padding: 14, display: 'grid', gap: 8 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ background: `${color}22`, color, borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                    {s.panel}
                  </span>
                  <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>{relTime(s.createdAt)}</span>
                </div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{s.name}</p>
                <p className="ds-caption" style={{ margin: '2px 0 0', color: 'var(--muted-foreground)', fontSize: 11 }}>
                  {s.symbols.join(', ')} · {s.timeframe}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {onRestore && (
                  <button onClick={() => onRestore(s)} title="Restore session parameters"
                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <RotateCcw size={11} /> Restore
                  </button>
                )}
                <button onClick={() => onDelete(s.id)} title="Delete session"
                  style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
                  <Trash2 size={11} />
                </button>
              </div>
            </div>

            {/* Key metrics row */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {Object.entries(s.summary).slice(0, 5).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', flex: '0 0 auto', flexDirection: 'column' }}>
                  <span className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>
                    {typeof v === 'number' ? v.toFixed(2) : v}
                  </span>
                </div>
              ))}
            </div>

            {/* Equity curve sparkline */}
            {curve && curve.length > 3 && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                <p className="ds-caption" style={{ margin: '0 0 2px', color: 'var(--muted-foreground)', fontSize: 9 }}>EQUITY CURVE</p>
                <MiniCurve curve={curve} color={color} />
              </div>
            )}

            {/* Portfolio: weight allocation bar */}
            {s.panel === 'portfolio' && basketAssets && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                <p className="ds-caption" style={{ margin: '0 0 2px', color: 'var(--muted-foreground)', fontSize: 9 }}>ALLOCATION</p>
                <WeightBar assets={basketAssets} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  {basketAssets.map((a, i) => (
                    <span key={a.symbol} className="ds-caption" style={{ fontSize: 9, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 1, background: ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', '#B87333'][i % 6], display: 'inline-block' }} />
                      {a.symbol} {a.weight ? `${(a.weight * 100).toFixed(0)}%` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Alpha: ranked asset list */}
            {s.panel === 'alpha' && snap?.alphaMetrics && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                <p className="ds-caption" style={{ margin: '0 0 4px', color: 'var(--muted-foreground)', fontSize: 9 }}>RANKED ASSETS</p>
                <AlphaRankList metrics={snap.alphaMetrics} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
