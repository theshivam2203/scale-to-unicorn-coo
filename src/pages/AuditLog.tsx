import { useState } from 'react';
import { Download, ScrollText } from 'lucide-react';
import type { AuditKind } from '../domain/types';
import { useStore } from '../store/store';
import { fmtDateTime } from '../domain/util';
import type { Route } from '../router';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, cx, type Tone } from '../components/ui';

const KINDS: { k: AuditKind | 'all'; label: string; tone: Tone }[] = [
  { k: 'all', label: 'All', tone: 'neutral' },
  { k: 'proposed', label: 'Proposed', tone: 'brand' },
  { k: 'edited', label: 'Edited', tone: 'info' },
  { k: 'approved', label: 'Approved', tone: 'info' },
  { k: 'rejected', label: 'Rejected', tone: 'neutral' },
  { k: 'executed', label: 'Executed', tone: 'ok' },
  { k: 'created', label: 'Created', tone: 'neutral' },
  { k: 'updated', label: 'Updated', tone: 'neutral' },
  { k: 'command', label: 'Commands', tone: 'neutral' },
  { k: 'system', label: 'System', tone: 'warn' },
];
const toneOf = (k: AuditKind) => KINDS.find((x) => x.k === k)?.tone ?? 'neutral';

export function AuditLog({ route }: { route: Route }) {
  const audit = useStore((s) => s.audit);
  const leads = useStore((s) => s.leads);
  const openLead = useStore((s) => s.openLead);
  const [kind, setKind] = useState<AuditKind | 'all'>((route.params.get('kind') as AuditKind) ?? 'all');
  const list = audit.filter((a) => kind === 'all' || a.kind === kind);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(audit, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-coo-demo-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Append-only record of every proposed, edited, approved, rejected and executed action. All entries are from demo mode."
        actions={<Button icon={Download} onClick={exportJson}>Export JSON</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-1">
        {KINDS.map(({ k, label }) => (
          <button key={k} onClick={() => setKind(k)} className={cx('rounded-md px-2.5 py-1 text-xs font-medium', kind === k ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50')}>
            {label} <span className="ml-0.5 tabular-nums opacity-60">{k === 'all' ? audit.length : audit.filter((a) => a.kind === k).length}</span>
          </button>
        ))}
      </div>
      <Card>
        {list.length === 0 ? (
          <EmptyState icon={ScrollText} title="No entries" />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {list.map((a) => {
              const lead = leads.find((l) => l.id === a.leadId);
              return (
                <li key={a.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
                  <span className="w-40 shrink-0 text-[11px] tabular-nums text-zinc-500">{fmtDateTime(a.at)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={toneOf(a.kind)}>{a.kind}</Badge>
                      <span className="text-sm text-zinc-800">{a.message}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                      <span className="flex items-center gap-1"><Avatar name={a.actor === 'System' ? 'S Y' : a.actor} />{a.actor}</span>
                      {lead && <button className="text-brand-700 hover:underline" onClick={() => openLead(lead.id)}>{lead.name} · {lead.company}</button>}
                      {a.integration && <span>via {a.integration}</span>}
                      <span className="rounded bg-amber-50 px-1 font-medium uppercase tracking-wide text-amber-800">{a.mode}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
