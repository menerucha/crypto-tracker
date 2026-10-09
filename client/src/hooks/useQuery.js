import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, peek } from '../lib/api.js';

/**
 * Data hook with stale-while-revalidate semantics:
 *  - shows cached data instantly, then revalidates if it is older than `ttl`
 *  - `refreshMs` enables polling, which PAUSES while the tab is hidden and catches up on return
 *  - `keepPrevious` keeps the old result on screen while a new key loads (smooth pagination)
 *  - `enabled=false` defers fetching (e.g. inactive tabs)
 */
export function useQuery(path, { ttl = 30_000, refreshMs = 0, enabled = true, keepPrevious = false } = {}) {
  const [state, setState] = useState(() => {
    const c = path && enabled ? peek(path) : null;
    return { res: c?.res ?? null, error: null, loading: !c && enabled && !!path, refreshing: false, updatedAt: c?.at ?? null };
  });
  const seq = useRef(0), pathRef = useRef(path);

  const load = useCallback(async (force = false) => {
    if (!path || !enabled) return;
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: !s.res, refreshing: !!s.res, error: null }));
    try {
      const res = await apiGet(path, { ttl, force });
      if (id === seq.current) setState({ res, error: null, loading: false, refreshing: false, updatedAt: Date.now() });
    } catch (error) {
      if (id === seq.current) setState((s) => ({ ...s, error, loading: false, refreshing: false }));
    }
  }, [path, enabled, ttl]);

  // (Re)load whenever the key changes
  useEffect(() => {
    if (pathRef.current !== path) {
      pathRef.current = path;
      const c = path && enabled ? peek(path) : null;
      setState((s) => ({ res: c ? c.res : keepPrevious ? s.res : null, error: null, loading: !c && enabled && !!path, refreshing: false, updatedAt: c?.at ?? null }));
    }
    load(false);
    return () => { seq.current++; };            // ignore results of superseded requests
  }, [path, enabled, load, keepPrevious]);

  // Polling that respects page visibility
  useEffect(() => {
    if (!refreshMs || !enabled || !path) return undefined;
    const tick = () => { if (!document.hidden) load(true); };
    const iv = setInterval(tick, refreshMs);
    const onVis = () => { if (!document.hidden) { const c = peek(path); if (!c || Date.now() - c.at >= refreshMs) load(true); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [refreshMs, enabled, path, load]);

  return { data: state.res?.data ?? null, meta: state.res, source: state.res?.source ?? null, error: state.error, loading: state.loading, refreshing: state.refreshing, updatedAt: state.updatedAt, refetch: () => load(true) };
}
