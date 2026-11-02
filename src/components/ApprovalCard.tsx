import { useState } from 'react';
import { ArrowRight, Calendar, Check, ClipboardList, Database, Mail, Pencil, RefreshCw, Sparkles, TrendingUp, X } from 'lucide-react';
import type { Approval, ApprovalType, Stage } from '../domain/types';
import { STAGES } from '../domain/types';
import { useStore } from '../store/store';
import { TEAM } from '../domain/seed';
import { ownerName } from '../domain/metrics';
import { fmtDateTime, relTime } from '../domain/util';
import { ApprovalStatusBadge, Badge, Button, Card, Label, Modal, cx, inputCls } from './ui';

export const APPROVAL_META: Record<ApprovalType, { label: string; icon: typeof Mail }> = {
  send_email: { label: 'Send email', icon: Mail },
  update_crm: { label: 'Update CRM record', icon: Database },
  schedule_meeting: { label: 'Schedule meeting', icon: Calendar },
  assign_task: { label: 'Assign team task', icon: ClipboardList },
  change_status: { label: 'Change lead status', icon: RefreshCw },
};

const STEPS = ['Draft', 'Approved', 'Completed'] as const;

function Lifecycle({ a }: { a: Approval }) {
  if (a.status === 'rejected') return null;
  const idx = a.status === 'pending' ? 0 : a.status === 'approved' ? 1 : 2;
  return (
    <div className="flex items-center gap-1 text-[11px]">
      {STEPS.map((s, i) => (
        <span key={s} className="flex items-center gap-1">
          <span className={cx('rounded px-1.5 py-0.5 font-medium', i < idx ? 'text-zinc-500' : i === idx ? 'bg-zinc-900 text-white' : 'text-zinc-400')}>
            {s}
            {s === 'Completed' && ' (sim.)'}
          </span>
          {i < STEPS.length - 1 && <ArrowRight size={10} className="text-zinc-300" />}
        </span>
      ))}
    </div>
  );
}

export function ApprovalCard({ a, compact }: { a: Approval; compact?: boolean }) {
  const { approve, reject, editApproval, openLead, executing } = useStore();
  const lead = useStore((s) => s.leads.find((l) => l.id === a.leadId));
  const task = useStore((s) => s.tasks.find((t) => t.id === a.taskId));
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const meta = APPROVAL_META[a.type];
  const Icon = meta.icon;
  const busy = !!executing[a.id];

  return (
    <Card className={cx('overflow-hidden animate-fadein', a.status === 'executed' && 'border-emerald-200', a.status === 'rejected' && 'opacity-75')}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cx('rounded-lg p-2', a.status === 'executed' ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand-700')}>
            <Icon size={16} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{meta.label}</span>
              {a.edited && <Badge>Edited by you</Badge>}
            </div>
            <h4 className="mt-0.5 text-sm font-semibold text-zinc-900">{a.title}</h4>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
              <span>Proposed by {a.createdBy} · {relTime(a.createdAt)}</span>
              {lead && (
                <button className="font-medium text-brand-700 hover:underline" onClick={() => openLead(lead.id)}>
                  {lead.name} · {lead.company}
                </button>
              )}
              {task && <span>Task: {task.title}</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ApprovalStatusBadge status={a.status} />
              {!compact && <Lifecycle a={a} />}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 px-4 py-3 sm:px-5 md:grid-cols-2">
        <div className="rounded-lg bg-zinc-50 px-3 py-2">
          <div className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-zinc-500"><Sparkles size={11} /> Why the AI COO recommends this</div>
          <p className="text-xs text-zinc-700">{a.reason}</p>
        </div>
        <div className="rounded-lg bg-zinc-50 px-3 py-2">
          <div className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-zinc-500"><TrendingUp size={11} /> Expected impact <Badge className="ml-1">Estimate</Badge></div>
          <p className="text-xs text-zinc-700">{a.impact}</p>
        </div>
      </div>

      <div className="px-4 pb-3 sm:px-5">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">Preview of changes</div>
        <Preview a={a} />
      </div>

      {a.status === 'executed' && a.result && (
        <div className="mx-4 mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 sm:mx-5">
          <Check size={12} className="mr-1 inline" />
          {a.result} <span className="text-emerald-700/80">· {a.executedAt && relTime(a.executedAt)}</span>
        </div>
      )}
      {a.status === 'rejected' && (
        <div className="mx-4 mb-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 sm:mx-5">
          Rejected by {a.decidedBy} {a.decidedAt && relTime(a.decidedAt)} — <span className="font-medium">{a.rejectionReason}</span>
        </div>
      )}
      {a.status === 'pending' && a.result && (
        <div className="mx-4 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 sm:mx-5">Last attempt failed: {a.result}</div>
      )}

      {(a.status === 'pending' || a.status === 'approved') && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50/60 px-4 py-2.5 sm:px-5">
          <span className="text-[11px] text-zinc-500">Executes in demo mode only — no external system is contacted.</span>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" icon={X} onClick={() => setRejecting(true)} disabled={busy}>Reject</Button>
            <Button size="sm" icon={Pencil} onClick={() => setEditing(true)} disabled={busy}>Edit</Button>
            <Button size="sm" variant="primary" icon={Check} loading={busy} onClick={() => approve(a.id)}>
              {busy ? 'Executing…' : a.type === 'send_email' ? 'Approve & send (demo)' : 'Approve'}
            </Button>
          </div>
        </div>
      )}

      {editing && <EditModal a={a} onClose={() => setEditing(false)} onSave={(p) => { editApproval(a.id, p); setEditing(false); }} />}
      {rejecting && <RejectModal onClose={() => setRejecting(false)} onReject={(r) => { reject(a.id, r); setRejecting(false); }} />}
    </Card>
  );
}

function Preview({ a }: { a: Approval }) {
  const lead = useStore((s) => s.leads.find((l) => l.id === a.leadId));
  const p = a.payload;
  if (p.email)
    return (
      <div className="rounded-lg border border-zinc-200 text-xs">
        <div className="space-y-0.5 border-b border-zinc-100 px-3 py-2 text-zinc-600">
          <div><span className="text-zinc-400">To:</span> {p.email.to}</div>
          <div><span className="text-zinc-400">Subject:</span> <span className="font-medium text-zinc-800">{p.email.subject}</span></div>
        </div>
        <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap px-3 py-2 font-sans text-[12.5px] leading-relaxed text-zinc-800">{p.email.body}</pre>
        <div className="border-t border-zinc-100 px-3 py-1.5 text-[11px] text-zinc-500">
          On approval: lead → last contact now{lead?.status === 'New' ? ', status New → Contacted' : ''}, next touch in 3 days, follow-up task created.
        </div>
      </div>
    );
  if (p.meeting)
    return (
      <Diff rows={[
        ['When', '—', `${fmtDateTime(p.meeting.when)} · ${p.meeting.durationMin} min`],
        ['Agenda', '—', p.meeting.agenda],
        ...(lead && STAGES.indexOf(lead.status) < STAGES.indexOf('Meeting Booked') ? [['Status', lead.status, 'Meeting Booked'] as [string, string, string]] : []),
      ]} />
    );
  if (p.leadPatch)
    return (
      <Diff rows={[
        ...(p.leadPatch.nextAction ? [['Next step', lead?.nextAction ?? '(empty)', p.leadPatch.nextAction] as [string, string, string]] : []),
        ...(p.leadPatch.note ? [['Note', '—', p.leadPatch.note] as [string, string, string]] : []),
        ...(p.leadPatch.ownerId ? [['Owner', ownerName(lead?.ownerId ?? ''), ownerName(p.leadPatch.ownerId)] as [string, string, string]] : []),
        ...(p.leadPatch.status ? [['Status', lead?.status ?? '', p.leadPatch.status] as [string, string, string]] : []),
      ]} />
    );
  if (p.task)
    return <Diff rows={[['Task', '—', p.task.title], ['Owner', '—', ownerName(p.task.ownerId)], ['Due', '—', fmtDateTime(p.task.dueAt)], ['Priority', '—', p.task.priority]]} />;
  if (p.status) return <Diff rows={[['Status', lead?.status ?? '', p.status]]} />;
  return null;
}

function Diff({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-xs">
      {rows.map(([k, from, to]) => (
        <div key={k} className="grid grid-cols-[80px_1fr] gap-2 px-3 py-1.5 sm:grid-cols-[100px_1fr]">
          <span className="text-zinc-400">{k}</span>
          <span className="text-zinc-800">
            {from !== '—' && <span className="mr-1 text-zinc-400 line-through">{from}</span>}
            <span className="font-medium">{to}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function EditModal({ a, onClose, onSave }: { a: Approval; onClose: () => void; onSave: (p: Approval['payload']) => void }) {
  const [subject, setSubject] = useState(a.payload.email?.subject ?? '');
  const [body, setBody] = useState(a.payload.email?.body ?? '');
  const [when, setWhen] = useState(a.payload.meeting ? toLocalInput(a.payload.meeting.when) : '');
  const [agenda, setAgenda] = useState(a.payload.meeting?.agenda ?? '');
  const [title, setTitle] = useState(a.payload.task?.title ?? '');
  const [owner, setOwner] = useState(a.payload.task?.ownerId ?? 'u-daniel');
  const [nextAction, setNextAction] = useState(a.payload.leadPatch?.nextAction ?? '');
  const [status, setStatus] = useState<Stage>(a.payload.status ?? 'Qualified');

  const save = () => {
    if (a.payload.email) onSave({ email: { ...a.payload.email, subject, body } });
    else if (a.payload.meeting) onSave({ meeting: { ...a.payload.meeting, when: new Date(when).toISOString(), agenda } });
    else if (a.payload.task) onSave({ task: { ...a.payload.task, title, ownerId: owner } });
    else if (a.payload.leadPatch) onSave({ leadPatch: { ...a.payload.leadPatch, nextAction } });
    else if (a.payload.status) onSave({ status });
  };

  return (
    <Modal open onClose={onClose} title={`Edit: ${APPROVAL_META[a.type].label}`} wide footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save changes</Button></>}>
      <div className="space-y-3">
        {a.payload.email && (
          <>
            <div><Label>To</Label><input className={cx(inputCls, 'bg-zinc-50')} value={a.payload.email.to} disabled /></div>
            <div><Label>Subject</Label><input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
            <div><Label>Message</Label><textarea className={cx(inputCls, 'min-h-[260px] font-sans leading-relaxed')} value={body} onChange={(e) => setBody(e.target.value)} /></div>
          </>
        )}
        {a.payload.meeting && (
          <>
            <div><Label>Date & time</Label><input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} /></div>
            <div><Label>Agenda</Label><textarea className={inputCls} rows={3} value={agenda} onChange={(e) => setAgenda(e.target.value)} /></div>
          </>
        )}
        {a.payload.task && (
          <>
            <div><Label>Task</Label><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div><Label>Owner</Label><select className={inputCls} value={owner} onChange={(e) => setOwner(e.target.value)}>{TEAM.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
          </>
        )}
        {a.payload.leadPatch && (
          <div><Label>Next step</Label><input className={inputCls} value={nextAction} onChange={(e) => setNextAction(e.target.value)} /></div>
        )}
        {a.payload.status && (
          <div><Label>New status</Label><select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as Stage)}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></div>
        )}
        <p className="text-xs text-zinc-500">Edits are recorded in the audit log. The action still needs your approval to execute.</p>
      </div>
    </Modal>
  );
}

const QUICK_REASONS = ['Tone not right for this prospect', 'Already contacted by phone', 'Wrong timing', 'Information is inaccurate'];

function RejectModal({ onClose, onReject }: { onClose: () => void; onReject: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Modal open onClose={onClose} title="Reject this action" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" disabled={!reason.trim()} onClick={() => onReject(reason.trim())}>Reject action</Button></>}>
      <Label>Reason (saved to the audit log)</Label>
      <textarea autoFocus className={inputCls} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this not the right action?" />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK_REASONS.map((r) => (
          <button key={r} onClick={() => setReason(r)} className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50">{r}</button>
        ))}
      </div>
    </Modal>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
