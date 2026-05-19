import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine, AreaChart, Area,
} from 'recharts';
import {
  Zap, Loader2, AlertCircle, TrendingDown, TrendingUp, Activity,
  Plus, Pencil, Trash2, X, Check, Shield,
} from 'lucide-react';
import { useAuth } from '../../components/AuthProvider';
import { useWorkspace } from '../../components/WorkspaceContext';
import { usePortfolioWorkspace } from '../../hooks/usePortfolioWorkspace';
import { usePortfolioIntelligence } from '../../hooks/usePortfolioIntelligence';
import { fetchOHLCV } from '../../services/marketService';
import { logReturns, cumulativeLogReturns, rebase100 } from '../../lib/quant/returns';
import {
  STRESS_PRESETS, fmtShock, resolveShockKey, adjustedPortfolioImpact,
  SHOCK_META, REGIME_META, NORMAL_REGIME,
  type StressScenario, type ShockKey, type RegimeSignals,
} from '../../lib/stressScenarios';
import {
  saveCustomScenario, updateCustomScenario, deleteCustomScenario,
  subscribeToCustomScenarios, type CustomScenario,
} from '../../services/portfolioService';
import { fmtPct, fmtUSD, fmtBoth } from '../../lib/portfolio/fmt';
import { PortfolioIntelligencePanel } from '../../components/portfolio/PortfolioIntelligencePanel';
import { AgentIntelligenceFeed } from '../../components/quant/AgentIntelligenceFeed';
import { MacroAnalogPanel } from '../../components/quant/MacroAnalogPanel';
import { useAgentOutputs } from '../../hooks/useAgentIntelligence';
import { useHistoricalAnalog } from '../../hooks/useAgentReasoning';
import type { OHLCVBar } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const BLANK_SHOCKS = (): Record<ShockKey, number> => ({
  equity: 0, bonds: 0, gold: 0, oil: 0, crypto: 0,
  realestate: 0, highyield: 0, financials: 0, vix: 1,
});

const BLANK_REGIME = (): RegimeSignals => ({
  correlationStress: 0, liquidityStress: 0, volMultiplier: 1,
  recoveryDays: 60, forcedDeleveraging: false,
});

type AnyScenario = (StressScenario & { source: 'preset' }) | (CustomScenario & { source: 'custom' });

// ─── Shock slider ─────────────────────────────────────────────────────────────

const ShockSlider: React.FC<{
  label: string; hint: string; value: number;
  min?: number; max?: number; step?: number; unit?: string;
  onChange: (v: number) => void;
}> = ({ label, hint, value, min = -100, max = 100, step = 1, unit = '%', onChange }) => {
  const display = unit === '%' ? Math.round(value * 100) : value;
  const color = value < (unit === '%' ? 0 : 1) ? 'var(--destructive)' : value > (unit === '%' ? 0 : 1) ? 'var(--chart-2)' : 'var(--muted-foreground)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)' }}>{label}</span>
          <span style={{ fontSize: 9, color: 'var(--muted-foreground)', marginLeft: 6 }}>{hint}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <input
            type="number" min={min} max={max} step={step}
            value={display}
            onChange={e => {
              const v = parseFloat(e.target.value || '0');
              onChange(unit === '%' ? v / 100 : v);
            }}
            style={{ width: 64, padding: '2px 6px', borderRadius: 4, fontSize: 12, fontWeight: 700, border: '1px solid var(--border)', background: 'var(--background)', color, textAlign: 'right', outline: 'none', fontVariantNumeric: 'tabular-nums' }}
          />
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)', minWidth: 14 }}>{unit}</span>
        </div>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={display}
        onChange={e => { const v = parseInt(e.target.value); onChange(unit === '%' ? v / 100 : v); }}
        style={{ width: '100%', accentColor: value < (unit === '%' ? 0 : 1) ? 'var(--destructive)' : 'var(--primary)', cursor: 'pointer' }}
      />
    </div>
  );
};

// ─── Scenario modal ───────────────────────────────────────────────────────────

interface ScenarioForm {
  label: string; period: string; description: string;
  shocks: Record<ShockKey, number>;
  regime: RegimeSignals;
}

const ScenarioModal: React.FC<{
  title: string;
  initial?: ScenarioForm;
  onSave: (d: ScenarioForm) => Promise<void>;
  onClose: () => void;
}> = ({ title, initial, onSave, onClose }) => {
  const [form, setForm] = useState<ScenarioForm>(initial ?? {
    label: '', period: '', description: '',
    shocks: BLANK_SHOCKS(), regime: BLANK_REGIME(),
  });
  const [saving, setSaving] = useState(false);
  const [template, setTemplate] = useState('');

  const applyTemplate = (id: string) => {
    const p = STRESS_PRESETS.find(x => x.id === id);
    if (!p) return;
    setForm(prev => ({
      ...prev,
      label:       prev.label       || p.label,
      period:      prev.period      || p.period,
      description: prev.description || p.description,
      shocks:      { ...p.shocks },
      regime:      { ...p.regime },
    }));
    setTemplate('');
  };

  const setShock  = (k: ShockKey, v: number) => setForm(f => ({ ...f, shocks: { ...f.shocks, [k]: v } }));
  const setRegime = (k: keyof RegimeSignals, v: number | boolean) =>
    setForm(f => ({ ...f, regime: { ...f.regime, [k]: v } }));

  const handleSave = async () => {
    if (!form.label.trim()) return;
    setSaving(true);
    try { await onSave(form); onClose(); } catch { setSaving(false); }
  };

  const ASSET_KEYS: ShockKey[]  = ['equity', 'bonds', 'gold', 'oil', 'crypto', 'realestate', 'highyield', 'financials'];
  const activeShocks = (Object.entries(form.shocks) as [ShockKey, number][]).filter(([k, v]) => k !== 'vix' && v !== 0);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 520, maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</p>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex' }}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Template */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Start from preset (optional)</label>
            <select value={template} onChange={e => { setTemplate(e.target.value); applyTemplate(e.target.value); }}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', cursor: 'pointer' }}>
              <option value="">— Build from scratch —</option>
              {STRESS_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label} ({p.period})</option>)}
            </select>
          </div>

          {/* Name */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Scenario Name *</label>
            <input autoFocus value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder="e.g. AI Bubble Burst, EM Currency Crisis, Stagflation 2027…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, fontSize: 13, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', outline: 'none' }} />
          </div>

          {/* Period + description */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Period / Context</label>
              <input value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))}
                placeholder="e.g. Q3 2027, My bear case…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Description</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Macro thesis or trigger…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', outline: 'none' }} />
            </div>
          </div>

          {/* Asset class shocks */}
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Asset Class Shocks</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 14px', background: 'var(--muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
              {ASSET_KEYS.map(k => (
                <ShockSlider key={k} label={SHOCK_META[k].label} hint={SHOCK_META[k].description}
                  value={form.shocks[k]} onChange={v => setShock(k, v)} />
              ))}
              <ShockSlider key="vix" label={SHOCK_META.vix.label} hint={SHOCK_META.vix.description}
                value={form.shocks.vix} min={1} max={15} step={0.5} unit="×"
                onChange={v => setShock('vix', v)} />
            </div>
          </div>

          {/* Regime / macro signals */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Shield size={11} style={{ color: 'var(--chart-4)' }} />
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: 'var(--chart-4)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Institutional / Macro Signals</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 14px', background: 'color-mix(in srgb, var(--chart-4) 5%, transparent)', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--chart-4) 20%, transparent)' }}>
              <ShockSlider label={REGIME_META.correlationStress.label} hint={REGIME_META.correlationStress.description}
                value={form.regime.correlationStress} min={0} max={100} step={5} unit="%"
                onChange={v => setRegime('correlationStress', v)} />
              <ShockSlider label={REGIME_META.liquidityStress.label} hint={REGIME_META.liquidityStress.description}
                value={form.regime.liquidityStress} min={0} max={100} step={5} unit="%"
                onChange={v => setRegime('liquidityStress', v)} />
              <ShockSlider label={REGIME_META.volMultiplier.label} hint={REGIME_META.volMultiplier.description}
                value={form.regime.volMultiplier} min={1} max={15} step={0.5} unit="×"
                onChange={v => setRegime('volMultiplier', v)} />
              <ShockSlider label={REGIME_META.recoveryDays.label} hint={REGIME_META.recoveryDays.description}
                value={form.regime.recoveryDays} min={1} max={1200} step={10} unit="d"
                onChange={v => setRegime('recoveryDays', v)} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)' }}>{REGIME_META.forcedDeleveraging.label}</span>
                  <span style={{ fontSize: 9, color: 'var(--muted-foreground)', marginLeft: 6 }}>{REGIME_META.forcedDeleveraging.description}</span>
                </div>
                <button
                  onClick={() => setRegime('forcedDeleveraging', !form.regime.forcedDeleveraging)}
                  style={{
                    padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                    background: form.regime.forcedDeleveraging ? 'var(--destructive)' : 'var(--muted)',
                    color: form.regime.forcedDeleveraging ? 'white' : 'var(--muted-foreground)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {form.regime.forcedDeleveraging ? 'YES' : 'NO'}
                </button>
              </div>
            </div>
          </div>

          {/* Live shock preview chips */}
          {activeShocks.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {activeShocks.map(([k, v]) => (
                <span key={k} style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                  background: v < 0 ? 'color-mix(in srgb, var(--destructive) 12%, transparent)' : 'color-mix(in srgb, var(--chart-2) 12%, transparent)',
                  color: v < 0 ? 'var(--destructive)' : 'var(--chart-2)',
                  border: `1px solid ${v < 0 ? 'color-mix(in srgb, var(--destructive) 25%, transparent)' : 'color-mix(in srgb, var(--chart-2) 25%, transparent)'}`,
                }}>
                  {(SHOCK_META[k]?.label ?? k).split(' ')[0]} {fmtShock(v)}
                </span>
              ))}
            </div>
          )}

          <button
            disabled={!form.label.trim() || saving}
            onClick={handleSave}
            style={{
              padding: '10px 16px', borderRadius: 7, fontSize: 13, fontWeight: 700,
              background: form.label.trim() ? 'var(--primary)' : 'var(--muted)',
              color: form.label.trim() ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
              border: 'none', cursor: form.label.trim() ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
            {saving ? 'Saving…' : 'Save Scenario'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Section card ─────────────────────────────────────────────────────────────

const SectionCard: React.FC<{ title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ title, subtitle, icon, children }) => (
  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '12px 16px 10px', borderBottom: '1px solid var(--border)' }}>
      {icon && <div style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }}>{icon}</div>}
      <div>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--foreground)' }}>{title}</p>
        {subtitle && <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>{subtitle}</p>}
      </div>
    </div>
    <div style={{ padding: '14px 16px' }}>{children}</div>
  </div>
);

// ─── Regime badge strip ───────────────────────────────────────────────────────

const RegimeBadges: React.FC<{ regime: RegimeSignals }> = ({ regime }) => {
  const badges: Array<{ label: string; value: string; severity: 'high' | 'medium' | 'low' | 'none' }> = [
    {
      label: 'Correlation stress',
      value: `${(regime.correlationStress * 100).toFixed(0)}%`,
      severity: regime.correlationStress > 0.7 ? 'high' : regime.correlationStress > 0.4 ? 'medium' : regime.correlationStress > 0 ? 'low' : 'none',
    },
    {
      label: 'Liquidity stress',
      value: `${(regime.liquidityStress * 100).toFixed(0)}%`,
      severity: regime.liquidityStress > 0.7 ? 'high' : regime.liquidityStress > 0.4 ? 'medium' : regime.liquidityStress > 0 ? 'low' : 'none',
    },
    {
      label: 'Vol multiplier',
      value: `${regime.volMultiplier.toFixed(1)}×`,
      severity: regime.volMultiplier > 4 ? 'high' : regime.volMultiplier > 2 ? 'medium' : 'none',
    },
    {
      label: 'Recovery',
      value: `~${regime.recoveryDays}d`,
      severity: regime.recoveryDays > 500 ? 'high' : regime.recoveryDays > 200 ? 'medium' : 'none',
    },
    ...(regime.forcedDeleveraging ? [{ label: 'Forced deleveraging', value: 'YES', severity: 'high' as const }] : []),
  ];
  const colors: Record<string, string> = {
    high:   'color-mix(in srgb, var(--destructive) 15%, transparent)',
    medium: 'color-mix(in srgb, var(--chart-4) 15%, transparent)',
    low:    'color-mix(in srgb, var(--chart-2) 10%, transparent)',
    none:   'var(--muted)',
  };
  const textColors: Record<string, string> = { high: 'var(--destructive)', medium: 'var(--chart-4)', low: 'var(--chart-2)', none: 'var(--muted-foreground)' };
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {badges.filter(b => b.severity !== 'none').map(b => (
        <div key={b.label} style={{ padding: '3px 9px', borderRadius: 4, background: colors[b.severity], border: `1px solid ${colors[b.severity]}`, fontSize: 10 }}>
          <span style={{ color: 'var(--muted-foreground)' }}>{b.label}: </span>
          <span style={{ fontWeight: 700, color: textColors[b.severity] }}>{b.value}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

export const ScenarioStress: React.FC = () => {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { selectedPortfolio, holdings, loading, holdingsLoading, effectiveWeights } = usePortfolioWorkspace();
  const totalValue = selectedPortfolio?.totalValue;

  const [customScenarios, setCustomScenarios] = useState<CustomScenario[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomScenario | null>(null);
  const [selectedId, setSelectedId] = useState<string>(STRESS_PRESETS[0].id);
  const [barsMap, setBarsMap] = useState<Record<string, OHLCVBar[]>>({});

  useEffect(() => {
    if (!user || !currentWorkspace) return;
    return subscribeToCustomScenarios(user.uid, currentWorkspace.id, setCustomScenarios);
  }, [user, currentWorkspace]);

  const symbols = useMemo(() => holdings.map(h => h.symbol), [holdings]);

  useEffect(() => {
    if (symbols.length === 0) { setBarsMap({}); return; }
    Promise.allSettled(symbols.map(s => fetchOHLCV(s, '1day', 90))).then(results => {
      const m: Record<string, OHLCVBar[]> = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.bars.length >= 5) m[symbols[i]] = r.value.bars;
      });
      setBarsMap(m);
    });
  }, [symbols.join(',')]);

  const allScenarios: AnyScenario[] = useMemo(() => [
    ...STRESS_PRESETS.map(p => ({ ...p, source: 'preset' as const })),
    ...customScenarios.map(c => ({ ...c, source: 'custom' as const })),
  ], [customScenarios]);

  useEffect(() => {
    if (allScenarios.length > 0 && !allScenarios.find(s => s.id === selectedId)) {
      setSelectedId(allScenarios[0].id);
    }
  }, [allScenarios, selectedId]);

  const scenario = allScenarios.find(s => s.id === selectedId) ?? allScenarios[0];

  const holdingImpacts = useMemo(() => {
    if (!scenario) return [];
    return holdings.map(h => {
      const shockKey = resolveShockKey(h.assetClass, h.sector ?? undefined);
      const shockFraction = scenario.shocks[shockKey] ?? scenario.shocks.equity;
      const w = effectiveWeights[h.symbol] ?? 0;
      return {
        symbol: h.symbol, assetClass: h.assetClass, weight: w,
        shockFraction, portContrib: shockFraction * w,
        currentPrice: barsMap[h.symbol]?.at(-1)?.close ?? null,
      };
    }).sort((a, b) => a.portContrib - b.portContrib);
  }, [holdings, effectiveWeights, scenario, barsMap]);

  const baseImpact = useMemo(() =>
    holdingImpacts.reduce((s, h) => s + h.portContrib, 0), [holdingImpacts]);

  const portfolioImpact = useMemo(() => {
    if (!scenario) return baseImpact;
    return adjustedPortfolioImpact(baseImpact, holdingImpacts, scenario.regime ?? NORMAL_REGIME);
  }, [baseImpact, holdingImpacts, scenario]);

  const scenarioPath = useMemo(() => {
    const pts = 60;
    const shockPerStep = portfolioImpact / 10;
    const recovery = -portfolioImpact / 50;
    let cum = 0;
    return Array.from({ length: pts + 1 }, (_, i) => {
      cum += i <= 10 ? shockPerStep : i <= 40 ? recovery : 0;
      return { day: i, portfolio: 100 + cum * 100, baseline: 100 };
    });
  }, [portfolioImpact]);

  const allImpacts = useMemo(() =>
    allScenarios.map(s => ({
      id: s.id, scenario: s.label, source: s.source,
      impact: holdings.reduce((sum, h) => {
        const k = resolveShockKey(h.assetClass, h.sector ?? undefined);
        return sum + (s.shocks[k] ?? s.shocks.equity) * (effectiveWeights[h.symbol] ?? 0);
      }, 0),
    })).sort((a, b) => a.impact - b.impact),
    [allScenarios, holdings, effectiveWeights]);

  const analogData = useMemo(() => {
    const valid = symbols.filter(s => barsMap[s]?.length >= 30);
    if (!valid.length) return [];
    const bars = barsMap[valid[0]];
    const lr = logReturns(bars.map(b => b.close));
    const curve = rebase100(cumulativeLogReturns(lr));
    return bars.slice(1).map((b, i) => ({ ts: b.ts, portfolio: curve[i] ?? 100 }));
  }, [symbols, barsMap]);

  const worstScenarioImpact = allImpacts.length > 0
    ? Math.min(...allImpacts.map(s => s.impact)) : undefined;

  // V4: regime + risk agent outputs for scenario context
  const scenarioAgentOutputs = useAgentOutputs({ placement: 'ScenarioStress', limit: 10 });
  const analogResult = useHistoricalAnalog({ lookback_years: 10, top_k: 3 });

  const { observations, acknowledge } = usePortfolioIntelligence(
    selectedPortfolio?.id,
    holdings.length > 0 ? { holdings, effectiveWeights, worstScenarioImpact } : null,
  );

  const handleCreate = async (data: ScenarioForm) => {
    if (!user || !currentWorkspace) return;
    const id = await saveCustomScenario(user.uid, currentWorkspace.id, data);
    setSelectedId(id);
  };

  const handleEdit = async (data: ScenarioForm) => {
    if (!editTarget) return;
    await updateCustomScenario(editTarget.id, data);
    setEditTarget(null);
  };

  const handleDelete = async (id: string) => {
    await deleteCustomScenario(id);
    if (selectedId === id) setSelectedId(STRESS_PRESETS[0].id);
  };

  if (loading || holdingsLoading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} /></div>;
  }

  if (!holdings.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', textAlign: 'center', padding: 24 }}>
        <Zap size={24} style={{ color: 'var(--muted-foreground)', marginBottom: 12, opacity: 0.4 }} />
        <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>No holdings for scenario analysis</p>
        <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0, maxWidth: 300 }}>Add holdings to stress-test against historical and custom scenarios.</p>
      </div>
    );
  }

  const regime = scenario?.regime ?? NORMAL_REGIME;

  return (
    <div style={{ padding: '0 0 40px' }}>
      <div style={{ padding: '16px 24px 14px', borderBottom: '1px solid var(--border)' }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '-0.02em' }}>Scenario & Stress View</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
          {selectedPortfolio?.name} · {STRESS_PRESETS.length} historical presets + {customScenarios.length} custom · Illustrative — not predictions
        </p>
      </div>

      <PortfolioIntelligencePanel observations={observations} onAcknowledge={acknowledge} />

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Scenario selector ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          <div>
            <p style={{ margin: '0 0 6px', fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Historical Presets ({STRESS_PRESETS.length})</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STRESS_PRESETS.map(s => (
                <button key={s.id} onClick={() => setSelectedId(s.id)} style={{
                  padding: '5px 11px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: s.id === selectedId ? 'var(--primary)' : 'var(--muted)',
                  color: s.id === selectedId ? 'var(--primary-foreground)' : 'var(--foreground)',
                  border: `1px solid ${s.id === selectedId ? 'var(--primary)' : 'var(--border)'}`,
                  cursor: 'pointer',
                }}>{s.label}</button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your Scenarios</p>
              <button onClick={() => setShowCreate(true)} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 5,
                fontSize: 10, fontWeight: 700, cursor: 'pointer',
                background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                color: 'var(--primary)',
                border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
              }}>
                <Plus size={10} /> New Scenario
              </button>
            </div>
            {customScenarios.length === 0 ? (
              <p style={{ fontSize: 11, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>None yet — create one above, or copy a preset as a template.</p>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {customScenarios.map(s => (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px 4px 11px', borderRadius: 6,
                    background: s.id === selectedId ? 'color-mix(in srgb, var(--chart-4) 15%, transparent)' : 'var(--muted)',
                    color: s.id === selectedId ? 'var(--chart-4)' : 'var(--foreground)',
                    border: `1px solid ${s.id === selectedId ? 'color-mix(in srgb, var(--chart-4) 35%, transparent)' : 'var(--border)'}`,
                    fontSize: 11, fontWeight: 600,
                  }}>
                    <span style={{ cursor: 'pointer' }} onClick={() => setSelectedId(s.id)}>{s.label}</span>
                    <button onClick={() => setEditTarget(s)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--muted-foreground)', display: 'flex' }}><Pencil size={10} /></button>
                    <button onClick={() => handleDelete(s.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--destructive)', display: 'flex' }}><Trash2 size={10} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Scenario summary ─────────────────────────────────────────────── */}
        {scenario && (
          <div style={{ padding: '12px 16px', background: 'color-mix(in srgb, var(--destructive) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--destructive) 18%, transparent)', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={13} style={{ color: 'var(--destructive)', flexShrink: 0 }} />
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{scenario.label}</p>
                  {scenario.period && <p style={{ margin: '1px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>{scenario.period}</p>}
                </div>
              </div>
              {scenario.source === 'custom' && (
                <button onClick={() => setEditTarget(scenario as CustomScenario)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--muted)', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
                  <Pencil size={10} /> Edit
                </button>
              )}
            </div>
            {scenario.description && <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.6 }}>{scenario.description}</p>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(Object.entries(scenario.shocks) as [ShockKey, number][])
                .filter(([k, v]) => k !== 'vix' && v !== 0)
                .map(([k, v]) => (
                  <span key={k} style={{
                    padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                    background: v < 0 ? 'color-mix(in srgb, var(--destructive) 12%, transparent)' : 'color-mix(in srgb, var(--chart-2) 12%, transparent)',
                    color: v < 0 ? 'var(--destructive)' : 'var(--chart-2)',
                    border: `1px solid ${v < 0 ? 'color-mix(in srgb, var(--destructive) 25%, transparent)' : 'color-mix(in srgb, var(--chart-2) 25%, transparent)'}`,
                  }}>
                    {(SHOCK_META[k]?.label ?? k).split(' ')[0].toUpperCase()} {fmtShock(v)}
                  </span>
                ))}
            </div>
            <RegimeBadges regime={regime} />
            <p style={{ margin: '8px 0 0', fontSize: 10, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
              ⚠ Shock proxies are illustrative. Not predictions. Actual impact depends on portfolio conditions at the time.
            </p>
          </div>
        )}

        {/* ── Impact headline ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ padding: '12px 20px', background: portfolioImpact < -0.15 ? 'color-mix(in srgb, var(--destructive) 10%, transparent)' : 'var(--muted)', border: `1px solid ${portfolioImpact < -0.15 ? 'color-mix(in srgb, var(--destructive) 30%, transparent)' : 'var(--border)'}`, borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estimated Portfolio Impact</p>
            <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 800, color: portfolioImpact < 0 ? 'var(--destructive)' : 'var(--chart-2)', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
              {fmtPct(portfolioImpact)}
            </p>
            {totalValue != null && (
              <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: portfolioImpact < 0 ? 'var(--destructive)' : 'var(--chart-2)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtUSD(portfolioImpact * totalValue)}
              </p>
            )}
            {regime.correlationStress > 0.3 && (
              <p style={{ margin: '4px 0 0', fontSize: 9, color: 'var(--chart-4)', fontStyle: 'italic' }}>
                Adjusted for {(regime.correlationStress * 100).toFixed(0)}% correlation stress
              </p>
            )}
            <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>
              Across {holdings.length} holdings · ~{regime.recoveryDays}d recovery est.
            </p>
          </div>
          {holdingImpacts[0] && (
            <div style={{ padding: '12px 20px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Most Impacted</p>
              <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 800, color: 'var(--destructive)', letterSpacing: '-0.02em' }}>{holdingImpacts[0].symbol}</p>
              <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>{fmtBoth(holdingImpacts[0].portContrib, totalValue)} contribution</p>
            </div>
          )}
          {regime.volMultiplier > 1.5 && (
            <div style={{ padding: '12px 20px', background: 'color-mix(in srgb, var(--chart-4) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--chart-4) 22%, transparent)', borderRadius: 8 }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: 'var(--chart-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Volatility Regime</p>
              <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 800, color: 'var(--chart-4)', letterSpacing: '-0.02em' }}>{regime.volMultiplier.toFixed(1)}× vol</p>
              <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>VIX proxy: {fmtShock(scenario?.shocks.vix ?? 1 - 1)}</p>
            </div>
          )}
        </div>

        {/* ── Charts ───────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>

          <SectionCard title="Per-Holding Impact" subtitle={`${scenario?.label} · sorted worst to best`} icon={<TrendingDown size={13} />}>
            <ResponsiveContainer width="100%" height={Math.max(100, holdingImpacts.length * 26)}>
              <BarChart data={holdingImpacts.map(h => ({ symbol: h.symbol, impact: h.portContrib * 100 }))} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} horizontal={false} />
                <XAxis type="number" tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="symbol" tick={{ fontSize: 10, fill: 'var(--foreground)', fontWeight: 600 }} tickLine={false} axisLine={false} width={50} />
                <ReferenceLine x={0} stroke="var(--border)" strokeDasharray="2 2" />
                <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, 'Portfolio Contribution']} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} />
                <Bar dataKey="impact" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {holdingImpacts.map(h => <Cell key={h.symbol} fill={h.portContrib < 0 ? 'var(--destructive)' : 'var(--chart-2)'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>

          <SectionCard title="Indicative Shock Path" subtitle="Stylised arc — not a forecast" icon={<Activity size={13} />}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={scenarioPath} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="scenGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} tickFormatter={v => `D${v}`} interval={9} />
                <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                <ReferenceLine y={100} stroke="var(--border)" strokeDasharray="3 3" />
                <Tooltip formatter={(v: number) => [v.toFixed(1), 'Portfolio']} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10 }} />
                <Area type="monotone" dataKey="portfolio" stroke="var(--destructive)" strokeWidth={2} fill="url(#scenGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            <p style={{ margin: '4px 0 0', fontSize: 9, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>Est. recovery: ~{regime.recoveryDays} trading days</p>
          </SectionCard>
        </div>

        {/* ── Cross-scenario comparison ─────────────────────────────────── */}
        <SectionCard title="Cross-Scenario Comparison" subtitle={`${allImpacts.length} scenarios — presets + custom (amber)`} icon={<TrendingDown size={13} />}>
          <ResponsiveContainer width="100%" height={Math.max(120, allImpacts.length * 32)}>
            <BarChart data={allImpacts.map(s => ({ scenario: s.scenario, impact: s.impact * 100, source: s.source }))} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} horizontal={false} />
              <XAxis type="number" tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="scenario" tick={{ fontSize: 10, fill: 'var(--foreground)' }} tickLine={false} axisLine={false} width={145} />
              <ReferenceLine x={0} stroke="var(--border)" />
              <Tooltip
                formatter={(v: number) => [
                  totalValue != null ? `${v.toFixed(2)}% / ${fmtUSD((v / 100) * totalValue)}` : `${v.toFixed(2)}%`,
                  'Portfolio Impact',
                ]}
                contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
              />
              <Bar dataKey="impact" radius={[0, 4, 4, 0]} maxBarSize={22}>
                {allImpacts.map(s => (
                  <Cell key={s.scenario} fill={
                    s.source === 'custom'
                      ? (s.impact < 0 ? 'var(--chart-4)' : 'var(--chart-2)')
                      : (s.impact < -0.2 ? 'var(--destructive)' : s.impact < -0.1 ? 'var(--chart-4)' : 'var(--chart-2)')
                  } />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* ── Recent context chart ─────────────────────────────────────── */}
        {analogData.length > 10 && (
          <SectionCard title="Recent Portfolio Price Context" subtitle="90D rebased to 100 — reference for scenario calibration" icon={<TrendingUp size={13} />}>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={analogData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="ctxGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
                <XAxis dataKey="ts" tickFormatter={fmtDate} tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(0)} />
                <Tooltip formatter={(v: number) => [v.toFixed(1), 'Portfolio']} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10 }} />
                <Area type="monotone" dataKey="portfolio" stroke="var(--primary)" strokeWidth={1.5} fill="url(#ctxGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </SectionCard>
        )}

        {/* ── Holding detail table ──────────────────────────────────────── */}
        {holdingImpacts.length > 0 && (
          <SectionCard title="Holding-Level Detail" subtitle={`${scenario?.label} · per position`} icon={<AlertCircle size={13} />}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Symbol', 'Class', 'Weight', ...(totalValue ? ['Exposure'] : []), 'Asset Shock', 'Portfolio Contribution', ...(totalValue ? ['Est. Impact ($)'] : [])].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdingImpacts.map((h, i) => {
                    const exposure = totalValue != null ? totalValue * h.weight : null;
                    const impactDollar = exposure != null ? exposure * h.shockFraction : null;
                    return (
                      <tr key={h.symbol} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--muted) 25%, transparent)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700 }}>{h.symbol}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, background: 'var(--muted)', border: '1px solid var(--border)' }}>{h.assetClass}</span>
                        </td>
                        <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums', color: 'var(--muted-foreground)' }}>{(h.weight * 100).toFixed(1)}%</td>
                        {totalValue != null && (
                          <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                            {exposure != null ? (exposure >= 1000 ? `$${(exposure / 1000).toFixed(1)}K` : `$${exposure.toFixed(0)}`) : '—'}
                          </td>
                        )}
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: h.shockFraction < 0 ? 'var(--destructive)' : 'var(--chart-2)', fontVariantNumeric: 'tabular-nums' }}>{fmtShock(h.shockFraction)}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: h.portContrib < 0 ? 'var(--destructive)' : 'var(--chart-2)', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(h.portContrib)}</td>
                        {totalValue != null && (
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: (impactDollar ?? 0) < 0 ? 'var(--destructive)' : 'var(--chart-2)', fontVariantNumeric: 'tabular-nums' }}>
                            {impactDollar != null ? fmtUSD(impactDollar) : '—'}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--muted)' }}>
                    <td colSpan={totalValue ? 5 : 4} style={{ padding: '8px 10px', fontWeight: 800 }}>TOTAL PORTFOLIO IMPACT</td>
                    <td style={{ padding: '8px 10px', fontWeight: 800, color: portfolioImpact < 0 ? 'var(--destructive)' : 'var(--chart-2)', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(portfolioImpact)}</td>
                    {totalValue != null && (
                      <td style={{ padding: '8px 10px', fontWeight: 800, color: portfolioImpact < 0 ? 'var(--destructive)' : 'var(--chart-2)', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(portfolioImpact * totalValue)}</td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}
      </div>

      {/* ── V4: Regime & Risk Intelligence ─────────────────────────────────── */}
      <div style={{ padding: '0 24px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <h4 style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted-foreground)' }}>
            Regime & Risk Intelligence
          </h4>
          <AgentIntelligenceFeed
            outputs={scenarioAgentOutputs.data}
            loading={scenarioAgentOutputs.loading}
            analyzing={scenarioAgentOutputs.loading}
            title="Regime & Risk Agents"
            showFilters={false}
            compact
            maxItems={6}
          />
        </div>
        <div>
          <h4 style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted-foreground)' }}>
            Historical Macro Analogs
          </h4>
          <MacroAnalogPanel result={analogResult.data} loading={analogResult.loading} compact />
        </div>
      </div>

      {showCreate && <ScenarioModal title="New Scenario" onSave={handleCreate} onClose={() => setShowCreate(false)} />}
      {editTarget && (
        <ScenarioModal
          title={`Edit: ${editTarget.label}`}
          initial={{ label: editTarget.label, period: editTarget.period, description: editTarget.description, shocks: { ...BLANK_SHOCKS(), ...editTarget.shocks }, regime: { ...BLANK_REGIME(), ...editTarget.regime } }}
          onSave={handleEdit}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
};

