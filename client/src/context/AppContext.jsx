import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiGet, apiSend } from '../lib/api.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const readCurrency = () => { try { return localStorage.getItem('ct.currency') || 'usd'; } catch { return 'usd'; } };

export function AppProvider({ children }) {
  const [currency, setCurrencyState] = useState(readCurrency);
  const [watch, setWatch] = useState([]);
  const [toast, setToast] = useState(null);

  const setCurrency = useCallback((c) => { setCurrencyState(c); try { localStorage.setItem('ct.currency', c); } catch { /* private mode */ } }, []);
  const showToast = useCallback((message) => { setToast(message); setTimeout(() => setToast(null), 3500); }, []);

  useEffect(() => {
    let alive = true;
    apiGet('/watchlist?vs=usd', { ttl: 60_000 }).then((r) => { if (alive) setWatch(r.ids || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  /** Optimistic toggle: UI updates instantly, rolls back (with a message) if the server rejects it. */
  const toggleWatch = useCallback(async (id) => {
    const has = watch.includes(id), prev = watch;
    setWatch(has ? watch.filter((x) => x !== id) : [...watch, id]);
    try {
      const r = await apiSend(has ? 'DELETE' : 'POST', `/watchlist/${encodeURIComponent(id)}`);
      setWatch(r.ids);
    } catch (e) { setWatch(prev); showToast(e.message || 'Could not update watchlist'); }
  }, [watch, showToast]);

  const value = useMemo(() => ({ currency, setCurrency, watch, toggleWatch, toast }), [currency, setCurrency, watch, toggleWatch, toast]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
