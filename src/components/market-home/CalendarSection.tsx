import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSWR } from '../../hooks/useSWR';
import { SectionCard } from './SectionCard';
import { fetchEarningsCalendar } from '../../services/earningsService';
import { fetchMacroObservations } from '../../services/v3p2Service';
import { tsValue, fmtDayLabel, stripMarkdown, symbolCountry } from './format';
import { Flag } from './Flag';
import type { EarningsEvent } from '../../lib/market-data/contracts';

const Empty: React.FC<{ msg: string }> = ({ msg }) => (
  <p className="ds-caption" style={{ color: 'var(--muted-foreground)', padding: '14px 2px' }}>{msg}</p>
);

const Skeleton: React.FC<{ n: number }> = ({ n }) => (
  <div style={{ display: 'grid', gap: 5 }}>
    {Array.from({ length: n }).map((_, i) => <div key={i} style={{ height: 30, borderRadius: 5, background: 'var(--muted)', animation: 'pulse 1.8s infinite' }} />)}
  </div>
);

const EarningsCalendarBlock: React.FC = () => {
  const navigate = useNavigate();
  const { data, loading, error } = useSWR(() => fetchEarningsCalendar(), [], { cacheKey: 'marketHome:earningsCalendar' });
  const events = (data?.events ?? [])
    .filter((e) => e.symbol && e.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', marginBottom: 8 }}>
        Upcoming Earnings
      </div>
      {loading && events.length === 0 ? <Skeleton n={5} />
        : (error || data?.degraded) && events.length === 0 ? <Empty msg="Earnings calendar temporarily unavailable — data will refresh automatically." />
        : events.length === 0 ? <Empty msg="No scheduled earnings in the next 30 days." />
        : (
          <div>
            {events.map((e: EarningsEvent, i) => (
              <button
                key={`${e.symbol}-${e.date}-${i}`}
                type="button"
                onClick={() => navigate(`/instruments/${encodeURIComponent(e.symbol)}`)}
                className="ds-transition-fast"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%',
                  padding: '7px 2px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
                  textAlign: 'left', cursor: 'pointer',
                }}
                onMouseEnter={(ev) => { (ev.currentTarget as HTMLElement).style.background = 'var(--muted)'; }}
                onMouseLeave={(ev) => { (ev.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <Flag iso={symbolCountry(e.symbol)} width={16} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>{e.symbol}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {e.time && <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>{e.time}</span>}
                  {typeof e.epsEstimate === 'number' && <span style={{ fontSize: 10.5, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>est {e.epsEstimate.toFixed(2)}</span>}
                  <span style={{ fontSize: 10.5, color: 'var(--muted-foreground)' }}>{fmtDayLabel(e.date)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
    </div>
  );
};

const MacroReleasesBlock: React.FC = () => {
  const navigate = useNavigate();
  const { data, loading, error } = useSWR(() => fetchMacroObservations({ limit: 8 }), [], { cacheKey: 'marketHome:macroReleases' });
  const items = (data ?? []).slice(0, 6);

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)', marginBottom: 8 }}>
        Recent Macro Releases
      </div>
      {loading && items.length === 0 ? <Skeleton n={5} />
        : error && items.length === 0 ? <Empty msg="Macro observations unavailable." />
        : items.length === 0 ? <Empty msg="No recent macro observations." />
        : (
          <div>
            {items.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => navigate('/macro')}
                className="ds-transition-fast"
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '7px 2px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                }}
                onMouseEnter={(ev) => { (ev.currentTarget as HTMLElement).style.background = 'var(--muted)'; }}
                onMouseLeave={(ev) => { (ev.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{stripMarkdown(m.title)}</span>
                  <span style={{ fontSize: 10, color: 'var(--muted-foreground)', flexShrink: 0 }}>{fmtDayLabel(tsValue(m.observation_time))}</span>
                </span>
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{stripMarkdown(m.summary)}</span>
              </button>
            ))}
          </div>
        )}
    </div>
  );
};

export const CalendarSection: React.FC = () => (
  <SectionCard title="Calendar" subtitle="Earnings & macro events">
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20 }} className="market-home-cal">
      <EarningsCalendarBlock />
      <MacroReleasesBlock />
    </div>
  </SectionCard>
);
