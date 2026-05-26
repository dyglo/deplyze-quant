/**
 * useBacktest — agentic state machine for the Backtesting workspace.
 *
 * Four-step trace: resolve → prepare → run → commentary.
 * Mirrors the useHistoricalResearch pattern exactly:
 *   resolve   — NLP intent → StrategySpec via gateway /backtest/resolve
 *   prepare   — trigger per-instrument parquet build via /backtest/prepare-instrument
 *   run       — submit spec to /backtest/run and receive BacktestResults
 *   commentary — generate institutional narrative via /backtest/commentary
 */

import { useCallback, useRef, useState } from 'react';
import {
  resolveIntent,
  prepareInstrument,
  runBacktest,
  requestCommentary,
  type StrategySpec,
  type BacktestResults,
} from '../services/backtest';

// ─── Public types ──────────────────────────────────────────────────────────────

export type BacktestStepId = 'resolve' | 'prepare' | 'run' | 'commentary';
export type BacktestStepState = 'pending' | 'active' | 'done' | 'failed';

export interface BacktestStep {
  id: BacktestStepId;
  label: string;
  state: BacktestStepState;
  startedAt?: number;
  endedAt?: number;
  detail?: string;
  error?: string;
}

export interface BacktestState {
  steps: BacktestStep[];
  resolvedSpec: StrategySpec | null;
  results: BacktestResults | null;
  narrative: string | null;
  error: string | null;
  isRunning: boolean;
}

const INITIAL_STEPS: BacktestStep[] = [
  { id: 'resolve',   label: 'Resolving strategy intent',     state: 'pending' },
  { id: 'prepare',   label: 'Preparing instrument data',      state: 'pending' },
  { id: 'run',       label: 'Running backtest',               state: 'pending' },
  { id: 'commentary', label: 'Generating commentary',         state: 'pending' },
];

const INITIAL_STATE: BacktestState = {
  steps: INITIAL_STEPS,
  resolvedSpec: null,
  results: null,
  narrative: null,
  error: null,
  isRunning: false,
};

export function useBacktest() {
  const [state, setState] = useState<BacktestState>(INITIAL_STATE);
  const abortRef = useRef(false);

  const setStep = (
    id: BacktestStepId,
    patch: Partial<Omit<BacktestStep, 'id'>>,
  ) =>
    setState((s) => ({
      ...s,
      steps: s.steps.map((step) =>
        step.id === id ? { ...step, ...patch } : step,
      ),
    }));

  const reset = useCallback(() => {
    abortRef.current = true;
    setState(INITIAL_STATE);
    setTimeout(() => { abortRef.current = false; }, 0);
  }, []);

  /**
   * Run a backtest from a natural-language query string.
   * Follows the 4-step trace: resolve → prepare → run → commentary.
   */
  const runFromQuery = useCallback(async (query: string) => {
    abortRef.current = false;
    setState({ ...INITIAL_STATE, isRunning: true });

    // ── Step 1: resolve ─────────────────────────────────────────────────────
    setStep('resolve', { state: 'active', startedAt: Date.now() });
    let resolvedSpec: StrategySpec;
    try {
      const { spec } = await resolveIntent(query);
      resolvedSpec = spec;
      if (abortRef.current) return;
      setStep('resolve', {
        state: 'done',
        endedAt: Date.now(),
        detail: `${spec.name} · ${spec.instrument ?? 'SPY'}`,
      });
      setState((s) => ({ ...s, resolvedSpec: spec }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStep('resolve', { state: 'failed', error: msg, endedAt: Date.now() });
      setState((s) => ({ ...s, error: msg, isRunning: false }));
      return;
    }

    // ── Step 2: prepare ─────────────────────────────────────────────────────
    const instrument = resolvedSpec.instrument ?? 'SPY';
    setStep('prepare', { state: 'active', startedAt: Date.now(), detail: instrument });
    try {
      const prep = await prepareInstrument(instrument);
      if (abortRef.current) return;
      setStep('prepare', {
        state: 'done',
        endedAt: Date.now(),
        detail: prep.rows ? `${prep.rows.toLocaleString()} bars` : instrument,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStep('prepare', { state: 'failed', error: msg, endedAt: Date.now() });
      setState((s) => ({ ...s, error: msg, isRunning: false }));
      return;
    }

    // ── Step 3: run ─────────────────────────────────────────────────────────
    setStep('run', { state: 'active', startedAt: Date.now() });
    let results: BacktestResults;
    try {
      results = await runBacktest(resolvedSpec);
      if (abortRef.current) return;
      setStep('run', {
        state: 'done',
        endedAt: Date.now(),
        detail: `${results.bars.toLocaleString()} bars · Sharpe ${results.aggregate_metrics.sharpe_ratio.toFixed(2)}`,
      });
      setState((s) => ({ ...s, results }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStep('run', { state: 'failed', error: msg, endedAt: Date.now() });
      setState((s) => ({ ...s, error: msg, isRunning: false }));
      return;
    }

    // ── Step 4: commentary ──────────────────────────────────────────────────
    setStep('commentary', { state: 'active', startedAt: Date.now() });
    try {
      const m = results.aggregate_metrics;
      const { narrative } = await requestCommentary({
        query,
        context: `Strategy: ${resolvedSpec.name}. Instrument: ${instrument}. Period: ${resolvedSpec.date_range.start_date} to ${resolvedSpec.date_range.end_date}.`,
        metrics: {
          'Sharpe Ratio': m.sharpe_ratio.toFixed(3),
          'Deflated Sharpe': m.deflated_sharpe_ratio.toFixed(3),
          'Probabilistic Sharpe': m.probabilistic_sharpe_ratio.toFixed(3),
          'CAGR': `${(m.cagr * 100).toFixed(2)}%`,
          'Max Drawdown': `${(m.max_drawdown * 100).toFixed(2)}%`,
          'Win Rate': `${(m.win_rate * 100).toFixed(1)}%`,
          'Total Trades': m.total_trades,
          'Avg Trade Duration': `${m.avg_trade_duration_days.toFixed(1)} days`,
          'Annual Volatility': `${(m.annual_volatility * 100).toFixed(2)}%`,
          'Calmar Ratio': m.calmar_ratio.toFixed(3),
          'Sortino Ratio': m.sortino_ratio.toFixed(3),
        },
      });
      if (abortRef.current) return;
      setStep('commentary', { state: 'done', endedAt: Date.now() });
      setState((s) => ({ ...s, narrative, isRunning: false }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStep('commentary', { state: 'failed', error: msg, endedAt: Date.now() });
      setState((s) => ({ ...s, error: msg, isRunning: false }));
    }
  }, []);

  /**
   * Run a backtest from a pre-built StrategySpec (Composer / Advanced mode).
   * Skips the resolve step; still prepares the instrument and runs commentary.
   */
  const runFromSpec = useCallback(async (spec: StrategySpec, query?: string) => {
    abortRef.current = false;
    setState({ ...INITIAL_STATE, resolvedSpec: spec, isRunning: true });

    // Mark resolve as done (user-supplied spec).
    setStep('resolve', { state: 'done', startedAt: Date.now(), endedAt: Date.now(), detail: 'User-supplied spec' });

    // ── Step 2: prepare ─────────────────────────────────────────────────────
    const instrument = spec.instrument ?? 'SPY';
    setStep('prepare', { state: 'active', startedAt: Date.now(), detail: instrument });
    try {
      const prep = await prepareInstrument(instrument);
      if (abortRef.current) return;
      setStep('prepare', {
        state: 'done',
        endedAt: Date.now(),
        detail: prep.rows ? `${prep.rows.toLocaleString()} bars` : instrument,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStep('prepare', { state: 'failed', error: msg, endedAt: Date.now() });
      setState((s) => ({ ...s, error: msg, isRunning: false }));
      return;
    }

    // ── Step 3: run ─────────────────────────────────────────────────────────
    setStep('run', { state: 'active', startedAt: Date.now() });
    let results: BacktestResults;
    try {
      results = await runBacktest(spec);
      if (abortRef.current) return;
      setStep('run', {
        state: 'done',
        endedAt: Date.now(),
        detail: `${results.bars.toLocaleString()} bars · Sharpe ${results.aggregate_metrics.sharpe_ratio.toFixed(2)}`,
      });
      setState((s) => ({ ...s, results }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStep('run', { state: 'failed', error: msg, endedAt: Date.now() });
      setState((s) => ({ ...s, error: msg, isRunning: false }));
      return;
    }

    // ── Step 4: commentary ──────────────────────────────────────────────────
    setStep('commentary', { state: 'active', startedAt: Date.now() });
    try {
      const m = results.aggregate_metrics;
      const { narrative } = await requestCommentary({
        query: query ?? spec.name,
        context: `Strategy: ${spec.name}. Instrument: ${instrument}. Period: ${spec.date_range.start_date} to ${spec.date_range.end_date}.`,
        metrics: {
          'Sharpe Ratio': m.sharpe_ratio.toFixed(3),
          'Deflated Sharpe': m.deflated_sharpe_ratio.toFixed(3),
          'Probabilistic Sharpe': m.probabilistic_sharpe_ratio.toFixed(3),
          'CAGR': `${(m.cagr * 100).toFixed(2)}%`,
          'Max Drawdown': `${(m.max_drawdown * 100).toFixed(2)}%`,
          'Win Rate': `${(m.win_rate * 100).toFixed(1)}%`,
          'Total Trades': m.total_trades,
          'Annual Volatility': `${(m.annual_volatility * 100).toFixed(2)}%`,
        },
      });
      if (abortRef.current) return;
      setStep('commentary', { state: 'done', endedAt: Date.now() });
      setState((s) => ({ ...s, narrative, isRunning: false }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStep('commentary', { state: 'failed', error: msg, endedAt: Date.now() });
      setState((s) => ({ ...s, error: msg, isRunning: false }));
    }
  }, []);

  return { state, runFromQuery, runFromSpec, reset };
}
