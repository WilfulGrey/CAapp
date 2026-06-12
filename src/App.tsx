import CustomerPortalPage from './pages/CustomerPortalPage';
import JobsPreviewPage from './pages/JobsPreviewPage';
import JobsOverviewPage from './pages/JobsOverviewPage';

// Top-level routing via URL-Query (kein React-Router — Single-Page-Portal
// braucht keinen Overhead).
//   ?view=jobs    → ECHTE Multi-Job-Übersicht (onboard + listLeadJobs,
//                   braucht ?token=…). Karten deep-linken nach ?token&job=…
//   ?preview=jobs → Design-Mock derselben Übersicht (Mock-Daten, kein Token)
//   sonst         → CustomerPortalPage (behandelt ?preview=bewerbung/… selbst)
function App() {
  const params =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();

  if (params.get('view') === 'jobs') {
    return <JobsOverviewPage />;
  }
  if (params.get('preview') === 'jobs') {
    return <JobsPreviewPage />;
  }
  return <CustomerPortalPage />;
}

export default App;
