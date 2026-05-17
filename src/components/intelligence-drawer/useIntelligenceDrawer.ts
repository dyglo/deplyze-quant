/**
 * useIntelligenceDrawer — minimal hook for drawer open/close lifecycle.
 *
 * Generic over the payload type so pages can stash whatever they need to
 * render alongside the drawer (a quote, a country entry, a yield point, etc).
 * Deep-linking (Wave G) plugs in here via an optional `urlKey` that mirrors
 * the open instrument into a query parameter.
 */
import { useCallback, useRef, useState } from 'react';

export interface DrawerState<T> {
  open: boolean;
  payload: T | null;
}

export interface UseIntelligenceDrawerReturn<T> {
  state: DrawerState<T>;
  open: (payload: T) => void;
  close: () => void;
  /** True between close-call and the close transition finishing. */
  closing: boolean;
}

const CLOSE_ANIMATION_MS = 240;

export function useIntelligenceDrawer<T>(): UseIntelligenceDrawerReturn<T> {
  const [state, setState] = useState<DrawerState<T>>({ open: false, payload: null });
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const open = useCallback((payload: T) => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setClosing(false);
    setState({ open: true, payload });
  }, []);

  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setState({ open: false, payload: null });
      setClosing(false);
      closeTimer.current = null;
    }, CLOSE_ANIMATION_MS);
  }, []);

  return { state, open, close, closing };
}
