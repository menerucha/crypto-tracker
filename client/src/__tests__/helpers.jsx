import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { AppProvider } from '../context/AppContext.jsx';

export const makeCoin = (i, over = {}) => ({
  id: `coin-${i}`, symbol: `c${i}`, name: `Coin ${i}`, image: `/img/${i}.png`, price: 100 + i, marketCap: 1e9 * (50 - i), rank: i, volume: 1e7 * i,
  change1h: 0.1 * i, change24h: i % 2 ? 2.5 : -1.5, change7d: 5, high24h: 110 + i, low24h: 90 + i, sparkline: [1, 2, 3, 2, 4], ...over,
});

/** Installs a fake fetch. `routes`: [RegExp|string, (url, init) => body | {status, body}]. Returns the call log. */
export function mockApi(routes) {
  const calls = [];
  const fn = vi.fn(async (url, init = {}) => {
    const path = String(url).replace(/^\/api/, '');
    calls.push({ path, method: init.method || 'GET', headers: init.headers || {} });
    for (const [pat, handler] of routes) {
      if (typeof pat === 'string' ? path.startsWith(pat) : pat.test(path)) {
        const out = typeof handler === 'function' ? await handler(path, init) : handler;
        const status = out?.status ?? 200, body = out && 'body' in out ? out.body : out;
        return { ok: status >= 200 && status < 300, status, json: async () => body };
      }
    }
    return { ok: false, status: 404, json: async () => ({ error: { code: 'NOT_FOUND', message: `no mock for ${path}` } }) };
  });
  vi.stubGlobal('fetch', fn);
  calls.fn = fn;
  calls.paths = () => calls.map((c) => c.path);
  return calls;
}

export const renderApp = (ui, { route = '/' } = {}) => render(<MemoryRouter initialEntries={[route]}><AppProvider>{ui}</AppProvider></MemoryRouter>);
export const listBody = (coins, over = {}) => ({ source: 'live', page: 1, perPage: 20, total: coins.length, totalPages: 1, data: coins, ...over });
