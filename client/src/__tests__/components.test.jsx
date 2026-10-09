import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Pagination from '../components/Pagination.jsx';
import { downsample } from '../components/PriceChartPanel.jsx';
import { makeCoin } from './helpers.jsx';

const sparkRenders = vi.fn();
vi.mock('../components/Sparkline.jsx', () => ({ default: (props) => { sparkRenders(props); return <i data-testid="spark" />; } }));
const { default: CoinTable } = await import('../components/CoinTable.jsx');

describe('CoinTable render optimisation', () => {
  it('does not re-render rows when a refresh returns identical data in new objects', () => {
    sparkRenders.mockClear();
    const mk = () => Array.from({ length: 20 }, (_, i) => makeCoin(i + 1));
    const props = { currency: 'usd', watch: [], onToggle: () => {} };
    const { rerender } = render(<MemoryRouter><CoinTable coins={mk()} {...props} /></MemoryRouter>);
    expect(sparkRenders).toHaveBeenCalledTimes(20);
    rerender(<MemoryRouter><CoinTable coins={mk()} {...props} /></MemoryRouter>);       // fresh object identities, same values
    expect(sparkRenders).toHaveBeenCalledTimes(20);                                      // no row re-rendered
    const changed = mk(); changed[3] = { ...changed[3], price: 999 };
    rerender(<MemoryRouter><CoinTable coins={changed} {...props} /></MemoryRouter>);
    const extra = sparkRenders.mock.calls.length - 20;
    expect(extra).toBeGreaterThanOrEqual(1); expect(extra).toBeLessThanOrEqual(2);       // only the changed row (value + flash state), not all 20
    expect(screen.getByText('$999.00')).toBeInTheDocument();
  });
  it('re-renders just the toggled row when the watchlist changes', () => {
    sparkRenders.mockClear(); const coins = Array.from({ length: 10 }, (_, i) => makeCoin(i + 1)); const p = { currency: 'usd', onToggle: () => {} };
    const { rerender } = render(<MemoryRouter><CoinTable coins={coins} watch={[]} {...p} /></MemoryRouter>);
    rerender(<MemoryRouter><CoinTable coins={coins} watch={['coin-2']} {...p} /></MemoryRouter>);
    expect(sparkRenders).toHaveBeenCalledTimes(11);
  });
});

describe('Pagination', () => {
  it('renders windowed page buttons with ellipsis and navigates', async () => {
    const onChange = vi.fn(); render(<Pagination page={5} totalPages={20} onChange={onChange} />);
    expect(screen.getByRole('button', { name: '5' })).toHaveAttribute('aria-current', 'page'); expect(screen.getAllByText('…')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Next →' })); expect(onChange).toHaveBeenCalledWith(6);
    await userEvent.click(screen.getByRole('button', { name: '20' })); expect(onChange).toHaveBeenCalledWith(20);
  });
  it('disables prev on first page and renders nothing for a single page', () => {
    const { container, rerender } = render(<Pagination page={1} totalPages={3} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '← Prev' })).toBeDisabled(); rerender(<Pagination page={1} totalPages={1} onChange={() => {}} />); expect(container).toBeEmptyDOMElement();
  });
});

describe('chart helpers', () => {
  it('downsample caps points, keeps first/last, and leaves small arrays alone', () => {
    const big = Array.from({ length: 5000 }, (_, i) => i), out = downsample(big, 400);
    expect(out.length).toBeLessThanOrEqual(401); expect(out[0]).toBe(0); expect(out.at(-1)).toBe(4999);
    const small = [1, 2, 3]; expect(downsample(small, 400)).toBe(small);
  });
});
