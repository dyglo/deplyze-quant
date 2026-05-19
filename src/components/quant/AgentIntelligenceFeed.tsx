/**
 * AgentIntelligenceFeed — renders a list of AgentOutput records as an
 * institutional intelligence feed. Groups by severity, filters by domain/severity.
 *
 * This is the primary surface for background agentic intelligence.
 * No chatbot widgets, no agent avatars — pure structured intelligence.
 */

import React, { useMemo, useState } from 'react';
import { Activity, RefreshCw, Filter } from 'lucide-react';
import type { AgentOutput, AgentDomain, AgentSeverity } from '../../types/agents';
import { AGENT_DOMAIN_LABELS, AGENT_SEVERITY_ORDER } from '../../types/agents';
import { IntelligenceObservationCard } from './IntelligenceObservationCard';
import { SystemAnalyzingState } from './SystemAnalyzingState';

// ─── Filter bar ───────────────────────────────────────────────────────────────

const DOMAIN_OPTIONS: Array<{ value: AgentDomain | 'all'; label: string }> = [
  { value: 'all', label: 'All Domains' },
  ...Object.entries(AGENT_DOMAIN_LABELS).map(([v, label]) => ({
    value: v as AgentDomain,
    label,
  })),
];

const SEVERITY_OPTIONS: Array<{ value: AgentSeverity | 'all'; label: string }> = [
  { value: 'all',    label: 'All' },
  { value: 'high',   label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'info',   label: 'Info' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export const AgentIntelligenceFeed: React.FC<{
  outputs: AgentOutput[];
  loading?: boolean;
  analyzing?: boolean;          // show "System analyzing" state while data loads
  title?: string;
  showFilters?: boolean;
  compact?: boolean;
  maxItems?: number;
  onSymbolClick?: (symbol: string) => void;
  onRefresh?: () => void;
}> = ({
  outputs,
  loading = false,
  analyzing = false,
  title = 'Intelligence Feed',
  showFilters = true,
  compact = false,
  maxItems = 50,
  onSymbolClick,
  onRefresh,
}) => {
  const [domainFilter, setDomainFilter] = useState<AgentDomain | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<AgentSeverity | 'all'>('all');

  const filtered = useMemo(() => {
    let items = outputs;
    if (domainFilter !== 'all') items = items.filter(o => o.domain === domainFilter);
    if (severityFilter !== 'all') items = items.filter(o => o.severity === severityFilter);
    // Sort by severity priority, then by generated_at desc
    return [...items]
      .sort((a, b) => {
        const sa = AGENT_SEVERITY_ORDER[(a.severity ?? 'info') as AgentSeverity] ?? 3;
        const sb = AGENT_SEVERITY_ORDER[(b.severity ?? 'info') as AgentSeverity] ?? 3;
        if (sa !== sb) return sa - sb;
        return new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime();
      })
      .slice(0, maxItems);
  }, [outputs, domainFilter, severityFilter, maxItems]);

  const highCount = outputs.filter(o => o.severity === 'high').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: compact ? '8px 0 6px' : '10px 0 8px', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Activity size={12} color="var(--primary)" />
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
            textTransform: 'uppercase', color: 'var(--foreground)',
          }}>
            {title}
          </span>
          {highCount > 0 && (
            <span style={{
              fontSize: 8, fontWeight: 800, letterSpacing: '0.06em',
              color: '#ef4444', background: 'rgba(239,68,68,0.10)',
              borderRadius: 3, padding: '1px 5px',
            }}>
              {highCount} HIGH
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {analyzing && (
            <span style={{ fontSize: 9, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
              System analyzing…
            </span>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 2, color: 'var(--muted-foreground)',
              }}
              title="Refresh intelligence"
            >
              <RefreshCw size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap',
          paddingBottom: 10,
        }}>
          <select
            value={domainFilter}
            onChange={e => setDomainFilter(e.target.value as AgentDomain | 'all')}
            style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 4,
              border: '1px solid var(--border)', background: 'var(--card)',
              color: 'var(--foreground)', cursor: 'pointer',
            }}
          >
            {DOMAIN_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={severityFilter}
            onChange={e => setSeverityFilter(e.target.value as AgentSeverity | 'all')}
            style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 4,
              border: '1px solid var(--border)', background: 'var(--card)',
              color: 'var(--foreground)', cursor: 'pointer',
            }}
          >
            {SEVERITY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span style={{ fontSize: 9, color: 'var(--muted-foreground)', alignSelf: 'center' }}>
            {filtered.length} observation{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <SystemAnalyzingState label="Loading intelligence feed" />
      ) : filtered.length === 0 ? (
        <div style={{
          padding: '24px 0', textAlign: 'center',
          color: 'var(--muted-foreground)', fontSize: 11,
        }}>
          {outputs.length === 0
            ? 'No intelligence observations yet. Agents run on scheduled cadences.'
            : 'No observations match the selected filters.'
          }
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
          {filtered.map(output => (
            <IntelligenceObservationCard
              key={output.artifact_id}
              output={output}
              compact={compact}
              onSymbolClick={onSymbolClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};
