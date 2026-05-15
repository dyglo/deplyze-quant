import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useWorkspace } from '../components/WorkspaceContext';
import { useArtifacts } from '../hooks/useArtifacts';
import { useDrawer } from '../components/quant/DataDrawer';
import { PageHeader } from '../components/quant/PageHeader';
import { ArtifactDetailDrawerBody } from '../components/quant/ArtifactDetailDrawerBody';
import { Disclaimer } from '../components/quant/Disclaimer';
import { getArtifact } from '../services/artifactService';
import type { IntelligenceArtifact } from '../types';

export const ArtifactPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentWorkspace, currentProject } = useWorkspace();
  const [artifact, setArtifact] = useState<IntelligenceArtifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const artifacts = useArtifacts(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const drawer = useDrawer();

  useEffect(() => {
    if (!id || !currentWorkspace?.id || !currentProject?.id) return;
    setLoading(true);
    setError(null);
    getArtifact(currentWorkspace.id, currentProject.id, id)
      .then((a) => {
        setArtifact(a);
        if (!a) setError('Artifact not found');
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id, currentWorkspace?.id, currentProject?.id]);

  // Keep artifact in sync with real-time updates from the subscription
  useEffect(() => {
    if (!id || !artifacts.items.length) return;
    const live = artifacts.items.find((a) => a.id === id);
    if (live) setArtifact(live);
  }, [artifacts.items, id]);

  const handleOpenArtifact = useCallback((artifactId: string) => {
    const a = artifacts.items.find((x) => x.id === artifactId);
    if (!a) return;
    drawer.open({
      title: a.title,
      subtitle: a.artifactType ?? a.category,
      width: 560,
      body: <ArtifactDetailDrawerBody artifact={a} relatedArtifacts={artifacts.items} onOpenArtifact={handleOpenArtifact} />,
    });
  }, [artifacts.items, drawer]);

  const typeLabel = artifact
    ? (artifact.artifactType ?? artifact.category).replace(/_/g, ' ')
    : '';

  return (
    <div style={{ padding: '0 24px 32px', maxWidth: 860, margin: '0 auto' }}>
      <PageHeader
        title={loading ? 'Loading…' : (artifact?.title ?? 'Artifact not found')}
        subtitle={typeLabel || undefined}
        actions={
          <Link
            to="/"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 6,
              border: '1px solid var(--border)',
              textDecoration: 'none',
              color: 'var(--muted-foreground)',
              fontSize: 12,
            }}
          >
            <ArrowLeft size={12} /> Intelligence Terminal
          </Link>
        }
      />

      {loading && (
        <p className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Loading artifact…</p>
      )}

      {error && (
        <p className="ds-caption" style={{ color: 'var(--primary)' }}>{error}</p>
      )}

      {artifact && !loading && (
        <div className="ds-surface" style={{ padding: 24, borderRadius: 12 }}>
          <ArtifactDetailDrawerBody
            artifact={artifact}
            relatedArtifacts={artifacts.items}
            onOpenArtifact={handleOpenArtifact}
          />
        </div>
      )}

      <Disclaimer />
    </div>
  );
};
