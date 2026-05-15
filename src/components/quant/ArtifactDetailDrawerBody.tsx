import React, { useCallback, useState } from 'react';
import { Bookmark, BookmarkCheck, Copy, Download, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '../WorkspaceContext';
import { usePins } from '../../hooks/usePins';
import { ConfidenceBadge } from './ConfidenceBadge';
import { SignificanceMeter } from './SignificanceMeter';
import type { IntelligenceArtifact } from '../../types';

export const ArtifactDetailDrawerBody: React.FC<{ artifact: IntelligenceArtifact }> = ({ artifact }) => {
  const { currentWorkspace, currentProject } = useWorkspace();
  const { isPinned, pin, unpin } = usePins(currentWorkspace?.id ?? null, currentProject?.id ?? null);
  const [copied, setCopied] = useState(false);
  const [pinning, setPinning] = useState(false);

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
      <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
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
      </div>
    </div>
  );
};
