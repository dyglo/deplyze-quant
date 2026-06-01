import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { db } from '../lib/firebase';
import { useWorkspace } from '../components/WorkspaceContext';
import { useBriefingGenerate } from '../hooks/useBriefingGenerate';
import { useArtifacts, useBriefings } from '../hooks/useArtifacts';
import { useDrawer } from '../components/quant/DataDrawer';
import { PageHeader } from '../components/quant/PageHeader';
import { Disclaimer } from '../components/quant/Disclaimer';
import { FreshnessBadge, SourceBadge } from '../components/quant/FreshnessBadge';
import { RelatedIntelligencePanel } from '../components/quant/RelatedIntelligencePanel';
import { ArtifactDetailDrawerBody } from '../components/quant/ArtifactDetailDrawerBody';
import { RefreshCw, Loader2, Archive } from 'lucide-react';
import type { Briefing } from '../types';
import type { BriefingGenerateKind } from '../services/briefingService';
import { createArtifactFromBriefing } from '../services/artifactService';
import { useAuth } from '../components/AuthProvider';
import { useAuthGate } from '../components/auth/AuthGate';
import { useDocumentHead } from '../lib/seo';

function normalizeBriefing(raw: Record<string, unknown>): Briefing {
  const createdAt = raw.createdAt;
  let ms = 0;
  if (createdAt instanceof Timestamp) ms = createdAt.toMillis();
  else if (typeof createdAt === 'number') ms = createdAt;
  else if (createdAt && typeof (createdAt as { toMillis?: () => number }).toMillis === 'function') {
    ms = (createdAt as { toMillis: () => number }).toMillis();
  }
  return { ...(raw as unknown as Briefing), createdAt: ms };
}

export const BriefingDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentWorkspace, currentProject } = useWorkspace();
  const { user } = useAuth();
  const { requireAuth } = useAuthGate();
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingArtifact, setSavingArtifact] = useState(false);
  const gen = useBriefingGenerate();
  const drawer = useDrawer();

  useDocumentHead({
    title: briefing?.title || 'Briefing',
    description: 'An institutional research briefing grounded in real market data.',
    canonicalPath: id ? `/briefings/${id}` : '/briefings',
    type: 'article',
  });

  const artifacts = useArtifacts(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const briefings = useBriefings(currentWorkspace?.id ?? null, currentProject?.id ?? null);

  const handleOpenArtifact = useCallback((artifactId: string) => {
    const artifact = artifacts.items.find((a) => a.id === artifactId);
    if (!artifact) return;
    drawer.open({ title: artifact.title, subtitle: artifact.category, width: 560, body: <ArtifactDetailDrawerBody artifact={artifact} relatedArtifacts={artifacts.items} onOpenArtifact={handleOpenArtifact} /> });
  }, [artifacts.items, drawer]);

  const load = React.useCallback(() => {
    if (!id || !currentWorkspace || !currentProject) return;
    setLoading(true);
    setError(null);
    getDoc(doc(db, 'workspaces', currentWorkspace.id, 'projects', currentProject.id, 'briefings', id))
      .then((snap) => {
        if (!snap.exists()) { setError('Briefing not found'); return; }
        setBriefing(normalizeBriefing({ id: snap.id, ...snap.data() }));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id, currentWorkspace, currentProject]);

  useEffect(() => { load(); }, [load]);

  const handleRegenerate = async () => {
    if (!requireAuth({ title: 'Regenerate this briefing', description: 'Create a free workspace to run and save your own briefings.' })) return;
    if (!briefing || !currentWorkspace || !currentProject) return;
    const out = await gen.run({
      kind: briefing.kind as BriefingGenerateKind,
      workspaceId: currentWorkspace.id,
      projectId: currentProject.id,
      params: (briefing.params ?? {}) as { symbol?: string; symbols?: string[]; query?: string },
    });
    if (out) {
      toast.success('Regenerated');
      setBriefing(out);
    } else if (gen.error) {
      toast.error(gen.error.message);
    }
  };

  const handleSaveAsArtifact = async () => {
    if (!requireAuth({ title: 'Save to your research timeline', description: 'Create a free workspace to save briefings and build a research library.' })) return;
    if (!briefing || !currentWorkspace?.id || !currentProject?.id || !user) return;
    setSavingArtifact(true);
    try {
      await createArtifactFromBriefing(currentWorkspace.id, currentProject.id, briefing, user.uid);
      toast.success('Saved to Research Timeline');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSavingArtifact(false);
    }
  };

  return (
    <div style={{ padding: '0 24px 32px', maxWidth: 920, margin: '0 auto' }}>
      <PageHeader
        title={briefing?.title ?? 'Briefing'}
        subtitle={briefing?.summary}
        actions={
          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            {briefing && (
              <>
                <SourceBadge source={briefing.source ?? 'manual'} />
                <FreshnessBadge status="cached" fetchedAt={briefing.createdAt} compact />
                <button
                  disabled={savingArtifact || !briefing}
                  onClick={handleSaveAsArtifact}
                  className="ds-btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                >
                  {savingArtifact ? <Loader2 size={11} className="animate-spin" /> : <Archive size={11} />}
                  Save to Timeline
                </button>
                <button
                  disabled={gen.generating}
                  onClick={handleRegenerate}
                  style={{
                    padding: '6px 10px', borderRadius: 6,
                    border: '1px solid var(--border)', background: 'var(--card)',
                    color: 'var(--foreground)', cursor: gen.generating ? 'not-allowed' : 'pointer',
                    fontSize: 11, fontWeight: 600,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {gen.generating ? <><Loader2 size={11} className="ds-spin" /> Regenerating…</> : <><RefreshCw size={11} /> Regenerate</>}
                </button>
              </>
            )}
            <Link to="/briefings" className="ds-caption" style={{
              padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
              textDecoration: 'none', color: 'var(--muted-foreground)',
            }}>
              ← All briefings
            </Link>
          </div>
        }
      />

      {loading && <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Loading…</p>}
      {error && (
        <p className="ds-caption" style={{ color: 'var(--primary)' }}>
          {error}{' '}
          <button onClick={load} style={{
            background: 'transparent', border: 'none', color: 'var(--primary)',
            textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit',
          }}>Retry</button>
        </p>
      )}

      {briefing && (
        <>
          {/* Metadata strip */}
          <section style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14, alignItems: 'center' }}>
            <span style={{
              padding: '2px 8px', borderRadius: 999,
              border: '1px solid var(--border)', background: 'var(--muted)',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--muted-foreground)',
            }}>
              {briefing.kind}
            </span>
            {briefing.symbols.length > 0 && (
              <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
                {briefing.symbols.join(' · ')}
              </span>
            )}
            {briefing.dataCompleteness != null && (
              <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
                data completeness {Math.round(briefing.dataCompleteness * 100)}%
              </span>
            )}
            {briefing.sourceCoverage != null && (
              <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>
                sources {briefing.sourceCoverage}
              </span>
            )}
          </section>

          {/* Highlights */}
          {briefing.highlights?.length > 0 && (
            <section style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {briefing.highlights.map((h, i) => (
                <span key={i} style={{
                  padding: '4px 10px', borderRadius: 999,
                  background: 'rgba(193,95,60,0.06)',
                  border: '1px solid color-mix(in srgb, var(--primary) 22%, transparent)',
                  color: 'var(--foreground)', fontSize: 11,
                }}>{h}</span>
              ))}
            </section>
          )}

          <article className="ds-surface ds-markdown" style={{ padding: 20, borderRadius: 10 }}>
            <ReactMarkdown>{briefing.body}</ReactMarkdown>
          </article>

          {briefing.symbols?.length ? (
            <RelatedIntelligencePanel
              symbols={briefing.symbols}
              artifacts={artifacts.items}
              briefings={briefings.items}
              excludeId={briefing.id}
              onOpenArtifact={handleOpenArtifact}
              maxItems={4}
            />
          ) : null}
        </>
      )}

      <Disclaimer />
      <style>{`
        .ds-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }
        .ds-markdown h1, .ds-markdown h2, .ds-markdown h3 { font-family: inherit; letter-spacing: -0.01em; }
        .ds-markdown h2 { font-size: 1rem; font-weight: 600; margin: 18px 0 6px; }
        .ds-markdown h3 { font-size: 0.875rem; font-weight: 600; margin: 14px 0 4px; color: var(--foreground); }
        .ds-markdown p  { margin: 6px 0; line-height: 1.6; color: var(--foreground); }
        .ds-markdown ul, .ds-markdown ol { margin: 6px 0 6px 20px; }
        .ds-markdown li { margin: 2px 0; line-height: 1.55; }
        .ds-markdown strong { color: var(--foreground); }
        .ds-markdown code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; padding: 1px 4px; background: var(--muted); border-radius: 3px; }
        .ds-markdown blockquote { border-left: 2px solid var(--border); padding-left: 10px; color: var(--muted-foreground); margin: 8px 0; }
      `}</style>
    </div>
  );
};
