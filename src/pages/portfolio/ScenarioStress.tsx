import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine, AreaChart, Area,
} from 'recharts';
import {
  Zap, Loader2, AlertCircle, TrendingDown, TrendingUp, Activity,
  Plus, Pencil, Trash2, Copy, X, Check,
} from 'lucide-react';
import { useAuth } from '../../components/AuthProvider';
import { useWorkspace } from '../../components/WorkspaceContext';
import { usePortfolioWorkspace } from '../../hooks/usePortfolioWorkspace';
import { usePortfolioIntelligence } from '../../hooks/usePortfolioIntelligence';
import { fetchOHLCV } from '../../services/marketService';
import { logReturns, cumulativeLogReturns, rebase100 } from '../../lib/quant/returns';
import { STRESS_PRESETS, fmtShock, type StressScenario } from '../../lib/stressScenarios';
import {
  saveCustomScenario, updateCustomScenario, deleteCustomScenario,
  subscribeToCustomScenarios, type CustomScenario,
} from '../../services/portfolioService';
import { fmtPct, fmtUSD, fmtBoth } from '../../lib/portfolio/fmt';
import { PortfolioIntelligencePanel } from '../../components/portfolio/PortfolioIntelligencePanel';
import type { OHLCVBar } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type ShockKey = 'equity' | 'bonds' | 'gold' | 'oil' | 'crypto';
const SHOCK_LABELS: Record<ShockKey, string> = {
  equity: 'Equities',
  bonds:  'Bonds (long duration)',
  gold:   'Gold',
  oil:    'Oil / Commodities',
  crypto: 'Crypto',
};

function resolveShockKey(assetClass: string): ShockKey {
  switch (assetClass) {
    case 'bond':      return 'bonds';
    case 'commodity': return 'oil';
    case 'crypto':    return 'crypto';
    default:          return 'equity';
  }
}

// ─── Unified scenario type (preset or custom) ─────────────────────────────────

type AnyScenario = (StressScenario & { source: 'preset' }) | (CustomScenario & { source: 'custom' });

// ─── Shock slider input ───────────────────────────────────────────────────────

const ShockInput: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
}> = ({ label, value, onChange }) => {
  const pct = Math.round(value * 100);
  const color = value < 0 ? 'var(--destructive)' : value > 0 ? 'var(--chart-2)' : 'var(--muted-foreground)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)' }}>{label}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="number"
            min={-100} max={100} step={1}
            value={pct}
            onChange={e => onChange(parseFloat(e.target.value || '0') / 100)}
            style={{
              width: 60, padding: '2px 6px', borderRadius: 4, fontSize: 12, fontWeight: 700,
              border: '1px solid var(--border)', background: 'var(--background)',
              color, textAlign: 'right', outline: 'none', fontVariantNumeric: 'tabular-nums',
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>%</span>
        </div>
      </div>
      <input
        type="range"
        min={-100} max={100} step={1}
        value={pct}
        onChange={e => onChange(parseInt(e.target.value) / 100)}
        style={{ width: '100%', accentColor: value < 0 ? 'var(--destructive)' : 'var(--primary)', cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--muted-foreground)' }}>
        <span>−100%</span><span>0</span><span>+100%</span>
      </div>
    </div>
  );
};

// ─── Create / Edit scenario modal ────────────────────────────────────────────

interface ScenarioFormData {
  label: string;
  period: string;
  description: string;
  shocks: Record<ShockKey, number>;
}

const BLANK_FORM: ScenarioFormData = {
  label: '', period: '', description: '',
  shocks: { equity: 0, bonds: 0, gold: 0, oil: 0, crypto: 0 },
};

const ScenarioModal: React.FC<{
  initial?: ScenarioFormData;
  presets: StressScenario[];
  title: string;
  onSave: (data: ScenarioFormData) => Promise<void>;
  onClose: () => void;
}> = ({ initial, presets, title, onSave, onClose }) => {
  const [form, setForm] = useState<ScenarioFormData>(initial ?? BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [template, setTemplate] = useState('');

  const applyTemplate = (presetId: string) => {
    const p = presets.find(x => x.id === presetId);
    if (!p) return;
    setForm(prev => ({
      ...prev,
      label: prev.label || p.label,
      period: prev.period || p.period,
      description: prev.description || p.description,
      shocks: { ...p.shocks },
    }));
    setTemplate('');
  };

  const setShock = (key: ShockKey, v: number) =>
    setForm(prev => ({ ...prev, shocks: { ...prev.shocks, [key]: v } }));

  const handleSave = async () => {
    if (!form.label.trim()) return;
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch { setSaving(false); }
  };

  const canSave = form.label.trim().length > 0;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: 480, maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</p>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted-foreground)', display: 'flex' }}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Template picker */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Start from preset template (optional)
            </label>
            <select
              value={template}
              onChange={e => { setTemplate(e.target.value); applyTemplate(e.target.value); }}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', cursor: 'pointer' }}
            >
              <option value="">— Build from scratch —</option>
              {presets.map(p => <option key={p.id} value={p.id}>{p.label} ({p.period})</option>)}
            </select>
          </div>

          {/* Name */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Scenario Name *
            </label>
            <input
              autoFocus
              value={form.label}
              onChange={e => setForm(prev => ({ ...prev, label: e.target.value }))}
              placeholder="e.g. AI Bubble Burst, Emerging Market Crisis, Stagflation..."
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, fontSize: 13, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', outline: 'none' }}
            />
          </div>

          {/* Period / Context */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Period / Context (optional)
            </label>
            <input
              value={form.period}
              onChange={e => setForm(prev => ({ ...prev, period: e.target.value }))}
              placeholder="e.g. Q3 2026, My bear case, Tech correction..."
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', outline: 'none' }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Description (optional)
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe the macro thesis, trigger, or rationale for this scenario..."
              rows={2}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* Shock sliders */}
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Asset Class Shocks
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 14px', background: 'var(--muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
              {(Object.keys(SHOCK_LABELS) as ShockKey[]).map(key => (
                <ShockInput
                  key={key}
                  label={SHOCK_LABELS[key]}
                  value={form.shocks[key]}
                  onChange={v => setShock(key, v)}
                />
              ))}
            </div>
          </div>

          {/* Preview of shock magnitudes */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(Object.entries(form.shocks) as [ShockKey, number][]).filter(([, v]) => v !== 0).map(([k, v]) => (
              <span
                key={k}
                style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                  background: v < 0 ? 'color-mix(in srgb, var(--destructive) 12%, transparent)' : 'color-mix(in srgb, var(--chart-2) 12%, transparent)',
                  color: v < 0 ? 'var(--destructive)' : 'var(--chart-2)',
                  border: `1px solid ${v < 0 ? 'color-mix(in srgb, var(--destructive) 25%, transparent)' : 'color-mix(in srgb, var(--chart-2) 25%, transparent)'}`,
                }}
              >
                {SHOCK_LABELS[k].split(' ')[0]} {fmtShock(v)}
              </span>
            ))}
            {Object.values(form.shocks).every(v => v === 0) && (
              <span style={{ fontSize: 10, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>No shocks set yet — adjust sliders above</span>
            )}
          </div>

          {/* Save */}
          <button
            disabled={!canSave || saving}
            onClick={handleSave}
            style={{
              padding: '10px 16px', borderRadius: 7, fontSize: 13, fontWeight: 700,
              background: canSave ? 'var(--primary)' : 'var(--muted)',
              color: canSave ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
              border: 'none', cursor: canSave ? 'pointer' : 'not-allowed',
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

// ─── Section Card ─────────────────────────────────────────────────────────────

const SectionCard: React.FC<{
  title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties;
}> = ({ title, subtitle, icon, children, style }) => (
  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', ...style }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '12px 16px 10px', borderBottom: '1px solid var(--border)' }}>
      {icon && <div style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }}>{icon}</div>}
      <div>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>{title}</p>
        {subtitle && <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>{subtitle}</p>}
      </div>
    </div>
    <div style={{ padding: '14px 16px' }}>{children}</div>
  </div>
);

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
  const [fetching, setFetching] = useState(false);

  // Subscribe to user's custom scenarios
  useEffect(() => {
    if (!user || !currentWorkspace) return;
    return subscribeToCustomScenarios(user.uid, currentWorkspace.id, setCustomScenarios);
  }, [user, currentWorkspace]);

  const symbols = useMemo(() => holdings.map(h => h.symbol), [holdings]);

  useEffect(() => {
    if (symbols.length === 0) { setBarsMap({}); return; }
    setFetching(true);
    Promise.allSettled(symbols.map(s => fetchOHLCV(s, '1day', 90))).then(results => {
      const m: Record<string, OHLCVBar[]> = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.bars.length >= 5) m[symbols[i]] = r.value.bars;
      });
      setBarsMap(m);
      setFetching(false);
    });
  }, [symbols.join(',')]);

  // Merge presets + custom into one list
  const allScenarios: AnyScenario[] = useMemo(() => [
    ...STRESS_PRESETS.map(p => ({ ...p, source: 'preset' as const })),
    ...customScenarios.map(c => ({ ...c, source: 'custom' as const })),
  ], [customScenarios]);

  // Make sure selected ID is valid
  useEffect(() => {
    if (!allScenarios.find(s => s.id === selectedId)) {
      setSelectedId(allScenarios[0]?.id ?? STRESS_PRESETS[0].id);
    }
  }, [allScenarios, selectedId]);

  const scenario = allScenarios.find(s => s.id === selectedId) ?? allScenarios[0];

  // ── Per-holding scenario impact ──────────────────────────────────────────
  const holdingImpacts = useMemo(() => {
    if (!scenario) return [];
    return holdings.map(h => {
      const shockKey = resolveShockKey(h.assetClass);
      const shockFraction = scenario.shocks[shockKey] ?? scenario.shocks.equity;
      const w = effectiveWeights[h.symbol] ?? 0;
      const portContrib = shockFraction * w;
      const bars = barsMap[h.symbol];
      const currentPrice = bars?.[bars.length - 1]?.close ?? null;
      const shockedPrice = currentPrice !== null ? currentPrice * (1 + shockFraction) : null;
      return { symbol: h.symbol, name: h.name, assetClass: h.assetClass, weight: w, shockFraction, portContrib, currentPrice, shockedPrice };
    }).sort((a, b) => a.portContrib - b.portContrib);
  }, [holdings, effectiveWeights, scenario, barsMap]);

  const portfolioImpact = useMemo(() =>
    holdingImpacts.reduce((s, h) => s + h.portContrib, 0), [holdingImpacts]);

  // ── Indicative shock path ─────────────────────────────────────────────────
  const scenarioPath = useMemo(() => {
    const points = 60;
    const shockPerStep = portfolioImpact / 10;
    const recovery = -portfolioImpact / 50;
    const path: Array<{ day: number; portfolio: number; baseline: number }> = [];
    let cum = 0;
    for (let i = 0; i <= points; i++) {
      const shock = i <= 10 ? shockPerStep : (i <= 40 ? recovery : 0);
      cum += shock;
      path.push({ day: i, portfolio: 100 + cum * 100, baseline: 100 });
    }
    return path;
  }, [portfolioImpact]);

  // ── Cross-scenario comparison ─────────────────────────────────────────────
  const allScenarioImpacts = useMemo(() =>
    allScenarios.map(s => ({
      scenario: s.label,
      id: s.id,
      impact: holdings.reduce((sum, h) => {
        const shockKey = resolveShockKey(h.assetClass);
        const shock = s.shocks[shockKey] ?? s.shocks.equity;
        return sum + shock * (effectiveWeights[h.symbol] ?? 0);
      }, 0),
      source: s.source,
    })).sort((a, b) => a.impact - b.impact),
    [allScenarios, holdings, effectiveWeights]);

  // ── Historical context ────────────────────────────────────────────────────
  const analogData = useMemo(() => {
    const validSymbols = symbols.filter(s => barsMap[s] && barsMap[s].length >= 30);
    if (validSymbols.length === 0) return [];
    const refBars = barsMap[validSymbols[0]];
    const closes = refBars.map(b => b.close);
    const lr = logReturns(closes);
    const curve = rebase100(cumulativeLogReturns(lr));
    return refBars.slice(1).map((b, i) => ({ ts: b.ts, portfolio: curve[i] ?? 100 }));
  }, [symbols, barsMap]);

  const worstScenarioImpact = allScenarioImpacts.length > 0
    ? Math.min(...allScenarioImpacts.map(s => s.impact))
    : undefined;

  const { observations, acknowledge } = usePortfolioIntelligence(
    selectedPortfolio?.id,
    holdings.length > 0 ? { holdings, effectiveWeights, worstScenarioImpact } : null,
  );

  // ── CRUD handlers ─────────────────────────────────────────────────────────
  const handleCreate = async (data: ScenarioFormData) => {
    if (!user || !currentWorkspace) return;
    const id = await saveCustomScenario(user.uid, currentWorkspace.id, data);
    setSelectedId(id);
  };

  const handleEdit = async (data: ScenarioFormData) => {
    if (!editTarget) return;
    await updateCustomScenario(editTarget.id, data);
  };

  const handleDelete = async (id: string) => {
    await deleteCustomScenario(id);
    if (selectedId === id) setSelectedId(STRESS_PRESETS[0].id);
  };

  if (loading || holdingsLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', textAlign: 'center', padding: 24 }}>
        <Zap size={24} style={{ color: 'var(--muted-foreground)', marginBottom: 12, opacity: 0.4 }} />
        <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>No holdings for scenario analysis</p>
        <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: 0, maxWidth: 300 }}>Add holdings to stress-test against historical and custom scenarios.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px 14px', borderBottom: '1px solid var(--border)' }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '-0.02em' }}>Scenario & Stress View</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--muted-foreground)' }}>
          {selectedPortfolio?.name} · Historical presets + your own scenarios · Not predictions
        </p>
      </div>

      <PortfolioIntelligencePanel observations={observations} onAcknowledge={acknowledge} />

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Scenario selector ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Presets */}
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Historical Presets</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STRESS_PRESETS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  style={{
                    padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    background: s.id === selectedId ? 'var(--primary)' : 'var(--muted)',
                    color: s.id === selectedId ? 'var(--primary-foreground)' : 'var(--foreground)',
                    border: `1px solid ${s.id === selectedId ? 'var(--primary)' : 'var(--border)'}`,
                    cursor: 'pointer',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom scenarios */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your Scenarios</p>
              <button
                onClick={() => setShowCreate(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 5,
                  fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
                  color: 'var(--primary)',
                  border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
                }}
              >
                <Plus size={10} /> New Scenario
              </button>
            </div>

            {customScenarios.length === 0 ? (
              <p style={{ fontSize: 11, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
                No custom scenarios yet — create one above or use a preset as a template.
              </p>
            ) : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {customScenarios.map(s => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '4px 8px 4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: s.id === selectedId ? 'color-mix(in srgb, var(--chart-4) 15%, transparent)' : 'var(--muted)',
                      color: s.id === selectedId ? 'var(--chart-4)' : 'var(--foreground)',
                      border: `1px solid ${s.id === selectedId ? 'color-mix(in srgb, var(--chart-4) 35%, transparent)' : 'var(--border)'}`,
                    }}
                  >
                    <span style={{ cursor: 'pointer' }} onClick={() => setSelectedId(s.id)}>{s.label}</span>
                    <button
                      onClick={() => { setEditTarget(s); }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--muted-foreground)', display: 'flex' }}
                      title="Edit"
                    >
                      <Pencil size={10} />
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--destructive)', display: 'flex' }}
                      title="Delete"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Scenario summary ──────────────────────────────────────────── */}
        {scenario && (
          <div style={{
            padding: '12px 16px',
            background: 'color-mix(in srgb, var(--destructive) 6%, transparent)',
            border: '1px solid color-mix(in srgb, var(--destructive) 18%, transparent)',
            borderRadius: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={13} style={{ color: 'var(--destructive)', flexShrink: 0 }} />
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{scenario.label}</p>
                  {scenario.period && <p style={{ margin: '1px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>{scenario.period}</p>}
                </div>
              </div>
              {scenario.source === 'custom' && (
                <button
                  onClick={() => setEditTarget(scenario as CustomScenario)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--muted)', color: 'var(--muted-foreground)', cursor: 'pointer' }}
                >
                  <Pencil size={10} /> Edit
                </button>
              )}
            </div>
            {scenario.description && <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.6 }}>{scenario.description}</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(Object.entries(scenario.shocks) as [ShockKey, number][]).filter(([, v]) => v !== 0).map(([key, v]) => (
                <div key={key} style={{
                  padding: '3px 9px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                  background: v < 0 ? 'color-mix(in srgb, var(--destructive) 12%, transparent)' : 'color-mix(in srgb, var(--chart-2) 12%, transparent)',
                  border: `1px solid ${v < 0 ? 'color-mix(in srgb, var(--destructive) 25%, transparent)' : 'color-mix(in srgb, var(--chart-2) 25%, transparent)'}`,
                  color: v < 0 ? 'var(--destructive)' : 'var(--chart-2)',
                }}>
                  {SHOCK_LABELS[key].split(' ')[0].toUpperCase()} {fmtShock(v)}
                </div>
              ))}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 10, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
              ⚠ Shock proxies are illustrative. Not predictions. Actual impact depends on portfolio conditions at the time.
            </p>
          </div>
        )}

        {/* ── Portfolio impact headline ─────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{
            padding: '12px 20px',
            background: portfolioImpact < -0.15 ? 'color-mix(in srgb, var(--destructive) 10%, transparent)' : 'var(--muted)',
            border: `1px solid ${portfolioImpact < -0.15 ? 'color-mix(in srgb, var(--destructive) 30%, transparent)' : 'var(--border)'}`,
            borderRadius: 8,
          }}>
            <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estimated Portfolio Impact</p>
            <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 800, color: portfolioImpact < 0 ? 'var(--destructive)' : 'var(--chart-2)', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
              {fmtPct(portfolioImpact)}
            </p>
            {totalValue != null && (
              <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: portfolioImpact < 0 ? 'var(--destructive)' : 'var(--chart-2)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtUSD(portfolioImpact * totalValue)}
              </p>
            )}
            <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>
              Weighted shock across {holdings.length} holdings
            </p>
          </div>
          {holdingImpacts[0] && (
            <div style={{ padding: '12px 20px', background: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Most Impacted</p>
              <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 800, color: 'var(--destructive)', letterSpacing: '-0.02em' }}>
                {holdingImpacts[0].symbol}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>
                {fmtBoth(holdingImpacts[0].portContrib, totalValue)} contribution
              </p>
            </div>
          )}
        </div>

        {/* ── Row: impact bars + path ───────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>

          <SectionCard title="Per-Holding Impact" subtitle={`${scenario?.label} — sorted by portfolio contribution`} icon={<TrendingDown size={13} />}>
            <ResponsiveContainer width="100%" height={Math.max(100, holdingImpacts.length * 26)}>
              <BarChart
                data={holdingImpacts.map(h => ({ symbol: h.symbol, impact: h.portContrib * 100 }))}
                layout="vertical"
                margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} horizontal={false} />
                <XAxis type="number" tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="symbol" tick={{ fontSize: 10, fill: 'var(--foreground)', fontWeight: 600 }} tickLine={false} axisLine={false} width={50} />
                <ReferenceLine x={0} stroke="var(--border)" strokeDasharray="2 2" />
                <Tooltip
                  formatter={(v: number) => [`${v.toFixed(2)}%`, 'Portfolio Contribution']}
                  contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
                />
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
                <Tooltip
                  formatter={(v: number) => [v.toFixed(1), 'Portfolio']}
                  contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10 }}
                />
                <Area type="monotone" dataKey="portfolio" stroke="var(--destructive)" strokeWidth={2} fill="url(#scenGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </SectionCard>
        </div>

        {/* ── Cross-scenario comparison ─────────────────────────────────── */}
        <SectionCard
          title="Cross-Scenario Comparison"
          subtitle={`All ${allScenarioImpacts.length} scenarios — presets + your custom scenarios`}
          icon={<TrendingDown size={13} />}
        >
          <ResponsiveContainer width="100%" height={Math.max(100, allScenarioImpacts.length * 32)}>
            <BarChart
              data={allScenarioImpacts.map(s => ({ scenario: s.scenario, impact: s.impact * 100, source: s.source }))}
              layout="vertical"
              margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" strokeOpacity={0.4} horizontal={false} />
              <XAxis type="number" tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="scenario" tick={{ fontSize: 10, fill: 'var(--foreground)' }} tickLine={false} axisLine={false} width={140} />
              <ReferenceLine x={0} stroke="var(--border)" />
              <Tooltip
                formatter={(v: number, _, props) => [
                  totalValue != null ? `${v.toFixed(2)}% / ${fmtUSD((v / 100) * totalValue)}` : `${v.toFixed(2)}%`,
                  'Portfolio Impact',
                ]}
                contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
              />
              <Bar dataKey="impact" radius={[0, 4, 4, 0]} maxBarSize={22}>
                {allScenarioImpacts.map(s => (
                  <Cell
                    key={s.scenario}
                    fill={
                      s.source === 'custom'
                        ? (s.impact < 0 ? 'var(--chart-4)' : 'var(--chart-2)')
                        : (s.impact < -0.2 ? 'var(--destructive)' : s.impact < -0.1 ? 'var(--chart-4)' : 'var(--chart-2)')
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p style={{ margin: '8px 0 0', fontSize: 10, color: 'var(--muted-foreground)' }}>
            Amber bars = your custom scenarios · Red/grey = historical presets
          </p>
        </SectionCard>

        {/* ── Historical context ────────────────────────────────────────── */}
        {analogData.length > 10 && (
          <SectionCard title="Recent Portfolio Price Context" subtitle="Rebased to 100 from available history" icon={<TrendingUp size={13} />}>
            <ResponsiveContainer width="100%" height={130}>
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
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--foreground)' }}>{h.symbol}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, background: 'var(--muted)', border: '1px solid var(--border)' }}>{h.assetClass}</span>
                        </td>
                        <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums', color: 'var(--muted-foreground)' }}>{(h.weight * 100).toFixed(1)}%</td>
                        {totalValue != null && (
                          <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums', color: 'var(--foreground)', fontWeight: 600 }}>
                            {exposure != null ? (exposure >= 1000 ? `$${(exposure / 1000).toFixed(1)}K` : `$${exposure.toFixed(0)}`) : '—'}
                          </td>
                        )}
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: h.shockFraction < 0 ? 'var(--destructive)' : 'var(--chart-2)', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtShock(h.shockFraction)}
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: h.portContrib < 0 ? 'var(--destructive)' : 'var(--chart-2)', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtPct(h.portContrib)}
                        </td>
                        {totalValue != null && (
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: (impactDollar ?? 0) < 0 ? 'var(--destructive)' : 'var(--chart-2)', fontVariantNumeric: 'tabular-nums' }}>
                            {impactDollar != null ? fmtUSD(impactDollar) : '—'}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--muted)' }}>
                    <td colSpan={totalValue ? 5 : 4} style={{ padding: '8px 10px', fontWeight: 800, color: 'var(--foreground)' }}>TOTAL PORTFOLIO IMPACT</td>
                    <td style={{ padding: '8px 10px', fontWeight: 800, color: portfolioImpact < 0 ? 'var(--destructive)' : 'var(--chart-2)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtPct(portfolioImpact)}
                    </td>
                    {totalValue != null && (
                      <td style={{ padding: '8px 10px', fontWeight: 800, color: portfolioImpact < 0 ? 'var(--destructive)' : 'var(--chart-2)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtUSD(portfolioImpact * totalValue)}
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <ScenarioModal
          title="New Scenario"
          presets={STRESS_PRESETS}
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Edit modal */}
      {editTarget && (
        <ScenarioModal
          title={`Edit: ${editTarget.label}`}
          presets={STRESS_PRESETS}
          initial={{
            label: editTarget.label,
            period: editTarget.period,
            description: editTarget.description,
            shocks: { ...editTarget.shocks },
          }}
          onSave={handleEdit}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
};
