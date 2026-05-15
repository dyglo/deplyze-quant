import React, { useCallback, useState } from 'react';
import { Bookmark, BookmarkCheck, BookmarkPlus, Copy, Download, Check } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { useWorkspace } from '../WorkspaceContext';
import { usePins } from '../../hooks/usePins';
import { ConfidenceBadge } from './ConfidenceBadge';
import { SignificanceMeter } from './SignificanceMeter';
import { Progress, ProgressTrack, ProgressIndicator, ProgressLabel, ProgressValue } from '../ui/progress';
import { saveArtifact, unsaveArtifact } from '../../services/artifactService';
import type { IntelligenceArtifact } from '../../types';

interface Props {
  artifact: IntelligenceArtifact;
  relatedArtifacts?: IntelligenceArtifact[];
  onOpenArtifact?: (id: string) => void;
}

// ─── Freshness helper ────────────────────────────────────────────────────────

function resolveTimestamp(ts: number | { toMillis: () => number } | undefined): number | undefined {
  if (ts == null) return undefined;
  if (typeof ts === 'number') return ts;
  if (typeof (ts as { toMillis?: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return undefined;
}

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const h = Math.floor(diffMs / (1000 * 60 * 60));
  if (h < 2) return `${h}h ago`;
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}

function freshnessColor(ts: number): string {
  const diffMs = Date.now() - ts;
  const h = diffMs / (1000 * 60 * 60);
  if (h > 72) return 'var(--muted-foreground)';
  if (h > 24) return '#b8860b';
  return 'var(--foreground)';
}

export const ArtifactDetailDrawerBody: React.FC<Props> = ({
  artifact,
  relatedArtifacts,
  onOpenArtifact,
}) => {
  const { currentWorkspace, currentProject } = useWorkspace();
  const { isPinned, pin, unpin } = usePins(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const [copied, setCopied] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [saved, setSaved] = useState(artifact.saved ?? false);
  const [saving, setSaving] = useState(false);

  const pinned = isPinned(artifact.id);

  const handlePin = useCallback(async () => {
    if (!currentWorkspace?.id || !currentProject?.id) return;
    setPinning(true);
    try {
      if (pinned) {
        await unpin(artifact.id);
        toast.success('Unpinned');
      } else {
        await pin(artifact.id);
        toast.success('Pinned to workspace');
      }
    } catch {
      toast.error('Failed to update pin');
    } finally {
      setPinning(false);
    }
  }, [pinned, pin, unpin, artifact.id, currentWorkspace, currentProject]);

  const handleSave = useCallback(async () => {
    if (!currentWorkspace?.id || !currentProject?.id) return;
    setSaving(true);
    try {
      if (saved) {
        await unsaveArtifact(currentWorkspace.id, currentProject.id, artifact.id);
        setSaved(false);
        toast.success('Unsaved');
      } else {
        await saveArtifact(currentWorkspace.id, currentProject.id, artifact.id);
        setSaved(true);
        toast.success('Saved');
      }
    } catch {
      toast.error('Failed');
    } finally {
      setSaving(false);
    }
  }, [saved, artifact.id, currentWorkspace, currentProject]);

  const handleCopy = useCallback(() => {
    const text = `${artifact.title}\n\n${artifact.narrative}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [artifact]);

  const handleExport = useCallback(() => {
    const rows = [
      ['Label', 'Value', 'Source'],
      ...(artifact.evidence ?? []).map((e) => [String(e.label), String(e.value), String(e.source ?? '')]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `artifact-${artifact.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [artifact]);

  const handleExportJson = useCallback(() => {
    const json = JSON.stringify(artifact, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `artifact-${artifact.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [artifact]);

  // ─── Derived values ────────────────────────────────────────────────────────

  const confidenceScore = artifact.confidenceScore ?? artifact.confidence;
  const completenessScore = artifact.completenessScore;

  const freshnessTs = resolveTimestamp(
    (artifact.updatedAt ?? artifact.createdAt) as number | { toMillis: () => number } | undefined,
  );

  const hasMetaChips =
    (artifact.relatedSymbols?.length ?? 0) > 0 ||
    (artifact.relatedMacroIndicators?.length ?? 0) > 0 ||
    (artifact.tags?.length ?? 0) > 0;

  // Related artifacts that share at least one symbol with this artifact
  const filteredRelated = (relatedArtifacts ?? [])
    .filter(
      (item) =>
        item.id !== artifact.id &&
        item.symbols?.some((s) => artifact.symbols?.includes(s)),
    )
    .slice(0, 3);

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Header meta */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="ds-label" style={{ color: 'var(--muted-foreground)', textTransform: 'capitalize' }}>
          {artifact.category}
        </span>
        {artifact.symbols?.map((s) => (
          <span key={s} className="ds-badge">{s}</span>
        ))}
        <ConfidenceBadge score={artifact.confidence} />
      </div>

      {/* Narrative */}
      <p className="ds-body" style={{ margin: 0, lineHeight: 1.6 }}>{artifact.narrative}</p>

      {/* Markdown body */}
      {artifact.body && (
        <div className="ds-markdown" style={{ lineHeight: 1.6, fontSize: 13 }}>
          <ReactMarkdown>{artifact.body}</ReactMarkdown>
        </div>
      )}

      {/* V2 metadata chips */}
      {hasMetaChips && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {artifact.relatedSymbols?.map((s) => (
            <span key={s} className="ds-badge">{s}</span>
          ))}
          {artifact.relatedMacroIndicators?.map((m) => (
            <span
              key={m}
              style={{ background: '#1a3a3d', color: '#4ec5cc', borderRadius: 4, padding: '2px 6px', fontSize: 11 }}
            >
              {m}
            </span>
          ))}
          {artifact.tags?.map((t) => (
            <span key={t} className="ds-badge" style={{ color: 'var(--muted-foreground)' }}>{t}</span>
          ))}
        </div>
      )}

      {/* Confidence + Completeness bars */}
      {confidenceScore != null && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* Confidence */}
          <div>
            <Progress value={confidenceScore * 100}>
              <ProgressLabel>Confidence</ProgressLabel>
              <ProgressValue>{Math.round(confidenceScore * 100)}%</ProgressValue>
              <ProgressTrack>
                <ProgressIndicator />
              </ProgressTrack>
            </Progress>
          </div>
          {/* Completeness */}
          {completenessScore != null && (
            <div>
              <Progress value={completenessScore * 100}>
                <ProgressLabel>Completeness</ProgressLabel>
                <ProgressValue>{Math.round(completenessScore * 100)}%</ProgressValue>
                <ProgressTrack>
                  <ProgressIndicator />
                </ProgressTrack>
              </Progress>
            </div>
          )}
        </div>
      )}

      {/* Freshness row */}
      {freshnessTs != null && (
        <p
          className="ds-caption"
          style={{ margin: 0, color: freshnessColor(freshnessTs) }}
        >
          Updated {relativeTime(freshnessTs)}
        </p>
      )}

      {/* Source references */}
      {artifact.sourceReferences?.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span className="ds-caption" style={{ color: 'var(--muted-foreground)', marginRight: 4 }}>Sources</span>
          {artifact.sourceReferences.map((ref, i) => (
            <span
              key={i}
              className="ds-caption"
              style={{ color: 'var(--muted-foreground)', display: 'inline-block' }}
            >
              {ref}
            </span>
          ))}
        </div>
      ) : null}

      {/* Evidence */}
      {artifact.evidence?.length ? (
        <section>
          <h4 className="ds-label" style={{ margin: '0 0 8px', color: 'var(--muted-foreground)' }}>Evidence</h4>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
            {artifact.evidence.map((e, i) => (
              <li key={i} className="ds-caption" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: 'var(--muted-foreground)' }}>{e.label}</span>
                <span>
                  {String(e.value)}
                  {e.source && e.source !== 'derived' ? (
                    <span style={{ color: 'var(--muted-foreground)', marginLeft: 4 }}>· {String(e.source)}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Significance */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="ds-caption" style={{ color: 'var(--muted-foreground)' }}>Significance</span>
        <SignificanceMeter value={artifact.significance ?? 0} />
      </div>

      {/* Timestamp */}
      <p className="ds-caption" style={{ color: 'var(--muted-foreground)', margin: 0 }}>
        Generated {new Date(artifact.createdAt).toLocaleString()}
        {artifact.agentId ? ` · ${artifact.agentId}` : ''}
      </p>

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 16, flexWrap: 'wrap' }}>
        <button
          onClick={handlePin}
          disabled={pinning}
          className="ds-btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
        >
          {pinned ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
          {pinned ? 'Pinned' : 'Pin'}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="ds-btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
        >
          {saved ? <BookmarkCheck size={14} /> : <BookmarkPlus size={14} />}
          {saved ? 'Saved' : 'Save'}
        </button>
        <button
          onClick={handleCopy}
          className="ds-btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          onClick={handleExport}
          className="ds-btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
        >
          <Download size={14} />
          Export CSV
        </button>
        <button
          onClick={handleExportJson}
          className="ds-btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
        >
          <Download size={14} />
          Export JSON
        </button>
      </div>

      {/* Related Intelligence */}
      {filteredRelated.length > 0 && (
        <section>
          <h4 className="ds-label" style={{ margin: '0 0 8px', color: 'var(--muted-foreground)' }}>Related Intelligence</h4>
          <div style={{ display: 'grid', gap: 6 }}>
            {filteredRelated.map((item) => {
              const itemTs = resolveTimestamp(
                (item.updatedAt ?? item.createdAt) as number | { toMillis: () => number } | undefined,
              );
              const typeLabel = item.artifactType ?? item.category;
              const truncatedTitle =
                item.title.length > 60 ? item.title.slice(0, 60) + '…' : item.title;
              return (
                <button
                  key={item.id}
                  onClick={() => onOpenArtifact?.(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    textAlign: 'left',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    cursor: 'pointer',
                    color: 'inherit',
                    width: '100%',
                  }}
                >
                  <span className="ds-badge" style={{ flexShrink: 0, textTransform: 'capitalize' }}>
                    {typeLabel}
                  </span>
                  <span className="ds-caption" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {truncatedTitle}
                  </span>
                  {itemTs != null && (
                    <span className="ds-caption" style={{ color: 'var(--muted-foreground)', flexShrink: 0 }}>
                      {relativeTime(itemTs)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
