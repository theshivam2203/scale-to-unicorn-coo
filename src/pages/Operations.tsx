import { useState } from 'react';
import { AlertTriangle, Ban, Bot, CalendarClock, Check, CheckCircle2, Plus, Sparkles, Users, X } from 'lucide-react';
import type { Task, TaskPriority, TaskStatus } from '../domain/types';
import { useStore } from '../store/store';
import { CLIENTS, TEAM } from '../domain/seed';
import { findBottleneck, isTaskDueToday, isTaskOverdue, ownerName } from '../domain/metrics';
import { fmtDate, relTime } from '../domain/util';
import { isOverdue } from '../services/ai/engine';
import { TaskForm } from '../components/LeadDrawer';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, PageHeader, TaskStatusBadge, cx } from '../components/ui';

const PRIORITIES: TaskPriority[] = ['Urgent', 'High', 'Medium', 'Low'];
const RANK: Record<TaskPriority, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

function TaskRow({ t }: { t: Task }) {
  const { completeTask, updateTask, openLead, acceptSuggestion, dismissSuggestion } = useStore();
  const lead = useStore((s) => s.leads.find((l) => l.id === t.leadId));
  const client = CLIENTS.find((c) => c.id === t.clientId);
  const overdue = isTaskOverdue(t);
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {t.status === 'suggested' ? (
          <span className="mt-0.5 rounded-md bg-brand-50 p-1 text-brand-700"><Sparkles size={13} /></span>
        ) : (
          <button
            onClick={() => completeTask(t.id)}
            disabled={t.status === 'done'}
            aria-label="Mark complete"
            className={cx('mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border', t.status === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-zinc-300 hover:border-emerald-500')}
          >
            {t.status === 'done' && <Check size={11} />}
          </button>
        )}
        <div className="min-w-0">
          <p className={cx('text-sm', t.status === 'done' ? 'text-zinc-400 line-through' : 'text-zinc-900')}>{t.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
            <span className="flex items-center gap-1"><Avatar ownerId={t.ownerId} />{ownerName(t.ownerId)}</span>
            <span className={cx(overdue && 'font-medium text-red-700')}>{t.status === 'done' ? `done ${relTime(t.completedAt)}` : `due ${fmtDate(t.dueAt)}${overdue ? ` · overdue ${relTime(t.dueAt).replace(' ago', '')}` : ''}`}</span>
            {lead && <button className="text-brand-700 hover:underline" onClick={() => openLead(lead.id)}>{lead.company}</button>}
            {client && <span>Client: {client.name}</span>}
            {t.objective && <span>· {t.objective}</span>}
            {t.source === 'ai' && <Badge tone="brand">AI</Badge>}
          </div>
          {t.blockedReason && t.status === 'blocked' && <p className="mt-1 text-xs text-amber-800">Blocked: {t.blockedReason}</p>}
          {t.rationale && t.status === 'suggested' && <p className="mt-1 text-xs text-zinc-600">Why: {t.rationale}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-8 sm:pl-0">
        {t.status === 'suggested' ? (
          <>
            <Button size="sm" variant="ghost" icon={X} onClick={() => dismissSuggestion(t.id)}>Dismiss</Button>
            <Button size="sm" variant="primary" icon={Check} onClick={() => acceptSuggestion(t.id)}>Accept</Button>
          </>
        ) : t.status !== 'done' ? (
          <>
            <select
              className="h-8 rounded-md border border-zinc-200 bg-white px-1.5 text-xs"
              value={t.priority}
              onChange={(e) => updateTask(t.id, { priority: e.target.value as TaskPriority }, `Reprioritised to ${e.target.value}`)}
              aria-label="Priority"
            >
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
            <select
              className="h-8 rounded-md border border-zinc-200 bg-white px-1.5 text-xs"
              value={t.ownerId}
              onChange={(e) => updateTask(t.id, { ownerId: e.target.value }, `Reassigned to ${ownerName(e.target.value)}`)}
              aria-label="Owner"
            >
              {TEAM.map((m) => <option key={m.id} value={m.id}>{m.name.split(' ')[0]}</option>)}
            </select>
            <select
              className="h-8 rounded-md border border-zinc-200 bg-white px-1.5 text-xs"
              value={t.status}
              onChange={(e) => {
                const s = e.target.value as TaskStatus;
                if (s === 'done') completeTask(t.id);
                else updateTask(t.id, { status: s, blockedReason: s === 'blocked' ? t.blockedReason ?? 'Marked blocked' : t.blockedReason }, `Status → ${s.replace('_', ' ')}`);
              }}
              aria-label="Status"
            >
              <option value="todo">To do</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option>
            </select>
          </>
        ) : (
          <TaskStatusBadge s="done" />
        )}
      </div>
    </li>
  );
}

function TaskGroup({ title, icon, tasks, tone, empty }: { title: string; icon: typeof Ban; tasks: Task[]; tone?: string; empty: string }) {
  const Icon = icon;
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2">{title}<Badge tone={(tone as never) ?? 'neutral'}>{tasks.length}</Badge></span>} icon={Icon} />
      {tasks.length ? <ul className="divide-y divide-zinc-100">{tasks.map((t) => <TaskRow key={t.id} t={t} />)}</ul> : <p className="px-5 py-6 text-center text-xs text-zinc-500">{empty}</p>}
    </Card>
  );
}

export function Operations() {
  const tasks = useStore((s) => s.tasks);
  const leads = useStore((s) => s.leads);
  const createTask = useStore((s) => s.createTask);
  const acceptSuggestion = useStore((s) => s.acceptSuggestion);
  const toast = useStore((s) => s.toast);
  const [creating, setCreating] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const sortP = (a: Task, b: Task) => RANK[a.priority] - RANK[b.priority] || a.dueAt.localeCompare(b.dueAt);
  const overdue = tasks.filter((t) => isTaskOverdue(t) && t.status !== 'blocked').sort(sortP);
  const blocked = tasks.filter((t) => t.status === 'blocked').sort(sortP);
  const today = tasks.filter((t) => isTaskDueToday(t) && t.status !== 'blocked').sort(sortP);
  const suggested = tasks.filter((t) => t.status === 'suggested').sort(sortP);
  const upcoming = tasks.filter((t) => !['done', 'suggested', 'blocked'].includes(t.status) && !isTaskOverdue(t) && !isTaskDueToday(t)).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const done = tasks.filter((t) => t.status === 'done').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const bottleneck = findBottleneck(leads);

  // Workload by owner
  const load = TEAM.map((m) => ({
    m,
    open: tasks.filter((t) => t.ownerId === m.id && !['done', 'suggested'].includes(t.status)).length,
    overdue: tasks.filter((t) => t.ownerId === m.id && isTaskOverdue(t)).length,
    followUps: leads.filter((l) => l.ownerId === m.id && isOverdue(l)).length,
  }));
  const maxLoad = Math.max(...load.map((x) => x.open + x.followUps), 1);
  const rebalance = tasks.find((t) => t.id === 'T13' && t.status === 'suggested');

  // What needs attention first
  const firsts: string[] = [];
  const urgentBlocked = blocked.find((t) => t.priority === 'Urgent');
  if (overdue[0]) firsts.push(`Overdue ${overdue[0].priority.toLowerCase()} task: "${overdue[0].title}" (${ownerName(overdue[0].ownerId)}). ${overdue[0].leadId ? 'It is linked to an open deal.' : 'Client deliverable — retention risk.'}`);
  if (urgentBlocked) firsts.push(`Unblock "${urgentBlocked.title}" — ${urgentBlocked.blockedReason}. Nobody owns the unblock step yet.`);
  if (bottleneck) firsts.push(bottleneck.summary);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations"
        subtitle="Tasks across sales and client delivery. The AI COO turns priorities into tasks and flags what is slowing the business down."
        actions={<Button variant="primary" icon={Plus} onClick={() => setCreating((v) => !v)}>New task</Button>}
      />
      {creating && (
        <TaskForm onCancel={() => setCreating(false)} onCreate={(t) => { createTask({ ...t, status: 'todo' }); setCreating(false); toast('Task created'); }} />
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="What needs attention first" subtitle="AI COO assessment of current bottlenecks" icon={Bot} />
          <ol className="space-y-2 p-4 sm:p-5">
            {firsts.length ? firsts.map((f, i) => (
              <li key={i} className="flex gap-3 text-sm text-zinc-700">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white">{i + 1}</span>
                <span>{f}</span>
              </li>
            )) : <li className="text-sm text-zinc-500">No operational bottlenecks detected.</li>}
          </ol>
          {rebalance && (
            <div className="mx-4 mb-4 flex flex-col gap-2 rounded-lg border border-brand-200 bg-brand-50/60 p-3 sm:mx-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-brand-900">
                <b>Recommendation:</b> {rebalance.title}.{' '}
                {bottleneck?.topOwner ? `${bottleneck.topOwner.name} owns ${bottleneck.topOwner.count} of ${bottleneck.stuck.length} leads stuck in ${bottleneck.stage}; ` : ''}
                Priya Shah has {load.find((x) => x.m.id === 'u-priya')?.followUps ?? 0} overdue follow-ups.
              </div>
              <Button size="sm" variant="primary" onClick={() => { acceptSuggestion(rebalance.id); toast('Leads reassigned in the demo CRM'); }}>Accept & rebalance</Button>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Team workload" subtitle="Open tasks + overdue follow-ups" icon={Users} />
          <ul className="space-y-3 p-4 sm:p-5">
            {load.map(({ m, open, overdue: od, followUps }) => (
              <li key={m.id}>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-zinc-800"><Avatar ownerId={m.id} />{m.name}</span>
                  <span className="tabular-nums text-zinc-500">{open} task{open === 1 ? '' : 's'} · {followUps} follow-up{followUps === 1 ? '' : 's'}{od ? <span className="text-red-700"> · {od} overdue</span> : ''}</span>
                </div>
                <div className="mt-1.5 flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full rounded-full bg-zinc-400" style={{ width: `${(open / maxLoad) * 100}%` }} />
                  <div className="h-full rounded-full bg-red-500" style={{ width: `${(followUps / maxLoad) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="flex gap-3 border-t border-zinc-100 px-5 py-2 text-[11px] text-zinc-500">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-zinc-400" />Open tasks</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-500" />Overdue lead follow-ups</span>
          </div>
        </Card>
      </div>

      {suggested.length > 0 && <TaskGroup title="AI-recommended tasks" icon={Sparkles} tasks={suggested} tone="brand" empty="" />}
      <div className="grid gap-6 xl:grid-cols-2">
        <TaskGroup title="Overdue" icon={AlertTriangle} tasks={overdue} tone="danger" empty="Nothing overdue." />
        <TaskGroup title="Blocked" icon={Ban} tasks={blocked} tone="warn" empty="Nothing blocked." />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <TaskGroup title="Today's priorities" icon={CalendarClock} tasks={today} empty="Nothing else due today." />
        <TaskGroup title="Upcoming" icon={CalendarClock} tasks={upcoming} empty="No upcoming tasks." />
      </div>
      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2">Completed <Badge tone="ok">{done.length}</Badge></span>}
          icon={CheckCircle2}
          right={<Button size="sm" variant="ghost" onClick={() => setShowDone((v) => !v)}>{showDone ? 'Hide' : 'Show'}</Button>}
        />
        {showDone && (done.length ? <ul className="divide-y divide-zinc-100">{done.map((t) => <TaskRow key={t.id} t={t} />)}</ul> : <EmptyState icon={CheckCircle2} title="No completed tasks yet" />)}
      </Card>
    </div>
  );
}
