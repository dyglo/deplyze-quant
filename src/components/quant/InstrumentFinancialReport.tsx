import React, { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, Loader2, Info } from 'lucide-react';
import { useInstrumentFinancials } from '../../hooks/useInstrumentFinancials';
import { fetchEdgarFundamentals } from '../../services/edgarService';
import type { EdgarFundamentalsSnapshot } from '../../lib/market-data/contracts';
import type { FinancialPeriod } from '../../services/instrumentService';

type Period = 'annual' | 'quarter';

function fmtVal(v: number | null | undefined): string {
  if (v == null) return '—';
  const abs = Math.abs(v);
  const prefix = v < 0 ? '-' : '';
  if (abs >= 1e12) return `${prefix}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${prefix}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `${prefix}$${(abs / 1e6).toFixed(1)}M`;
  return `${prefix}$${abs.toLocaleString()}`;
}

function fmtPeriodLabel(dateStr: string, period: Period): string {
  if (period === 'quarter') {
    const d = new Date(dateStr);
    const q = Math.ceil((d.getMonth() + 1) / 3);
    return `Q${q} '${String(d.getFullYear()).slice(2)}`;
  }
  return dateStr.slice(0, 4);
}

// Compact SVG Sparkline
const Sparkline: React.FC<{ data: number[] }> = ({ data }) => {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * 48;
    const y = 14 - ((val - min) / range) * 12;
    return `${x},${y}`;
  }).join(' ');

  const lastVal = data[data.length - 1];
  const firstVal = data[0];
  const stroke = lastVal >= firstVal ? 'var(--ds-gain)' : 'var(--ds-loss)';

  return (
    <svg width={48} height={14} style={{ display: 'block', overflow: 'visible' }}>
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        points={points}
      />
    </svg>
  );
};

interface ReportRowProps {
  label: string;
  definition: string;
  values: Array<number | null | undefined>;
  trendData: number[];
  indent?: boolean;
}

const ReportRow: React.FC<ReportRowProps> = ({ label, definition, values, trendData, indent = false }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        onClick={() => setOpen(!open)}
        className="ds-transition-fast"
        style={{
          borderBottom: '1px solid var(--border)',
          cursor: 'pointer',
          background: open ? 'var(--secondary)' : 'transparent',
        }}
      >
        <td style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6, paddingLeft: indent ? 24 : 10 }}>
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <span style={{ fontSize: 11.5, fontWeight: indent ? 500 : 700, color: 'var(--foreground)' }}>
            {label}
          </span>
        </td>
        <td style={{ padding: '8px 10px' }}>
          <Sparkline data={trendData} />
        </td>
        {values.map((v, i) => (
          <td key={i} style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 11.5 }}>
            {fmtVal(v)}
          </td>
        ))}
      </tr>
      {open && (
        <tr>
          <td colSpan={values.length + 2} style={{ padding: '8px 16px', background: 'var(--secondary)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
              <Info size={12} style={{ marginTop: 2, flexShrink: 0, color: 'var(--primary)' }} />
              <p style={{ margin: 0 }}>{definition}</p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

export const InstrumentFinancialReport: React.FC<{ symbol: string }> = ({ symbol }) => {
  const [period, setPeriod] = useState<Period>('annual');
  const financials = useInstrumentFinancials(symbol, period);
  const series = financials.data?.series ?? [];

  // Fetch SEC EDGAR XBRL Snapshot
  const [edgar, setEdgar] = useState<EdgarFundamentalsSnapshot | null>(null);
  const [edgarLoading, setEdgarLoading] = useState(false);

  useEffect(() => {
    if (symbol) {
      setEdgarLoading(true);
      fetchEdgarFundamentals(symbol)
        .then(setEdgar)
        .catch(() => setEdgar(null))
        .finally(() => setEdgarLoading(false));
    }
  }, [symbol]);

  // Sort series descending by date for columns
  const sortedPeriods = useMemo(() => {
    return [...series].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 4);
  }, [series]);

  // Sort chronological for sparkline
  const sparklinePeriods = useMemo(() => {
    return [...series].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [series]);

  const headers = sortedPeriods.map(p => fmtPeriodLabel(p.date, period));

  const isLoading = financials.loading || edgarLoading;

  if (!isLoading && !series.length && !edgar) return null;

  return (
    <section style={{ marginBottom: 28 }}>
      {/* Header controls */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingBottom: 14, borderBottom: '1px solid var(--border)', marginBottom: 16,
      }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>
          Financial Statements
        </h2>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden', background: 'var(--secondary)', padding: 2 }}>
          {(['annual', 'quarter'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '3px 8px', fontSize: 10, fontWeight: 700,
                background: period === p ? 'var(--card)' : 'transparent',
                color: period === p ? 'var(--foreground)' : 'var(--muted-foreground)',
                border: 'none', cursor: 'pointer', borderRadius: 4,
              }}
            >{p === 'annual' ? 'Annual' : 'Quarterly'}</button>
          ))}
        </div>
      </div>

      {isLoading && !series.length ? (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
          <Loader2 size={16} className="animate-spin" style={{ marginRight: 6 }} />
          Loading reports…
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>Statement Line Item</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', width: 64 }}>Trend</th>
                {headers.map((h, i) => (
                  <th key={i} style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* --- 1. INCOME STATEMENT --- */}
              <tr style={{ background: 'var(--secondary)' }}>
                <td colSpan={headers.length + 2} style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, color: 'var(--primary)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  Income Statement
                </td>
              </tr>
              <ReportRow
                label="Revenue"
                definition="Total revenue generated from sales of products or services before deducting operating costs."
                values={sortedPeriods.map(p => p.revenue)}
                trendData={sparklinePeriods.map(p => p.revenue ?? 0)}
              />
              <ReportRow
                label="Gross Profit"
                definition="Revenue remaining after deducting the direct cost of goods sold (COGS)."
                values={sortedPeriods.map(p => p.grossProfit)}
                trendData={sparklinePeriods.map(p => p.grossProfit ?? 0)}
                indent
              />
              <ReportRow
                label="EBITDA"
                definition="Earnings Before Interest, Taxes, Depreciation, and Amortization. Measures core operational cash performance."
                values={sortedPeriods.map(p => p.ebitda)}
                trendData={sparklinePeriods.map(p => p.ebitda ?? 0)}
              />
              <ReportRow
                label="Operating Income"
                definition="Income generated from core operations, calculated as gross profit minus operating expenses."
                values={sortedPeriods.map(p => p.operatingIncome)}
                trendData={sparklinePeriods.map(p => p.operatingIncome ?? 0)}
                indent
              />
              <ReportRow
                label="Net Income"
                definition="Net profit after accounting for all expenses, taxes, interest, and overhead costs."
                values={sortedPeriods.map(p => p.netIncome)}
                trendData={sparklinePeriods.map(p => p.netIncome ?? 0)}
              />
              <ReportRow
                label="EPS (Diluted)"
                definition="Net profit divided by diluted outstanding common shares, indicating company profitability per share."
                values={sortedPeriods.map(p => p.eps)}
                trendData={sparklinePeriods.map(p => p.eps ?? 0)}
                indent
              />

              {/* --- 2. BALANCE SHEET (From SEC EDGAR) --- */}
              <tr style={{ background: 'var(--secondary)' }}>
                <td colSpan={headers.length + 2} style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, color: 'var(--primary)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  Balance Sheet (EDGAR XBRL Snapshot)
                </td>
              </tr>
              <ReportRow
                label="Cash & Equivalents"
                definition="Highly liquid cash assets on hand."
                values={sortedPeriods.map((_, idx) => idx === 0 && edgar ? edgar.cashAndEquivalents : null)}
                trendData={edgar?.cashAndEquivalents ? [edgar.cashAndEquivalents, edgar.cashAndEquivalents] : []}
              />
              <ReportRow
                label="Total Assets"
                definition="Combined value of current and non-current assets owned by the corporation."
                values={sortedPeriods.map((_, idx) => idx === 0 && edgar ? edgar.totalAssets : null)}
                trendData={edgar?.totalAssets ? [edgar.totalAssets, edgar.totalAssets] : []}
              />
              <ReportRow
                label="Total Liabilities"
                definition="Combined debts and operational obligations owed to creditors."
                values={sortedPeriods.map((_, idx) => idx === 0 && edgar ? edgar.totalLiabilities : null)}
                trendData={edgar?.totalLiabilities ? [edgar.totalLiabilities, edgar.totalLiabilities] : []}
                indent
              />
              <ReportRow
                label="Stockholders Equity"
                definition="Net book value belonging to shareholders (assets minus liabilities)."
                values={sortedPeriods.map((_, idx) => idx === 0 && edgar ? edgar.stockholdersEquity : null)}
                trendData={edgar?.stockholdersEquity ? [edgar.stockholdersEquity, edgar.stockholdersEquity] : []}
                indent
              />

              {/* --- 3. CASH FLOW STATEMENT --- */}
              <tr style={{ background: 'var(--secondary)' }}>
                <td colSpan={headers.length + 2} style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, color: 'var(--primary)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  Cash Flow Statement
                </td>
              </tr>
              <ReportRow
                label="Operating Cash Flow"
                definition="Net cash generated from operational transactions. Preferred over earnings for solvency tracking."
                values={sortedPeriods.map((_, idx) => idx === 0 && edgar ? edgar.operatingCashFlow : null)}
                trendData={edgar?.operatingCashFlow ? [edgar.operatingCashFlow, edgar.operatingCashFlow] : []}
              />
              <ReportRow
                label="Capital Expenditures"
                definition="Funds used to buy, upgrade, and maintain physical assets like property, plant, or software."
                values={sortedPeriods.map((_, idx) => idx === 0 && edgar ? edgar.capitalExpenditures : null)}
                trendData={edgar?.capitalExpenditures ? [edgar.capitalExpenditures, edgar.capitalExpenditures] : []}
                indent
              />
              <ReportRow
                label="Free Cash Flow"
                definition="Net cash from operations minus capital expenditures. Indicates capital efficiency."
                values={sortedPeriods.map((_, idx) => idx === 0 && edgar ? edgar.freeCashFlow : null)}
                trendData={edgar?.freeCashFlow ? [edgar.freeCashFlow, edgar.freeCashFlow] : []}
              />
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
