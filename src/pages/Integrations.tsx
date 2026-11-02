import { useState } from 'react';
import { KeyRound, Lock, Plug, RotateCcw, ShieldCheck } from 'lucide-react';
import { INTEGRATIONS } from '../services';
import { EXECUTION_POLICY } from '../services/config';
import { useStore } from '../store/store';
import { navigate } from '../router';
import { Badge, Button, Card, CardHeader, Modal, PageHeader } from '../components/ui';

export function Integrations() {
  const resetDemo = useStore((s) => s.resetDemo);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="space-y-6">
      <PageHeader title="Integrations & Safety" subtitle="How the AI COO connects to your stack, and the rules it runs under." />

      <Card>
        <CardHeader title="Execution mode: Demo" subtitle="The only mode available in this build" icon={ShieldCheck} right={<Badge tone="warn" dot>DEMO</Badge>} />
        <ul className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5">
          {EXECUTION_POLICY.map((p) => (
            <li key={p} className="flex items-start gap-2 text-sm text-zinc-700"><Lock size={14} className="mt-0.5 shrink-0 text-emerald-600" />{p}</li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 border-t border-zinc-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-zinc-500">Demo data is stored in this browser only. Reset before presenting.</p>
          <Button icon={RotateCcw} onClick={() => setConfirm(true)}>Reset demo data</Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Integrations" subtitle="Each module talks to a service interface; the demo binds mock adapters" icon={Plug} />
        <ul className="divide-y divide-zinc-100">
          {INTEGRATIONS.map((i) => (
            <li key={i.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <div className="flex items-center gap-2"><span className="text-sm font-medium text-zinc-900">{i.name}</span><Badge>Not connected</Badge></div>
                <p className="text-xs text-zinc-500">{i.role}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-400"><KeyRound size={11} /> Server-side secrets: {i.env}</p>
              </div>
              <Badge tone="brand">Using: {i.adapter}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Architecture" subtitle="How real integrations replace the mocks" />
        <div className="grid gap-4 p-4 text-sm text-zinc-700 sm:p-5 md:grid-cols-3">
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Browser (this app)</h4>
            <p>React + TypeScript UI. Modules call <code className="rounded bg-zinc-100 px-1 text-xs">services.crm / email / tasks / audit</code> and the AI engine. No credentials are ever bundled.</p>
          </div>
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Server API (to add)</h4>
            <p>Holds GoHighLevel, Google OAuth, n8n and LLM secrets. Enforces the approval policy again server-side and writes the audit log to Supabase/PostgreSQL.</p>
          </div>
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Swap-in point</h4>
            <p><code className="rounded bg-zinc-100 px-1 text-xs">src/services/index.ts</code> — replace <code className="rounded bg-zinc-100 px-1 text-xs">mockCrm</code> with <code className="rounded bg-zinc-100 px-1 text-xs">GoHighLevelCrm</code>, <code className="rounded bg-zinc-100 px-1 text-xs">mockEmail</code> with <code className="rounded bg-zinc-100 px-1 text-xs">GmailService</code>.</p>
          </div>
        </div>
      </Card>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Reset demo data?"
        footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="primary" onClick={() => { resetDemo(); setConfirm(false); navigate('/'); }}>Reset</Button></>}
      >
        <p className="text-sm text-zinc-600">Restores the seeded scenario and clears command history.</p>
      </Modal>
    </div>
  );
}
