/**
 * Client-side session id generator.
 *
 * A session ends after 30 minutes of inactivity — same threshold the
 * sessionizer applies on the BigQuery side, so client/server session_ids
 * stay roughly aligned. The id format is deliberately opaque; the engine
 * re-derives sessions from event timestamps independently.
 */

const STORAGE_KEY = 'deplyze.v5.session';
const SESSION_GAP_MS = 30 * 60 * 1000;

interface SessionState {
  id: string;
  lastActivityAt: number;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function newId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `s_${Date.now()}_${rand}`;
}

function read(): SessionState | null {
  const s = safeStorage();
  if (!s) return null;
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionState;
    if (!parsed.id || typeof parsed.lastActivityAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(state: SessionState): void {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full / private mode — accept loss */
  }
}

/** Returns the active session id, rolling over after SESSION_GAP_MS. */
export function getSessionId(): string {
  const now = Date.now();
  const current = read();
  if (current && now - current.lastActivityAt <= SESSION_GAP_MS) {
    write({ id: current.id, lastActivityAt: now });
    return current.id;
  }
  const next = { id: newId(), lastActivityAt: now };
  write(next);
  return next.id;
}

/** Force a new session id — call on explicit logout. */
export function rotateSession(): void {
  write({ id: newId(), lastActivityAt: Date.now() });
}
