import React from 'react';
import { AlertTriangle, Globe2, RefreshCw } from 'lucide-react';
import {
  fetchCountryRegimes,
  fetchGlobalIndicators,
  type CountryRegimeRow,
  type GlobalIndicatorRow,
} from '../../services/v3p2Service';
import { useDrawer } from './DataDrawer';

const DISPLAY_COUNTRIES = ['USA', 'CHN', 'JPN', 'DEU', 'GBR', 'FRA', 'IND', 'BRA'];

function fmtDate(v: { value: string } | string | null | undefined): string {
  const raw = typeof v === 'string' ? v : v?.value;
  if (!raw) return '';
  const d = new Date(raw);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : raw.slice(0, 10);
}

function fmtValue(row: GlobalIndicatorRow): string {
  if (row.value == null) return 'n/a';
  const abs = Math.abs(row.value);
  const digits = abs >= 1000 ? 0 : abs >= 10 ? 1 : 2;
  const value = row.value.toLocaleString(undefined, { maximumFractionDigits: digits });
  return row.unit ? `${value} ${row.unit}` : value;
}

function colorForRisk(score: number | null | undefined): string {
  if (score == null) return 'var(--muted-foreground)';
  if (score >= 0.7) return 'var(--destructive)';
  if (score >= 0.45) return '#9e7e3a';
  return '#4E6040';
}

export const GlobalMacroIndicatorsPanel: React.FC = () => {
  const drawer = useDrawer();
  const [regimes, setRegimes] = React.useState<CountryRegimeRow[]>([]);
  const [indicators, setIndicators] = React.useState<GlobalIndicatorRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [regimeRows, indicatorRows] = await Promise.all([
        fetchCountryRegimes({ countries: DISPLAY_COUNTRIES, limit: DISPLAY_COUNTRIES.length }),
        fetchGlobalIndicators({ countries: DISPLAY_COUNTRIES, limit: 96 }),
      ]);
      setRegimes(regimeRows);
      setIndicators(indicatorRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const indicatorByCountry = React.useMemo(() => {
    const grouped = new Map<string, GlobalIndicatorRow[]>();
    for (const row of indicators) {
      const xs = grouped.get(row.country_iso3) ?? [];
      xs.push(row);
      grouped.set(row.country_iso3, xs);
    }
    return grouped;
  }, [indicators]);

  // Riskiest countries first so the signal floats to the top.
  const sortedRegimes = React.useMemo(
    () => [...regimes].sort((a, b) => (b.composite_risk_score ?? -1) - (a.composite_risk_score ?? -1)),
    [regimes],
  );

  const openCountry = (regime: CountryRegimeRow, rows: GlobalIndicatorRow[]) => {
    drawer.open({
      title: regime.country_name ?? regime.country_iso3,
      subtitle: 'Country macro indicators',
      width: 520,
      body: <CountryDetailDrawerBody regime={regime} rows={rows} />,
    });
  };

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 className="ds-heading" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Globe2 size={16} />
          Global Macro Indicators
        </h2>
        <button
          onClick={() => void load()}
          disabled={loading}
          title="Refresh global macro indicators"
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--muted-foreground)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} />
        </button>
      </div>

      {error && (
        <div className="ds-surface" style={{ padding: 12, borderRadius: 8, display: 'flex', gap: 8, color: 'var(--destructive)', marginBottom: 10 }}>
          <AlertTriangle size={14} />
          <span className="ds-caption">{error}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
        {(loading && regimes.length === 0 ? DISPLAY_COUNTRIES.map((c) => ({ country_iso3: c } as CountryRegimeRow)) : sortedRegimes).map((regime) => {
          const allRows = indicatorByCountry.get(regime.country_iso3) ?? [];
          const rows = allRows.slice(0, 4);
          const clickable = allRows.length > 0;
          return (
            <div
              key={regime.country_iso3}
              className="ds-surface ds-transition-fast"
              onClick={clickable ? () => openCountry(regime, allRows) : undefined}
              title={clickable ? 'Click for all indicators' : undefined}
              style={{ padding: 12, borderRadius: 8, display: 'grid', gap: 10, cursor: clickable ? 'pointer' : 'default' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{regime.country_iso3}</div>
                  <div className="ds-body" style={{ fontWeight: 700, fontSize: 13 }}>
                    {regime.country_name ?? regime.country_iso3}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>risk</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: colorForRisk(regime.composite_risk_score), fontVariantNumeric: 'tabular-nums' }}>
                    {regime.composite_risk_score == null ? '--' : regime.composite_risk_score.toFixed(2)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {[regime.growth_state, regime.inflation_state, regime.debt_state].filter(Boolean).map((state) => (
                  <span key={state} className="ds-caption" style={{ padding: '2px 6px', borderRadius: 5, background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                    {String(state).replace(/_/g, ' ')}
                  </span>
                ))}
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                {rows.length === 0 ? (
                  <div className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
                    {loading ? 'Loading indicators...' : 'No country indicators loaded yet.'}
                  </div>
                ) : rows.map((row) => (
                  <div key={`${row.country_iso3}-${row.indicator_code}-${row.provider}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                    <span className="ds-caption" style={{ color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.indicator_name ?? row.indicator_code}
                    </span>
                    <span className="ds-caption" style={{ color: 'var(--foreground)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtValue(row)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
                {regime.latest_period ? `latest ${regime.latest_period}` : fmtDate(regime.as_of_date)}
                {regime.source_providers?.length ? ` · ${regime.source_providers.join(', ')}` : ''}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

/* ─── Country detail drawer ─────────────────────────────────────────────── */

const CountryDetailDrawerBody: React.FC<{
  regime: CountryRegimeRow;
  rows: GlobalIndicatorRow[];
}> = ({ regime, rows }) => {
  const states = [regime.growth_state, regime.inflation_state, regime.debt_state].filter(Boolean);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="ds-surface" style={{ padding: 14, borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="ds-label" style={{ color: 'var(--muted-foreground)' }}>{regime.country_iso3}</div>
          <div className="ds-body" style={{ fontWeight: 700, fontSize: 15 }}>{regime.country_name ?? regime.country_iso3}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
            {states.map((s) => (
              <span key={String(s)} className="ds-caption" style={{ padding: '2px 6px', borderRadius: 5, background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                {String(s).replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>composite risk</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: colorForRisk(regime.composite_risk_score), fontVariantNumeric: 'tabular-nums' }}>
            {regime.composite_risk_score == null ? '--' : regime.composite_risk_score.toFixed(2)}
          </div>
        </div>
      </div>

      <div>
        <h3 className="ds-heading" style={{ margin: '0 0 8px' }}>All indicators</h3>
        {rows.length === 0 ? (
          <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>No indicators loaded for this country.</p>
        ) : (
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--muted-foreground)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ textAlign: 'left', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>Indicator</th>
                <th style={{ textAlign: 'right', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>Value</th>
                <th style={{ textAlign: 'right', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>YoY</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.indicator_code}-${row.provider}`}>
                  <td style={{ padding: '6px 0', color: 'var(--foreground)' }}>{row.indicator_name ?? row.indicator_code}</td>
                  <td style={{ padding: '6px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtValue(row)}</td>
                  <td style={{
                    padding: '6px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                    color: row.yoy_change == null ? 'var(--muted-foreground)' : row.yoy_change >= 0 ? '#4E6040' : '#c15f3c',
                  }}>
                    {row.yoy_change == null ? '—' : `${row.yoy_change >= 0 ? '+' : ''}${row.yoy_change.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)', fontSize: 10, marginTop: 8 }}>
          {regime.latest_period ? `latest ${regime.latest_period}` : fmtDate(regime.as_of_date)}
          {regime.source_providers?.length ? ` · ${regime.source_providers.join(', ')}` : ''}
        </p>
      </div>
    </div>
  );
};
