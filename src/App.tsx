import CustomerPortalPage from './pages/CustomerPortalPage';
import JobsPreviewPage from './pages/JobsPreviewPage';

// Top-level routing via URL-Query (kein React-Router — Single-Page-Portal
// braucht keinen Overhead). ?preview=jobs öffnet die Multi-Job-Übersicht
// als Live-Vorschau; alle anderen ?preview=… Werte werden von
// CustomerPortalPage selbst behandelt (bewerbung/interesse/gebucht/…).
function App() {
  const preview =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('preview')
      : null;

  if (preview === 'jobs') {
    return <JobsPreviewPage />;
  }
  return <CustomerPortalPage />;
}

export default App;
