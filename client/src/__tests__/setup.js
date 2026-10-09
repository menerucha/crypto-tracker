import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { clearCache } from '../lib/api.js';

// recharts' ResponsiveContainer needs ResizeObserver (jsdom has none)
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

beforeEach(() => { clearCache(); localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
