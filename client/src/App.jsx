import { lazy, Suspense } from 'react';
import { Route, Routes, Link } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';          // first screen: shipped in the main bundle
import { Spinner } from './components/Common.jsx';

// Everything else is code-split and fetched on first navigation
const CoinPage = lazy(() => import('./pages/CoinPage.jsx'));
const Converter = lazy(() => import('./pages/Converter.jsx'));
const Watchlist = lazy(() => import('./pages/Watchlist.jsx'));

const NotFound = () => <div className="empty"><h1>404</h1><p>That page doesn’t exist. <Link to="/">Back to markets</Link></p></div>;

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="coin/:id" element={<CoinPage />} />
          <Route path="convert" element={<Converter />} />
          <Route path="watchlist" element={<Watchlist />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
