import React from 'react';
import { CheckCircle2, XCircle, Circle } from 'lucide-react';
import type { ProviderStatus } from '../../services/providerService';
import { capabilityLabel } from '../../lib/providerLabels';

export type ModelStatus = 'planned' | 'data-ready' | 'disabled' | 'needs-dataset' | 'needs-training';

export interface ModelDef {
  id: string;
  name: string;
  category: string;
  purpose: string;
  expectedOutput: string;
  features: string[];
  requiredProviders: string[];
  requiredDatasets: string[];
  validation: string[];
  nextStep: string;
  status: ModelStatus;
}

const STATUS_COLOR: Record<ModelStatus, string> = {
  'planned':         'var(--muted-foreground)',
  'data-ready':      '#4E6040',
  'disabled':        'var(--primary)',
  'needs-dataset':   '#9e7e3a',
  'needs-training':  '#6a4e7c',
};

function checkAvailability(
  m: ModelDef,
  providers: ProviderStatus[] | null | unknown,
): { providersOk: string[]; providersMissing: string[]; allOk: boolean } {
  // Defensively normalise: the cache may transiently hold the raw gateway
  // object { providers: [...], routing: {...} } before the fetcher processes it.
  let arr: ProviderStatus[] = [];
  if (Array.isArray(providers)) {
    arr = providers as ProviderStatus[];
  } else if (providers && typeof providers === 'object' && Array.isArray((providers as Record<string, unknown>).providers)) {
    arr = (providers as Record<string, unknown>).providers as ProviderStatus[];
  }
  const byId = new Map<string, boolean>(arr.map((p) => [p.id as string, p.configured]));
  const ok: string[] = [];
  const missing: string[] = [];
  for (const p of m.requiredProviders) {
    if (byId.get(p) === true) ok.push(p); else missing.push(p);
  }
  return { providersOk: ok, providersMissing: missing, allOk: missing.length === 0 };
}

export const ModelDrawerBody: React.FC<{ model: ModelDef; providers: ProviderStatus[] | null | unknown }> = ({ model, providers }) => {
  const avail = checkAvailability(model, providers);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>{model.name}</div>
          <div className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>{model.category}</div>
        </div>
        <span style={{
          padding: '4px 10px', borderRadius: 999,
          fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: STATUS_COLOR[model.status],
          background: `color-mix(in srgb, ${STATUS_COLOR[model.status]} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${STATUS_COLOR[model.status]} 30%, transparent)`,
        }}>
          {model.status.replace('-', ' ')}
        </span>
      </header>

      <p className="ds-body" style={{ margin: 0, lineHeight: 1.5 }}>{model.purpose}</p>

      <section className="ds-surface" style={{ padding: 12, borderRadius: 10 }}>
        <div className="ds-label" style={{ color: 'var(--muted-foreground)', marginBottom: 4 }}>Expected output</div>
        <p className="ds-body" style={{ margin: 0 }}>{model.expectedOutput}</p>
      </section>

      <section>
        <h3 className="ds-heading" style={{ margin: '0 0 6px' }}>Required providers</h3>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
          {model.requiredProviders.map((p) => {
            const ok = avail.providersOk.includes(p);
            return (
              <li key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {ok ? <CheckCircle2 size={13} color="#4E6040" /> : <XCircle size={13} color="var(--primary)" />}
                <span className="ds-body" style={{ fontSize: 12 }}>{capabilityLabel(p)}</span>
                <span className="ds-caption" style={{ color: ok ? '#4E6040' : 'var(--primary)' }}>
                  {ok ? 'connected' : 'not connected'}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3 className="ds-heading" style={{ margin: '0 0 6px' }}>Required datasets</h3>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
          {model.requiredDatasets.map((d) => (
            <li key={d} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Circle size={9} color="var(--muted-foreground)" />
              <span className="ds-body" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{d}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="ds-heading" style={{ margin: '0 0 6px' }}>Features</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {model.features.map((f) => (
            <span key={f} style={{
              padding: '2px 7px', borderRadius: 999, fontSize: 10,
              background: 'var(--muted)', border: '1px solid var(--border)',
              color: 'var(--foreground)', fontFamily: 'ui-monospace, monospace',
            }}>{f}</span>
          ))}
        </div>
      </section>

      <section>
        <h3 className="ds-heading" style={{ margin: '0 0 6px' }}>Validation requirements</h3>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          {model.validation.map((v, i) => (
            <li key={i} className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>{v}</li>
          ))}
        </ul>
      </section>

      <section className="ds-surface" style={{ padding: 12, borderRadius: 10 }}>
        <div className="ds-label" style={{ color: 'var(--muted-foreground)', marginBottom: 4 }}>Next implementation step</div>
        <p className="ds-body" style={{ margin: 0, lineHeight: 1.5 }}>{model.nextStep}</p>
      </section>
    </div>
  );
};

export const MODEL_STATUS_COLOR = STATUS_COLOR;
export const checkModelAvailability = checkAvailability;
