import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { AuthPanel } from './AuthPanel';

export interface AuthGateOptions {
  /** Headline shown above the form, e.g. "Unlock Portfolio Intelligence". */
  title?: string;
  /** One-line value statement explaining what signing in enables. */
  description?: string;
  /** Start on the sign-up tab (default) or the sign-in tab. */
  defaultMode?: 'login' | 'register';
}

interface AuthGateContextValue {
  /** Open the contextual auth modal. If the user is already a full account this
   *  is a no-op and returns true so callers can proceed inline. */
  requireAuth: (opts?: AuthGateOptions) => boolean;
  /** True while the modal is visible. */
  isOpen: boolean;
}

const AuthGateContext = createContext<AuthGateContextValue>({
  requireAuth: () => true,
  isOpen: false,
});

const DEFAULT_TITLE = 'Unlock personalized intelligence';
const DEFAULT_DESC =
  'Create a free workspace to save research, build portfolios, and personalize your intelligence feed. Your current session carries over.';

/**
 * AuthGateProvider — the continuity layer for guest → account upgrades.
 *
 * Gated actions call `requireAuth({ title, description })`. For a guest this
 * opens a contextual modal (sharing AuthPanel with the full-page Login) without
 * navigating away, so the workflow is preserved. The modal auto-closes the
 * moment the session becomes a full (non-anonymous) account. For a full account
 * `requireAuth` is a no-op that returns true, letting callers gate inline:
 *
 *   if (!requireAuth({ title: 'Save this research' })) return;
 */
export const AuthGateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isGuest } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [opts, setOpts] = useState<AuthGateOptions>({});

  const requireAuth = useCallback((next?: AuthGateOptions): boolean => {
    if (!isGuest) return true;
    setOpts(next ?? {});
    setIsOpen(true);
    return false;
  }, [isGuest]);

  // Close automatically once the guest has upgraded to a full account.
  useEffect(() => {
    if (isOpen && !isGuest) setIsOpen(false);
  }, [isGuest, isOpen]);

  // Allow Escape to dismiss.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const close = () => setIsOpen(false);

  return (
    <AuthGateContext.Provider value={{ requireAuth, isOpen }}>
      {children}
      {isOpen && (
        <div className="ds-modal-backdrop" onClick={close}>
          <div
            className="ds-modal-container ds-fade-in"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '26rem', padding: 0, overflow: 'hidden' }}
            role="dialog"
            aria-modal="true"
          >
            {/* Institutional banner — frames the value, not a hard signup wall. */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '18px 20px',
              background: 'color-mix(in srgb, var(--primary) 8%, transparent)',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: 'color-mix(in srgb, var(--primary) 16%, transparent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Sparkles size={15} style={{ color: 'var(--primary)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--foreground)' }}>
                  {opts.title || DEFAULT_TITLE}
                </p>
                <p style={{ margin: '3px 0 0', fontSize: 11.5, lineHeight: 1.45, color: 'var(--muted-foreground)' }}>
                  {opts.description || DEFAULT_DESC}
                </p>
              </div>
              <button
                onClick={close}
                aria-label="Close"
                style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer', flexShrink: 0 }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <AuthPanel
                onSuccess={close}
                defaultMode={opts.defaultMode ?? 'register'}
                headline="Create your workspace"
                subcopy="Continue with Google or email — takes a few seconds."
              />
            </div>
          </div>
        </div>
      )}
    </AuthGateContext.Provider>
  );
};

export const useAuthGate = () => useContext(AuthGateContext);
