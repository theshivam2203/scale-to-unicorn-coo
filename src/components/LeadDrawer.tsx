import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bot, Calendar, ClipboardList, FileText, Globe, Inbox, Mail, MessageSquare, Phone, Plus, RefreshCw, Send, Sparkles, StickyNote, X,
} from 'lucide-react';
import type { Activity, Stage, TaskPriority } from '../domain/types';
import { STAGES } from '../domain/types';
import { useStore } from '../store/store';
import { TEAM } from '../domain/seed';
import { ownerName } from '../domain/metrics';
import { daysFromNow, fmtDateTime, money, relTime } from '../domain/util';
import { closeLikelihood, hoursSinceTouch, isOpen, isOverdue, recommendAction, scoreLead } from '../services/ai/engine';
import { ApprovalCard } from './ApprovalCard';
import { Avatar, Badge, Button, FollowUpBadge, Label, PriorityBadge, SimTag, StageBadge, TaskStatusBadge, cx, inputCls } from './ui';

const ACT_ICON: Record<Activity['type'], typeof Mail> = {
  form: Globe, email_in: Inbox, email_out: Send, call: Phone, meeting: Calendar, note: StickyNote, status: RefreshCw, ai: Bot, task: ClipboardList, proposal: FileText,
};

export function LeadDrawer() {
  const id = useStore((s) => s.openLeadId);
  const close = useStore((s) => s.openLead);
  useEffect(() => {
    if (!id) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[role="dialog"]') && close(null);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [id, close]);
  if (!id) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end bg-zinc-900/30" onMouseDown={() => close(null)}>
      <aside className="h-full w-full max-w-2xl animate-slidein overflow-y-auto bg-zinc-50 shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <LeadDetail id={id} />
      </aside>
    </div>,
    document.body,
  );
}

function LeadDetail({ id }: { id: string }) {
  const lead = useStore((s) => s.leads.find((l) => l.id === id));
  const approvals = useStore((s) => s.approvals.filter((a) => a.leadId === id && (a.status === 'pending' || a.status === 'approved')));
  const tasks = useStore((s) => s.tasks.filter((t) => t.leadId === id && t.status !== 'done'));
  const { openLead, generateFollowUps, changeStatus, createTask, simulateReply, addNote, proposeMeeting, toast } = useStore();
  const [showTask, setShowTask] = useState(false);
  const [note, setNote] = useState('');
  if (!lead) return null;

  const open = isOpen(lead);
  const overdue = isOverdue(lead);
  const score = scoreLead(lead);
  const rec = recommendAction(lead);
  const hasDraft = approvals.some((a) => a.type === 'send_email');

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-zinc-900">{lead.name}</h2>
              <StageBadge stage={lead.status} />
              {open && <PriorityBadge p={score.priority} />}
            </div>
            <p className="text-sm text-zinc-500">{lead.title} · {lead.company} · {lead.country}</p>
          </div>
          <button onClick={() => openLead(null)} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {open && !hasDraft && (
            <Button size="sm" variant="primary" icon={Sparkles} onClick={() => { generateFollowUps([lead.id], 'AI COO'); toast('Follow-up drafted — review it below'); }}>
              Generate follow-up
            </Button>
          )}
          {open && (
            <Button size="sm" icon={Calendar} onClick={() => { proposeMeeting(lead.id); toast('Meeting proposal sent to the approval queue'); }}>Propose meeting</Button>
          )}
          <Button size="sm" icon={Plus} onClick={() => setShowTask((v) => !v)}>Create task</Button>
          {(lead.followUp === 'sent') && (
            <Button size="sm" variant="ghost" icon={MessageSquare} onClick={() => simulateReply(lead.id)} title="Demo scenario control — simulates the prospect replying">
              Simulate reply (demo)
            </Button>
          )}
          <select
            className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-700"
            value={lead.status}
            onChange={(e) => changeStatus(lead.id, e.target.value as Stage)}
            aria-label="Change status"
          >
            {STAGES.map((s) => <option key={s} value={s}>Status: {s}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {showTask && <TaskForm onCancel={() => setShowTask(false)} onCreate={(t) => { createTask({ ...t, leadId: lead.id, status: 'todo', objective: 'Pipeline conversion' }); setShowTask(false); toast('Task created'); }} defaultOwner={lead.ownerId} company={lead.company} />}

        {lead.urgentReason && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span className="font-semibold">Needs immediate attention.</span> {lead.urgentReason}
          </div>
        )}

        {/* AI recommendation */}
        <div className="rounded-xl border border-brand-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-brand-700"><Sparkles size={14} /> AI COO recommendation</div>
          <p className="mt-1 text-sm font-semibold text-zinc-900">{rec.action}</p>
          <p className="mt-0.5 text-xs text-zinc-600">{rec.why}</p>
          {open && (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-xs"><span className="font-medium text-zinc-600">Priority score</span><span className="font-semibold text-zinc-900">{score.total}/100</span></div>
                <div className="space-y-1">
                  {score.parts.map((p) => (
                    <div key={p.label} className="flex items-center gap-2 text-[11px] text-zinc-500">
                      <span className="w-24 shrink-0">{p.label}</span>
                      <div className="h-1.5 flex-1 rounded-full bg-zinc-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(p.points / p.max) * 100}%` }} /></div>
                      <span className="w-10 text-right tabular-nums">{p.points}/{p.max}</span>
                    </div>
                  ))}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <Fact k="Deal value" v={money(lead.value)} />
                <Fact k="Close likelihood (7d)" v={`${Math.round(closeLikelihood(lead) * 100)}% est.`} />
                <Fact k="Last touch" v={`${Math.round(hoursSinceTouch(lead))}h ago`} warn={overdue} />
                <Fact k="Next touch" v={lead.nextFollowUpAt ? relTime(lead.nextFollowUpAt) : '—'} />
              </dl>
            </div>
          )}
        </div>

        {approvals.map((a) => <ApprovalCard key={a.id} a={a} compact />)}

        {/* Record */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
            <Row k="Email" v={<span className="break-all">{lead.email}</span>} />
            <Row k="Phone" v={lead.phone} />
            <Row k="Source" v={lead.source} />
            <Row k="Owner" v={<span className="flex items-center gap-1.5"><Avatar ownerId={lead.ownerId} />{ownerName(lead.ownerId)}</span>} />
            <Row k="Interested in" v={lead.interest} />
            <Row k="Follow-up" v={<FollowUpBadge state={lead.followUp} overdue={overdue} />} />
            <Row k="Pain point" v={lead.painPoint} full />
            {lead.pendingQuestion && <Row k="Unanswered question" v={<span className="text-red-700">“{lead.pendingQuestion}”</span>} full />}
            {lead.signals.length > 0 && <Row k="Buying signals" v={<span className="flex flex-wrap gap-1">{lead.signals.map((s) => <Badge key={s} tone="ok">{s}</Badge>)}</span>} full />}
            {lead.lostReason && <Row k="Lost reason" v={lead.lostReason} full />}
            {lead.nextAction && <Row k="Next step" v={lead.nextAction} full />}
            {lead.recoveredAt && <Row k="Re-engaged" v={<Badge tone="ok">Re-engaged after missed follow-up · {relTime(lead.recoveredAt)}</Badge>} full />}
          </dl>
        </div>

        {tasks.length > 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-zinc-900">Open tasks</h3>
            <ul className="space-y-2">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-zinc-800">{t.title}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-zinc-500"><TaskStatusBadge s={t.status} />{relTime(t.dueAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Timeline */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900">Activity history</h3>
          <form
            className="mb-4 flex gap-2"
            onSubmit={(e) => { e.preventDefault(); if (note.trim()) { addNote(lead.id, note.trim()); setNote(''); } }}
          >
            <input className={inputCls} placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button type="submit" disabled={!note.trim()}>Add</Button>
          </form>
          <ol className="relative space-y-3 border-l border-zinc-200 pl-5">
            {lead.activities.map((a) => {
              const I = ACT_ICON[a.type];
              return (
                <li key={a.id} className="relative">
                  <span className={cx('absolute -left-[29px] top-0 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-4 ring-white', a.by === 'AI COO' ? 'bg-brand-100 text-brand-700' : a.by === 'Prospect' ? 'bg-sky-100 text-sky-700' : 'bg-zinc-100 text-zinc-600')}>
                    <I size={10} />
                  </span>
                  <p className="text-sm text-zinc-800">{a.text} {a.simulated && <SimTag />}</p>
                  <p className="text-[11px] text-zinc-500">{a.by} · {fmtDateTime(a.at)}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

const Fact = ({ k, v, warn }: { k: string; v: string; warn?: boolean }) => (
  <div className="rounded-lg bg-zinc-50 px-2.5 py-1.5">
    <dt className="text-[11px] text-zinc-500">{k}</dt>
    <dd className={cx('font-semibold tabular-nums', warn ? 'text-red-700' : 'text-zinc-900')}>{v}</dd>
  </div>
);

const Row = ({ k, v, full }: { k: string; v: React.ReactNode; full?: boolean }) => (
  <div className={full ? 'sm:col-span-2' : ''}>
    <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{k}</dt>
    <dd className="mt-0.5 text-zinc-800">{v}</dd>
  </div>
);

export function TaskForm({ onCancel, onCreate, defaultOwner = 'u-daniel', company }: {
  onCancel: () => void;
  onCreate: (t: { title: string; ownerId: string; priority: TaskPriority; dueAt: string }) => void;
  defaultOwner?: string;
  company?: string;
}) {
  const [title, setTitle] = useState(company ? `Call ${company}` : '');
  const [ownerId, setOwner] = useState(defaultOwner);
  const [priority, setPriority] = useState<TaskPriority>('High');
  const [due, setDue] = useState(daysFromNow(1).slice(0, 10));
  return (
    <form
      className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2"
      onSubmit={(e) => { e.preventDefault(); if (title.trim()) onCreate({ title: title.trim(), ownerId, priority, dueAt: new Date(`${due}T17:00:00`).toISOString() }); }}
    >
      <div className="sm:col-span-2"><Label>Task</Label><input autoFocus className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div><Label>Owner</Label><select className={inputCls} value={ownerId} onChange={(e) => setOwner(e.target.value)}>{TEAM.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>Priority</Label><select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>{(['Urgent', 'High', 'Medium', 'Low'] as const).map((p) => <option key={p}>{p}</option>)}</select></div>
        <div><Label>Due</Label><input type="date" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} /></div>
      </div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!title.trim()}>Create task</Button>
      </div>
    </form>
  );
}

