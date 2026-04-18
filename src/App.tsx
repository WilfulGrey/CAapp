import CustomerPortalPage from './pages/CustomerPortalPage';
import CustomerPortalPageClean from './pages/CustomerPortalPageClean';

function App() {
  const isClean = window.location.pathname === '/clean' || new URLSearchParams(window.location.search).has('clean');
  return isClean ? <CustomerPortalPageClean /> : <CustomerPortalPage />;
}

export default App;
