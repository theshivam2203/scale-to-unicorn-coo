import {
  AlertTriangle, ArrowRight, ArrowUpRight, Bot, Briefcase, CheckCircle2, ClipboardCheck, Clock, Database, Flame, Inbox, Mail, Sparkles, TrendingUp, UserPlus, Users, Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useStore } from '../store/store';
import { computeKpis, findBottleneck, followUpQueue, isTaskOverdue, ownerName } from '../domain/metrics';
import { buildBriefing } from '../services/ai/briefing';
import { hoursSinceTouch, isOpen, recommendAction } from '../services/ai/engine';
import { money, relTime } from '../domain/util';
import { navigate } from '../router';
import { Badge, Button, Card, CardHeader, PriorityBadge, cx } from '../components/ui';
import { APPROVAL_META } from '../components/ApprovalCard';

function Kpi({ label, value, hint, icon: Icon, tone = 'neutral', onClick, tag }: {
  label: string; value: string; hint: string; icon: LucideIcon; tone?: 'neutral' | 'danger' | 'brand' | 'ok'; onClick: () => void; tag?: string;
}) {
  const toneCls = { neutral: 'text-zinc-500 bg-zinc-100', danger: 'text-red-600 bg-red-50', brand: 'text-brand-700 bg-brand-50', ok: 'text-emerald-700 bg-emerald-50' }[tone];
  return (
    <button onClick={onClick} className="group min-w-0 rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-card transition hover:border-brand-300 hover:shadow-pop focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
      <div className="flex items-center justify-between">
        <span className={cx('rounded-md p-1.5', toneCls)}><Icon size={14} /></span>
        <span className="flex items-center gap-1.5">{tag && <Badge>{tag}</Badge>}<ArrowUpRight size={14} className="text-zinc-300 transition group-hover:text-brand-600" /></span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs font-medium text-zinc-700">{label}</div>
      <div className="mt-1 text-[11px] leading-snug text-zinc-500">{hint}</div>
    </button>
  );
}

interface TimelineEvent { at: string; icon: LucideIcon; tone: string; text: string; detail?: string; onClick: () => void; }

export function Dashboard() {
  const leads = useStore((s) => s.leads);
  const tasks = useStore((s) => s.tasks);
  const approvals = useStore((s) => s.approvals);
  const audit = useStore((s) => s.audit);
  const openLead = useStore((s) => s.openLead);
  const generateFollowUps = useStore((s) => s.generateFollowUps);
  const toast = useStore((s) => s.toast);

  const k = computeKpis(leads, approvals, audit);
  const queue = followUpQueue(leads);
  const brief = buildBriefing({ leads, tasks, approvals, audit });
  const bottleneck = findBottleneck(leads);
  const urgent = leads.filter((l) => isOpen(l) && l.urgentReason);
  const attention = [...urgent.map((l) => ({ lead: l })), ...queue.filter((q) => !q.lead.urgentReason).map((q) => ({ lead: q.lead }))].slice(0, 5);
  const pending = approvals.filter((a) => a.status === 'pending');

  // Business activity timeline, derived from current state.
  const events: TimelineEvent[] = [];
  for (const l of leads) {
    const form = l.activities.find((a) => a.type === 'form' && Date.now() - new Date(a.at).getTime() < 72 * 3_600_000);
    if (form) events.push({ at: form.at, icon: UserPlus, tone: 'bg-sky-50 text-sky-700', text: `New lead from ${l.source}: ${l.name} (${l.company})`, detail: money(l.value) + ' est. value', onClick: () => openLead(l.id) });
    const reply = l.activities.find((a) => a.type === 'email_in');
    if (reply && Date.now() - new Date(reply.at).getTime() < 48 * 3_600_000) events.push({ at: reply.at, icon: Inbox, tone: 'bg-sky-50 text-sky-700', text: `${l.name} replied${reply.simulated ? ' (simulated)' : ''}`, detail: reply.text, onClick: () => openLead(l.id) });
    if (l.urgentReason) events.push({ at: l.activities.find((a) => a.type === 'ai')?.at ?? l.stageEnteredAt, icon: Flame, tone: 'bg-red-50 text-red-700', text: `High-value opportunity identified: ${l.company} (${money(l.value)})`, detail: l.urgentReason, onClick: () => openLead(l.id) });
  }
  for (const { lead: l } of queue.filter((q) => q.lead.followUp !== 'draft_pending').slice(0, 4)) {
    const due = new Date(new Date(l.lastContactAt ?? l.createdAt).getTime() + 24 * 3_600_000).toISOString();
    events.push({ at: due, icon: Clock, tone: 'bg-amber-50 text-amber-800', text: `${l.name} has not received a follow-up for ${Math.round(hoursSinceTouch(l))} hours`, detail: `${l.company} · ${money(l.value)} · ${ownerName(l.ownerId)}`, onClick: () => openLead(l.id) });
  }
  for (const a of pending) {
    const crm = a.type === 'update_crm';
    events.push({ at: a.createdAt, icon: crm ? Database : a.type === 'send_email' ? Mail : ClipboardCheck, tone: 'bg-brand-50 text-brand-700', text: crm ? `CRM record needs updating: ${a.title.replace('Update CRM: ', '')}` : a.type === 'send_email' ? `AI-generated follow-up waiting for approval: ${a.title.replace('Send follow-up to ', '')}` : `Awaiting approval: ${a.title}`, onClick: () => navigate('/approvals') });
  }
  for (const t of tasks.filter((x) => isTaskOverdue(x))) {
    events.push({ at: t.dueAt, icon: AlertTriangle, tone: 'bg-red-50 text-red-700', text: `Team task overdue: ${t.title}`, detail: `${ownerName(t.ownerId)} · ${t.priority}`, onClick: () => navigate('/operations') });
  }
  for (const e of audit.filter((x) => x.kind === 'executed').slice(0, 5)) {
    events.push({ at: e.at, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700', text: e.message, detail: e.integration, onClick: () => (e.leadId ? openLead(e.leadId) : navigate('/audit')) });
  }
  events.sort((a, b) => b.at.localeCompare(a.at));

  const noDraftOverdue = queue.filter((q) => q.lead.followUp !== 'draft_pending').map((q) => q.lead.id);

  return (
    <div className="space-y-6">
      {/* Briefing hero */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-brand-700"><Sparkles size={14} /> AI COO · live summary of your business</div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">{brief.greeting}</h1>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">{brief.narrative}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="primary" icon={Workflow} onClick={() => navigate('/follow-up')}>Run follow-up autopilot</Button>
            <Button icon={Bot} onClick={() => navigate('/command')}>Ask the AI COO</Button>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Revenue at risk" value={money(k.revenueAtRisk, true)} hint={`Open deals past the 24h follow-up SLA`} icon={AlertTriangle} tone={k.revenueAtRisk ? 'danger' : 'ok'} onClick={() => navigate('/leads?view=overdue')} />
        <Kpi label="Leads requiring follow-up" value={String(k.leadsNeedingFollowUp)} hint={`${k.highValueNeglected} high-value (≥ $15k)`} icon={Clock} tone={k.leadsNeedingFollowUp ? 'danger' : 'ok'} onClick={() => navigate('/leads?view=overdue')} />
        <Kpi label="Open deals" value={String(k.openDeals)} hint={`${money(k.pipelineValue, true)} pipeline · ${money(k.weightedPipeline, true)} weighted`} icon={Briefcase} onClick={() => navigate('/leads?view=open')} />
        <Kpi label="Tasks completed by AI" value={String(k.aiCompleted)} hint="Executed actions in the audit log (simulated)" icon={Bot} tone="brand" onClick={() => navigate('/audit?kind=executed')} />
        <Kpi label="Pending approvals" value={String(k.pendingApprovals)} hint="Actions waiting on your decision" icon={ClipboardCheck} tone={k.pendingApprovals ? 'brand' : 'ok'} onClick={() => navigate('/approvals')} />
        <Kpi label="Est. revenue recovered" value={money(k.reengagedValue, true)} tag="Estimate" hint={k.reengagedCount ? `${k.reengagedCount} neglected deal${k.reengagedCount > 1 ? 's' : ''} re-engaged · ${money(k.verifiedRecovered, true)} verified won` : 'Pipeline value of neglected deals that re-engaged — none yet'} icon={TrendingUp} tone="ok" onClick={() => navigate('/revenue')} />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        {/* Needs attention */}
        <Card className="xl:col-span-3">
          <CardHeader
            title="Needs attention now"
            subtitle="Ranked by the AI COO's priority score"
            icon={Flame}
            right={noDraftOverdue.length > 0 && (
              <Button size="sm" variant="primary" icon={Sparkles} onClick={() => { const ids = generateFollowUps(noDraftOverdue); toast(`${ids.length} follow-up drafts added to the approval queue`); }}>
                Draft {noDraftOverdue.length} follow-up{noDraftOverdue.length > 1 ? 's' : ''}
              </Button>
            )}
          />
          {attention.length ? (
            <ul className="divide-y divide-zinc-100">
              {attention.map(({ lead: l }) => {
                const rec = recommendAction(l);
                const q = queue.find((x) => x.lead.id === l.id);
                return (
                  <li key={l.id}>
                    <button className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-zinc-50 sm:px-5" onClick={() => openLead(l.id)}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-zinc-900">{l.name}</span>
                          <span className="text-xs text-zinc-500">{l.company}</span>
                          {l.urgentReason ? <Badge tone="danger" dot>Immediate attention</Badge> : q && <PriorityBadge p={q.score.priority} />}
                          {l.followUp === 'draft_pending' && <Badge tone="brand">Draft ready</Badge>}
                        </div>
                        <p className="mt-0.5 text-xs text-zinc-600"><span className="font-medium text-zinc-800">{rec.action}.</span> {rec.why}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold tabular-nums text-zinc-900">{money(l.value)}</div>
                        <div className="text-[11px] text-zinc-500">{Math.round(hoursSinceTouch(l))}h since touch</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-5 py-10 text-center text-sm text-zinc-500"><CheckCircle2 className="mx-auto mb-2 text-emerald-500" />All open leads are within the follow-up SLA.</div>
          )}
          {bottleneck && (
            <div className="m-4 mt-0 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:mx-5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900"><Users size={13} /> Sales bottleneck detected</div>
              <p className="mt-1 text-xs text-amber-900/90">{bottleneck.summary}</p>
              <button className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-amber-900 hover:underline" onClick={() => navigate('/operations')}>
                See recommendation <ArrowRight size={12} />
              </button>
            </div>
          )}
        </Card>

        {/* Approvals */}
        <Card className="xl:col-span-2">
          <CardHeader title="Decisions awaiting you" subtitle={`${pending.length} pending`} icon={ClipboardCheck} right={<Button size="sm" variant="ghost" onClick={() => navigate('/approvals')}>Open queue <ArrowRight size={14} /></Button>} />
          {pending.length ? (
            <ul className="divide-y divide-zinc-100">
              {pending.slice(0, 6).map((a) => {
                const I = APPROVAL_META[a.type].icon;
                return (
                  <li key={a.id}>
                    <button className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-zinc-50 sm:px-5" onClick={() => navigate('/approvals')}>
                      <span className="mt-0.5 rounded-md bg-brand-50 p-1.5 text-brand-700"><I size={13} /></span>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-zinc-800">{a.title}</p>
                        <p className="text-[11px] text-zinc-500">{APPROVAL_META[a.type].label} · {relTime(a.createdAt)}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-5 py-10 text-center text-sm text-zinc-500">Nothing waiting on you.</div>
          )}
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader title="Business activity" subtitle="Live feed generated from CRM, tasks, approvals and the audit log" icon={Clock} />
        <ol className="divide-y divide-zinc-100">
          {events.slice(0, 12).map((e, i) => (
            <li key={i}>
              <button onClick={e.onClick} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-zinc-50 sm:px-5">
                <span className={cx('mt-0.5 rounded-md p-1.5', e.tone)}><e.icon size={13} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-800">{e.text}</p>
                  {e.detail && <p className="truncate text-[11px] text-zinc-500">{e.detail}</p>}
                </div>
                <span className="shrink-0 text-[11px] text-zinc-400">{relTime(e.at)}</span>
              </button>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
