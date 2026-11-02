import { useRoute } from './router';
import { Layout } from './components/Layout';
import { LeadDrawer } from './components/LeadDrawer';
import { Dashboard } from './pages/Dashboard';
import { CommandCenter } from './pages/CommandCenter';
import { Leads } from './pages/Leads';
import { FollowUp } from './pages/FollowUp';
import { Approvals } from './pages/Approvals';
import { Operations } from './pages/Operations';
import { Revenue } from './pages/Revenue';
import { Briefing } from './pages/Briefing';
import { AuditLog } from './pages/AuditLog';
import { Integrations } from './pages/Integrations';

export default function App() {
  const route = useRoute();
  const page = (() => {
    switch (route.path) {
      case '/command': return <CommandCenter />;
      case '/leads': return <Leads route={route} />;
      case '/follow-up': return <FollowUp />;
      case '/approvals': return <Approvals />;
      case '/operations': return <Operations />;
      case '/revenue': return <Revenue />;
      case '/briefing': return <Briefing />;
      case '/audit': return <AuditLog key={route.params.get('kind') ?? 'all'} route={route} />;
      case '/integrations': return <Integrations />;
      default: return <Dashboard />;
    }
  })();
  return (
    <Layout path={route.path}>
      <div key={route.path} className="animate-fadein">{page}</div>
      <LeadDrawer />
    </Layout>
  );
}
