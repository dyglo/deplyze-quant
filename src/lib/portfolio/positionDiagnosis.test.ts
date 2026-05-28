import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diagnosePosition, type DiagnosisKind } from './positionDiagnosis';

const kinds = (d: ReturnType<typeof diagnosePosition>): DiagnosisKind[] => d.drivers.map(x => x.kind);

describe('diagnosePosition — benchmark-relative', () => {
  it('flags underperformance vs benchmark and sets review/monitor stance', () => {
    const d = diagnosePosition({ symbol: 'X', holdingReturn: -0.10, benchmarkReturn: 0.05 });
    assert.ok(kinds(d).includes('benchmark_relative'));
    assert.equal(d.drivers[0].kind, 'benchmark_relative');
    assert.notEqual(d.stance, 'stable');
    assert.match(d.headline.toLowerCase(), /underperform/);
  });
  it('marks outperformance as info (not a concern)', () => {
    const d = diagnosePosition({ symbol: 'X', holdingReturn: 0.20, benchmarkReturn: 0.05 });
    const br = d.drivers.find(x => x.kind === 'benchmark_relative')!;
    assert.equal(br.severity, 'info');
    assert.match(br.label.toLowerCase(), /outperform/);
  });
});

describe('diagnosePosition — macro/regime', () => {
  it('attributes a loss to the market when benchmark is also down and tracking is tight', () => {
    const d = diagnosePosition({ symbol: 'X', holdingReturn: -0.09, benchmarkReturn: -0.08 });
    assert.ok(kinds(d).includes('macro_regime'));
    // tight tracking → should NOT be flagged idiosyncratic
    assert.ok(!kinds(d).includes('stock_specific'));
  });
});

describe('diagnosePosition — stock-specific', () => {
  it('flags idiosyncratic weakness when it diverges down with its own drawdown', () => {
    const d = diagnosePosition({ symbol: 'X', holdingReturn: -0.18, benchmarkReturn: 0.02, maxDrawdown: -0.25, trend: 'down' });
    assert.ok(kinds(d).includes('stock_specific'));
    assert.equal(d.stance, 'review');
  });
});

describe('diagnosePosition — volatility', () => {
  it('flags vol elevated vs baseline', () => {
    const d = diagnosePosition({ symbol: 'X', holdingReturn: 0.01, benchmarkReturn: 0.0, annVol: 0.6, volBaseline: 0.3 });
    assert.ok(kinds(d).includes('volatility'));
  });
  it('flags absolute high vol with no baseline', () => {
    const d = diagnosePosition({ symbol: 'X', holdingReturn: 0.0, benchmarkReturn: 0.0, annVol: 0.5 });
    assert.ok(kinds(d).includes('volatility'));
  });
  it('does not flag normal vol', () => {
    const d = diagnosePosition({ symbol: 'X', holdingReturn: 0.0, benchmarkReturn: 0.0, annVol: 0.2 });
    assert.ok(!kinds(d).includes('volatility'));
  });
});

describe('diagnosePosition — concentration', () => {
  it('flags a large weight', () => {
    const d = diagnosePosition({ symbol: 'X', holdingReturn: 0.0, benchmarkReturn: 0.0, weight: 0.32, hhi: 0.25 });
    const c = d.drivers.find(x => x.kind === 'concentration')!;
    assert.equal(c.severity, 'high');
  });
  it('ignores a small weight', () => {
    const d = diagnosePosition({ symbol: 'X', holdingReturn: 0.0, benchmarkReturn: 0.0, weight: 0.05 });
    assert.ok(!kinds(d).includes('concentration'));
  });
});

describe('diagnosePosition — sector/theme (optional)', () => {
  it('flags lagging sector peers when peer context is supplied', () => {
    const d = diagnosePosition({ symbol: 'X', holdingReturn: -0.05, benchmarkReturn: -0.04, sector: 'Tech', sectorPeerReturn: 0.04 });
    assert.ok(kinds(d).includes('sector_theme'));
  });
  it('omits sector when no peer context', () => {
    const d = diagnosePosition({ symbol: 'X', holdingReturn: -0.05, benchmarkReturn: -0.04, sector: 'Tech' });
    assert.ok(!kinds(d).includes('sector_theme'));
  });
});

describe('diagnosePosition — benign', () => {
  it('returns a stable stance and no drivers when nothing stands out', () => {
    const d = diagnosePosition({ symbol: 'X', holdingReturn: 0.03, benchmarkReturn: 0.025, annVol: 0.2, weight: 0.05 });
    assert.equal(d.drivers.length, 0);
    assert.equal(d.stance, 'stable');
    assert.match(d.headline, /tracking expectations/);
  });
});

describe('diagnosePosition — ranking', () => {
  it('orders drivers by severity (high first)', () => {
    const d = diagnosePosition({ symbol: 'X', holdingReturn: -0.20, benchmarkReturn: 0.02, maxDrawdown: -0.35, trend: 'strong-down', weight: 0.32, annVol: 0.7 });
    const sevs = d.drivers.map(x => x.severity);
    const rank = { high: 0, medium: 1, low: 2, info: 3 };
    for (let i = 1; i < sevs.length; i++) {
      assert.ok(rank[sevs[i - 1]] <= rank[sevs[i]], 'drivers must be severity-sorted');
    }
    assert.equal(d.stance, 'review');
  });
});
