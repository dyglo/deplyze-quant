/**
 * AgentStatusDashboard — surfaces today's agent run summary for Model Observatory.
 * Shows which agents have run, output count, last run time, and high-severity count.
 * Institutional monitoring panel — no gamification, no progress bars.
 */

import React from 'react';
import { Activity, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { useAgentStatus } from '../../hooks/useAgentIntelligence';
import type { AgentStatusEntry } from '../../types/agents';
import { AGENT_DOMAIN_LABELS } from '../../types/agents';
import { SystemAnalyzingState } from './SystemAnalyzingState';

const ALL_SCHEDULED_AGENTS = [
  'macro_agent', 'sentiment_agent', 'volatility_agent', 'cross_asset_agent',
  'liquidity_agent', 'regime_agent', 'opportunity_agent', 'earnings_agent',
  'risk_agent', 'reasoning_agent',
];

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return '—'; }
}

const AgentRow: React.FC<{
  agentId: string;
  entry: AgentStatusEntry | undefined;
}> = ({ agentId, entry }) => {
  const ran = !!entry;
  const label = agentId.replace(/_agent$/, '').replace('_', '-');
  const domain = agentId.replace('_agent', '') as keyof typeof AGENT_DOMAIN_LABELS;
  const domainLabel = AGENT_DOMAIN_LABELS[domain] ?? label;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '20px 140px 1fr 60px 60px 70px',
      alignItems: 'center',
      gap: 8,
      padding: '6px 12px',
      borderBottom: '1px solid var(--border)',
      fontSize: 10,
    }}>
      {/* Status icon */}
      <span>
        {ran
          ? <CheckCircle2 size={11} color="var(--ds-gain)" />
          : <Clock size={11} color="var(--muted-foreground)" />
        }
      </span>

      {/* Agent name */}
      <span style={{ fontWeight: 600, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>
        {domainLabel}
      </span>

      {/* Agent ID */}
      <span style={{ color: 'var(--muted-foreground)', fontFamily: 'monospace', fontSize: 9 }}>
        {agentId}
      </span>

      {/* Output count */}
      <span style={{
        textAlign: 'right',
        color: ran ? 'var(--foreground)' : 'var(--muted-foreground)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {ran ? `${entry.output_count} obs` : '—'}
      </span>

      {/* High severity */}
      <span style={{
        textAlign: 'right',
        color: (entry?.high_severity_count ?? 0) > 0 ? 'var(--ds-loss)' : 'var(--muted-foreground)',
        fontVariantNumeric: 'tabular-nums',
        fontWeight: (entry?.high_severity_count ?? 0) > 0 ? 700 : 400,
      }}>
        {(entry?.high_severity_count ?? 0) > 0 ? `${entry!.high_severity_count} high` : '—'}
      </span>

      {/* Last run */}
      <span style={{
        textAlign: 'right',
        color: 'var(--muted-foreground)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 9,
      }}>
        {fmtTime(entry?.last_generated as string | null)}
      </span>
    </div>
  );
};

export const AgentStatusDashboard: React.FC = () => {
  const { data: statusRows, loading, refetch } = useAgentStatus();

  const statusByAgent: Record<string, AgentStatusEntry> = {};
  for (const s of statusRows) {
    statusByAgent[s.agent_id] = s;
  }

  const ranCount = statusRows.length;
  const totalScheduled = ALL_SCHEDULED_AGENTS.length;
  const highCount = statusRows.reduce((s, r) => s + (r.high_severity_count ?? 0), 0);

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Activity size={13} color="var(--primary)" />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            Agent Intelligence Status
          </span>
          <span style={{
            fontSize: 9, fontWeight: 600, padding: '1px 6px',
            background: ranCount === totalScheduled ? 'rgba(90,112,82,0.10)' : 'rgba(201,162,39,0.10)',
            color: ranCount === totalScheduled ? 'var(--ds-gain)' : '#C9A227',
            borderRadius: 4,
          }}>
            {ranCount}/{totalScheduled} run today
          </span>
          {highCount > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '1px 6px',
              background: 'rgba(176,58,46,0.10)', color: 'var(--ds-loss)', borderRadius: 4,
            }}>
              <AlertTriangle size={8} style={{ display: 'inline', marginRight: 3 }} />
              {highCount} high
            </span>
          )}
        </div>
        <button
          onClick={refetch}
          style={{
            fontSize: 9, padding: '2px 8px', border: '1px solid var(--border)',
            borderRadius: 4, background: 'transparent', color: 'var(--muted-foreground)',
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '20px 140px 1fr 60px 60px 70px',
        gap: 8, padding: '5px 12px',
        fontSize: 8, fontWeight: 700, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--muted-foreground)',
        borderBottom: '1px solid var(--border)',
      }}>
        <span />
        <span>Domain</span>
        <span>Agent ID</span>
        <span style={{ textAlign: 'right' }}>Outputs</span>
        <span style={{ textAlign: 'right' }}>Alerts</span>
        <span style={{ textAlign: 'right' }}>Last Run</span>
      </div>

      {/* Agent rows */}
      {loading ? (
        <div style={{ padding: '16px 14px' }}>
          <SystemAnalyzingState label="Loading agent status" compact />
        </div>
      ) : (
        ALL_SCHEDULED_AGENTS.map(agentId => (
          <AgentRow
            key={agentId}
            agentId={agentId}
            entry={statusByAgent[agentId]}
          />
        ))
      )}

      <div style={{
        padding: '6px 12px', fontSize: 9, color: 'var(--muted-foreground)',
      }}>
        Status reflects today's scheduled runs. Agents run on Cloud Scheduler cadences (ET).
      </div>
    </div>
  );
};
