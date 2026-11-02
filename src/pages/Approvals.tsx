import { useState } from 'react';
import { ClipboardCheck, ShieldCheck } from 'lucide-react';
import type { ApprovalStatus, ApprovalType } from '../domain/types';
import { useStore } from '../store/store';
import { APPROVAL_META, ApprovalCard } from '../components/ApprovalCard';
import { Card, EmptyState, PageHeader, cx } from '../components/ui';

const TABS: { key: 'pending' | ApprovalStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'Awaiting approval' },
  { key: 'executed', label: 'Completed (simulated)' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

export function Approvals() {
  const approvals = useStore((s) => s.approvals);
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('pending');
  const [type, setType] = useState<ApprovalType | 'all'>('all');
  // Cards decided during this visit stay in the "Awaiting" tab so the outcome is visible in place.
  const [openedAt] = useState(() => new Date().toISOString());
  const decidedHere = (a: (typeof approvals)[number]) => !!a.decidedAt && a.decidedAt >= openedAt;

  const count = (k: string) => approvals.filter((a) => (k === 'all' ? true : k === 'pending' ? a.status === 'pending' || a.status === 'approved' : a.status === k)).length;
  const list = approvals
    .filter((a) => (tab === 'all' ? true : tab === 'pending' ? a.status === 'pending' || a.status === 'approved' || decidedHere(a) : a.status === tab))
    .filter((a) => type === 'all' || a.type === type)
    .sort((a, b) => (tab === 'pending' ? b.createdAt.localeCompare(a.createdAt) : (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt)));

  return (
    <div>
      <PageHeader title="Approval Queue" subtitle="Every action the AI COO prepares that touches a lead, the CRM, a calendar or the team waits here for a human decision." />

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs text-zinc-600 shadow-card">
        <ShieldCheck size={16} className="mt-px shrink-0 text-emerald-600" />
        <span>
          <b className="text-zinc-800">Demo-mode execution.</b> Approving runs the action against mock services only: emails are not delivered, the live CRM is not modified and no invites or notifications are sent.
          Impact figures are estimates, not revenue. Edits, approvals and rejections (with reasons) are written to the audit log.
        </span>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg bg-zinc-100 p-1">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={cx('rounded-md px-3 py-1.5 text-xs font-medium transition', tab === t.key ? 'bg-white text-zinc-900 shadow-card' : 'text-zinc-600 hover:text-zinc-900')}>
              {t.label} <span className="ml-1 tabular-nums text-zinc-400">{count(t.key)}</span>
            </button>
          ))}
        </div>
        <select className="h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-700" value={type} onChange={(e) => setType(e.target.value as ApprovalType | 'all')} aria-label="Action type">
          <option value="all">All action types</option>
          {Object.entries(APPROVAL_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {list.length ? (
        <div className="grid gap-4 xl:grid-cols-2">{list.map((a) => <ApprovalCard key={a.id} a={a} />)}</div>
      ) : (
        <Card><EmptyState icon={ClipboardCheck} title={tab === 'pending' ? 'Nothing awaiting approval' : 'No actions here yet'} text={tab === 'pending' ? 'Ask the AI COO to prepare follow-ups, or run the follow-up autopilot.' : undefined} /></Card>
      )}
    </div>
  );
}
