import { useState } from 'react';
import { Check, ClipboardCheck, Play, Radar, Sparkles, Workflow, X } from 'lucide-react';
import type { Approval, Lead } from '../domain/types';
import { useStore } from '../store/store';
import { followUpQueue, ownerName } from '../domain/metrics';
import { money, relTime } from '../domain/util';
import { FOLLOW_UP_SLA_HOURS, hoursSinceTouch, recommendAction, scoreLead } from '../services/ai/engine';
import { ApprovalCard } from '../components/ApprovalCard';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, PriorityBadge, Spinner, cx } from '../components/ui';

const STEPS = ['Identify', 'Score', 'Recommend', 'Draft', 'Review', 'Approve', 'Send (sim.)', 'Update CRM', 'Schedule next', 'Audit'];
const PHASES = ['Scanning CRM for leads past the 24h SLA…', 'Scoring leads on value, stage, delay, source and signals…', 'Choosing the next best action for each lead…', 'Writing personalised drafts from each lead’s context…'];

/** How far a lead has progressed through the 10-step workflow. */
function progress(l: Lead, a?: Approval): { step: number; rejected: boolean } {
  if (!a) return { step: 3, rejected: false }; // identified, scored, recommended
  if (a.status === 'rejected') return { step: 5, rejected: true };
  if (a.status === 'pending') return { step: 5, rejected: false }; // drafted, in review
  if (a.status === 'approved') return { step: 6, rejected: false };
  return { step: l.nextFollowUpAt ? 10 : 8, rejected: false };
}

export function FollowUp() {
  const leads = useStore((s) => s.leads);
  const approvals = useStore((s) => s.approvals);
  const generateFollowUps = useStore((s) => s.generateFollowUps);
  const openLead = useStore((s) => s.openLead);
  const [phase, setPhase] = useState<number | null>(null);
  const [lastRun, setLastRun] = useState<number | null>(null);

  const queue = followUpQueue(leads);
  const emailApprovals = approvals.filter((a) => a.type === 'send_email');
  const latestFor = (leadId: string) => emailApprovals.find((a) => a.leadId === leadId);
  // Leads in the workflow: currently overdue, or handled by the workflow this session.
  const handled = leads.filter((l) => !queue.some((q) => q.lead.id === l.id) && emailApprovals.some((a) => a.leadId === l.id && a.status !== 'pending' && a.decidedAt && Date.now() - new Date(a.decidedAt).getTime() < 12 * 3_600_000));
  const rows = [...queue.map((q) => q.lead), ...handled];
  const toDraft = queue.filter((q) => q.lead.followUp !== 'draft_pending').map((q) => q.lead.id);
  const pending = emailApprovals.filter((a) => a.status === 'pending' || a.status === 'approved');
  const done = emailApprovals.filter((a) => (a.status === 'executed' || a.status === 'rejected') && a.decidedAt && Date.now() - new Date(a.decidedAt).getTime() < 12 * 3_600_000);

  const run = () => {
    setPhase(0);
    PHASES.forEach((_, i) => setTimeout(() => setPhase(i), i * 700));
    setTimeout(() => {
      const ids = generateFollowUps(toDraft);
      setLastRun(ids.length);
      setPhase(null);
    }, PHASES.length * 700);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Follow-up Autopilot"
        subtitle={`Finds leads waiting more than ${FOLLOW_UP_SLA_HOURS}h, scores them, drafts personalised follow-ups and routes each one to you for approval.`}
        actions={
          <Button variant="primary" icon={phase !== null ? undefined : Play} loading={phase !== null} onClick={run} disabled={phase !== null || toDraft.length === 0}>
            {phase !== null ? 'Running…' : toDraft.length ? `Run autopilot on ${toDraft.length} lead${toDraft.length > 1 ? 's' : ''}` : 'All overdue leads have drafts'}
          </Button>
        }
      />

      {/* Workflow steps */}
      <Card className="p-4">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:grid-cols-10">
          {STEPS.map((s, i) => (
            <li key={s} className={cx('rounded-lg border px-2.5 py-2', i < 4 ? 'border-brand-200 bg-brand-50/50' : i < 6 ? 'border-amber-200 bg-amber-50/50' : 'border-emerald-200 bg-emerald-50/40')}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Step {i + 1}</div>
              <div className="text-xs font-medium text-zinc-800">{s}</div>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-brand-300" />AI prepares</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-300" />You decide</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-300" />Executed in demo mode (simulated)</span>
        </div>
      </Card>

      {phase !== null && (
        <Card className="animate-fadein p-4">
          <div className="space-y-2">
            {PHASES.map((p, i) => (
              <div key={p} className={cx('flex items-center gap-2 text-sm', i > phase ? 'text-zinc-300' : i === phase ? 'text-zinc-900' : 'text-zinc-500')}>
                {i < phase ? <Check size={14} className="text-emerald-600" /> : i === phase ? <Spinner className="text-brand-600" /> : <Radar size={14} />}
                {p}
              </div>
            ))}
          </div>
        </Card>
      )}
      {lastRun !== null && phase === null && (
        <div className="animate-fadein rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
          <Sparkles size={14} className="mr-1.5 inline" />
          Autopilot drafted {lastRun} follow-up{lastRun === 1 ? '' : 's'}. Review them below — nothing is sent until you approve, and even then only in demo mode.
        </div>
      )}

      {/* Queue */}
      <Card>
        <CardHeader title="Leads in the workflow" subtitle={`${queue.length} past SLA · ${money(queue.reduce((x, q) => x + q.lead.value, 0))} pipeline waiting`} icon={Workflow} />
        {rows.length === 0 ? (
          <EmptyState icon={Check} title="No leads are waiting on a follow-up" text="Every open lead has been contacted in the last 24 hours." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2.5">Lead</th><th className="px-3 py-2.5">Waiting</th><th className="px-3 py-2.5">Score</th>
                  <th className="px-3 py-2.5">Recommended action</th><th className="px-4 py-2.5">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((l) => {
                  const sc = scoreLead(l);
                  const a = latestFor(l.id);
                  const p = progress(l, a);
                  return (
                    <tr key={l.id} className="cursor-pointer hover:bg-zinc-50" onClick={() => openLead(l.id)}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-zinc-900">{l.name}</div>
                        <div className="text-xs text-zinc-500">{l.company} · {l.status} · {money(l.value)} · {ownerName(l.ownerId).split(' ')[0]}</div>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {a?.status === 'executed' ? <span className="text-emerald-700">contacted {relTime(l.lastContactAt)}</span> : <span className="font-medium text-red-700">{Math.round(hoursSinceTouch(l))}h</span>}
                      </td>
                      <td className="px-3 py-2.5">{a?.status === 'executed' ? <span className="text-xs text-zinc-400">—</span> : <div className="flex items-center gap-1.5"><PriorityBadge p={sc.priority} /><span className="text-[11px] tabular-nums text-zinc-400">{sc.total}</span></div>}</td>
                      <td className="max-w-[260px] px-3 py-2.5 text-xs text-zinc-700">{recommendAction(l).action}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-0.5">
                          {STEPS.map((s, i) => (
                            <span key={s} title={s} className={cx('h-1.5 w-4 rounded-full', p.rejected && i === 4 ? 'bg-zinc-400' : i < p.step ? (i < 4 ? 'bg-brand-500' : i < 6 ? 'bg-amber-400' : 'bg-emerald-500') : 'bg-zinc-200')} />
                          ))}
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-500">
                          {p.rejected ? <span className="inline-flex items-center gap-1"><X size={10} /> Draft rejected — back to due</span> : a?.status === 'executed' ? `Sent (simulated) · next touch ${relTime(l.nextFollowUpAt)}` : a?.status === 'approved' ? 'Executing…' : a ? 'Draft awaiting approval' : 'Ready to draft'}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Review */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900"><ClipboardCheck size={16} className="text-zinc-400" /> Drafts awaiting your review <Badge tone="warn">{pending.length}</Badge></h2>
        </div>
        {pending.length ? (
          <div className="grid gap-4 xl:grid-cols-2">{pending.map((a) => <ApprovalCard key={a.id} a={a} />)}</div>
        ) : (
          <Card><EmptyState icon={ClipboardCheck} title="No drafts waiting" text={toDraft.length ? 'Run the autopilot to draft follow-ups for overdue leads.' : 'All caught up.'} /></Card>
        )}
      </div>

      {done.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Completed in this session</h2>
          <div className="grid gap-4 xl:grid-cols-2">{done.map((a) => <ApprovalCard key={a.id} a={a} />)}</div>
        </div>
      )}
    </div>
  );
}
