import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Activity, Approval, ApprovalPayload, AuditEntry, ChatMessage, Lead, Stage, Task } from '../domain/types';
import { STAGES } from '../domain/types';
import { CURRENT_USER, createSeed } from '../domain/seed';
import { daysFromNow, fmtDateTime, uid } from '../domain/util';
import { ownerName } from '../domain/metrics';
import { services } from '../services';
import { draftFollowUp, emailImpact, isOverdue, recommendAction } from '../services/ai/engine';
import { interpret, type CommandAction } from '../services/ai/commands';

type AuditInput = Omit<AuditEntry, 'id' | 'at' | 'mode'>;

export interface Toast {
  id: string;
  text: string;
  tone: 'ok' | 'info' | 'warn';
}

interface State {
  seededAt: string;
  leads: Lead[];
  tasks: Task[];
  approvals: Approval[];
  audit: AuditEntry[];
  chat: ChatMessage[];
  executing: Record<string, boolean>;
  toasts: Toast[];
  openLeadId: string | null;

  // ui
  openLead: (id: string | null) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;

  // leads
  changeStatus: (leadId: string, status: Stage, by?: string) => void;
  updateLead: (leadId: string, patch: Partial<Lead>, message: string, by?: string) => void;
  addNote: (leadId: string, text: string) => void;
  simulateReply: (leadId: string) => void;

  // follow-up workflow
  generateFollowUps: (leadIds: string[], by?: string) => string[];
  proposeMeeting: (leadId: string) => string | null;

  // approvals
  editApproval: (id: string, payload: ApprovalPayload) => void;
  approve: (id: string) => Promise<void>;
  reject: (id: string, reason: string) => void;

  // tasks
  createTask: (t: Omit<Task, 'id' | 'createdAt' | 'source'> & { source?: Task['source'] }, by?: string) => string;
  updateTask: (id: string, patch: Partial<Task>, message?: string) => void;
  completeTask: (id: string) => void;
  acceptSuggestion: (id: string) => void;
  dismissSuggestion: (id: string) => void;

  // command center
  runCommand: (text: string) => void;
  runAction: (a: CommandAction, navigate: (to: string) => void) => void;
  clearChat: () => void;

  resetDemo: () => void;
}

const nowIso = () => new Date().toISOString();
const activity = (type: Activity['type'], text: string, by: string, simulated = false): Activity => ({ id: uid('act'), at: nowIso(), type, text, by, simulated });

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const log = (e: AuditInput) => set((s) => ({ audit: [services.audit.entry(e), ...s.audit] }));
      const patchLead = (id: string, fn: (l: Lead) => Lead) => set((s) => ({ leads: s.leads.map((l) => (l.id === id ? fn(l) : l)) }));
      const lead = (id?: string) => get().leads.find((l) => l.id === id);

      /** Marks a lead as recovered when it advances or replies after a missed follow-up. */
      const checkRecovery = (l: Lead, next: Lead): Lead => {
        if (!l.everNeglected || l.recoveredAt || next.status === 'Lost') return next;
        const advanced = STAGES.indexOf(next.status) > STAGES.indexOf(l.neglectedAtStage ?? l.status);
        return advanced || next.followUp === 'replied' ? { ...next, recoveredAt: nowIso() } : next;
      };

      const seed = createSeed();
      return {
        ...seed,
        chat: [],
        executing: {},
        toasts: [],
        openLeadId: null,

        openLead: (id) => set({ openLeadId: id }),
        toast: (text, tone = 'ok') => {
          const id = uid('toast');
          set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
          setTimeout(() => get().dismissToast(id), 4200);
        },
        dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

        changeStatus: (leadId, status, by = CURRENT_USER) => {
          const l = lead(leadId);
          if (!l || l.status === status) return;
          const next: Lead = {
            ...l,
            status,
            stageEnteredAt: nowIso(),
            urgentReason: status === 'Won' || status === 'Lost' ? undefined : l.urgentReason,
            closedAt: status === 'Won' || status === 'Lost' ? nowIso() : undefined,
            lostAtStage: status === 'Lost' ? l.status : l.lostAtStage,
            activities: [activity('status', `Status changed: ${l.status} → ${status}`, by), ...l.activities],
          };
          patchLead(leadId, () => checkRecovery(l, next));
          log({ actor: by, kind: 'updated', message: `${l.name} (${l.company}) status: ${l.status} → ${status}`, leadId, integration: services.crm.name });
        },

        updateLead: (leadId, patch, message, by = CURRENT_USER) => {
          const l = lead(leadId);
          if (!l) return;
          patchLead(leadId, (x) => ({ ...x, ...patch, activities: [activity('note', message, by), ...x.activities] }));
          log({ actor: by, kind: 'updated', message: `${l.name}: ${message}`, leadId, integration: services.crm.name });
        },

        addNote: (leadId, text) => {
          patchLead(leadId, (x) => ({ ...x, activities: [activity('note', text, CURRENT_USER), ...x.activities] }));
          log({ actor: CURRENT_USER, kind: 'updated', message: `Note added to ${lead(leadId)?.name}`, leadId });
        },

        simulateReply: (leadId) => {
          const l = lead(leadId);
          if (!l) return;
          const next: Lead = {
            ...l,
            followUp: 'replied',
            activities: [activity('email_in', 'Prospect replied: "Thanks — that works. Can we lock in a time?" (simulated reply for demo)', 'Prospect', true), ...l.activities],
          };
          patchLead(leadId, () => checkRecovery(l, next));
          log({ actor: 'System', kind: 'system', message: `Simulated inbound reply from ${l.name} (demo scenario event)`, leadId });
          get().toast(`Simulated reply from ${l.name}`, 'info');
        },

        generateFollowUps: (leadIds, by = 'AI COO') => {
          const created: string[] = [];
          for (const id of leadIds) {
            const l = lead(id);
            if (!l) continue;
            if (get().approvals.some((a) => a.status === 'pending' && a.type === 'send_email' && a.leadId === id)) continue;
            const approval: Approval = {
              id: uid('apr'),
              type: 'send_email',
              title: `Send follow-up to ${l.name} (${l.company})`,
              reason: `${recommendAction({ ...l, followUp: 'due', nextAction: undefined }).why}`,
              impact: emailImpact(l),
              leadId: id,
              payload: { email: draftFollowUp(l, ownerName(l.ownerId)) },
              status: 'pending',
              createdAt: nowIso(),
              createdBy: 'AI COO',
            };
            set((s) => ({ approvals: [approval, ...s.approvals] }));
            patchLead(id, (x) => ({ ...x, followUp: 'draft_pending', activities: [activity('ai', 'AI drafted a follow-up email — awaiting approval', 'AI COO'), ...x.activities] }));
            log({ actor: by, kind: 'proposed', message: `Drafted follow-up email for ${l.name} (${l.company})`, leadId: id, approvalId: approval.id });
            created.push(approval.id);
          }
          return created;
        },

        proposeMeeting: (leadId) => {
          const l = lead(leadId);
          if (!l) return null;
          const existing = get().approvals.find((a) => a.status === 'pending' && a.type === 'schedule_meeting' && a.leadId === leadId);
          if (existing) return existing.id;
          const d = new Date(Date.now() + 86_400_000);
          d.setHours(11, 0, 0, 0);
          const approval: Approval = {
            id: uid('apr'),
            type: 'schedule_meeting',
            title: `Schedule meeting with ${l.name} (${l.company})`,
            reason: recommendAction(l).why,
            impact: `Moves a ${l.status} deal worth $${l.value.toLocaleString('en-US')} toward a decision · estimate`,
            leadId,
            payload: { meeting: { when: d.toISOString(), durationMin: 30, agenda: `Next steps on ${l.interest.toLowerCase()} for ${l.company}.` } },
            status: 'pending',
            createdAt: nowIso(),
            createdBy: 'AI COO',
          };
          set((s) => ({ approvals: [approval, ...s.approvals] }));
          log({ actor: 'AI COO', kind: 'proposed', message: `Proposed: ${approval.title}`, leadId, approvalId: approval.id });
          return approval.id;
        },

        editApproval: (id, payload) => {
          const a = get().approvals.find((x) => x.id === id);
          if (!a || a.status !== 'pending') return;
          set((s) => ({ approvals: s.approvals.map((x) => (x.id === id ? { ...x, payload: { ...x.payload, ...payload }, edited: true } : x)) }));
          log({ actor: CURRENT_USER, kind: 'edited', message: `Edited before approval: ${a.title}`, approvalId: id, leadId: a.leadId });
        },

        approve: async (id) => {
          const a = get().approvals.find((x) => x.id === id);
          if (!a || a.status !== 'pending' || get().executing[id]) return;
          const decidedAt = nowIso();
          set((s) => ({
            executing: { ...s.executing, [id]: true },
            approvals: s.approvals.map((x) => (x.id === id ? { ...x, status: 'approved', decidedAt, decidedBy: CURRENT_USER } : x)),
          }));
          log({ actor: CURRENT_USER, kind: 'approved', message: `Approved: ${a.title}`, approvalId: id, leadId: a.leadId, taskId: a.taskId });

          let result = '';
          let integration = '';
          try {
            const l = lead(a.leadId);
            switch (a.type) {
              case 'send_email': {
                const email = a.payload.email!;
                const r = await services.email.send(email);
                integration = r.provider;
                result = r.note;
                if (l) {
                  const wasOverdue = isOverdue(l);
                  const next: Lead = {
                    ...l,
                    status: l.status === 'New' ? 'Contacted' : l.status,
                    stageEnteredAt: l.status === 'New' ? nowIso() : l.stageEnteredAt,
                    lastContactAt: nowIso(),
                    followUp: 'sent',
                    nextFollowUpAt: daysFromNow(3),
                    nextAction: undefined,
                    pendingQuestion: undefined,
                    everNeglected: l.everNeglected || wasOverdue,
                    neglectedAtStage: l.everNeglected ? l.neglectedAtStage : wasOverdue ? l.status : undefined,
                    activities: [
                      activity('email_out', `Email "${email.subject}" — simulated send (demo mode, not delivered)`, ownerName(l.ownerId), true),
                      ...(l.status === 'New' ? [activity('status', 'Status changed: New → Contacted', 'AI COO')] : []),
                      ...l.activities,
                    ],
                  };
                  patchLead(l.id, () => next);
                  get().createTask(
                    { title: `Follow up with ${l.name} if no reply`, ownerId: l.ownerId, priority: l.value >= 15_000 ? 'High' : 'Medium', dueAt: daysFromNow(3), status: 'todo', leadId: l.id, objective: 'Pipeline conversion', source: 'ai' },
                    'AI COO',
                  );
                  result += ' Next touch scheduled in 3 days.';
                }
                break;
              }
              case 'schedule_meeting': {
                const m = a.payload.meeting!;
                const r = await services.crm.scheduleAppointment(a.leadId!, m.when, a.title);
                integration = r.provider;
                result = r.note;
                if (l) {
                  const advance = STAGES.indexOf(l.status) < STAGES.indexOf('Meeting Booked');
                  const next: Lead = {
                    ...l,
                    status: advance ? 'Meeting Booked' : l.status,
                    stageEnteredAt: advance ? nowIso() : l.stageEnteredAt,
                    urgentReason: undefined,
                    lastContactAt: nowIso(),
                    followUp: 'ok',
                    nextAction: `Meeting ${fmtDateTime(m.when)}: ${m.agenda}`,
                    activities: [
                      activity('meeting', `Meeting scheduled for ${fmtDateTime(m.when)} (${m.durationMin} min) — simulated calendar entry, no invite sent`, 'AI COO', true),
                      ...(advance ? [activity('status', `Status changed: ${l.status} → Meeting Booked`, 'AI COO')] : []),
                      ...l.activities,
                    ],
                  };
                  patchLead(l.id, () => checkRecovery(l, next));
                  get().createTask(
                    { title: `Prepare for meeting: ${l.company}`, ownerId: l.ownerId, priority: 'High', dueAt: m.when, status: 'todo', leadId: l.id, objective: 'Pipeline conversion', source: 'ai' },
                    'AI COO',
                  );
                }
                break;
              }
              case 'update_crm': {
                const p = a.payload.leadPatch!;
                const { note, ...fields } = p;
                const r = await services.crm.updateContact(a.leadId!, p);
                integration = r.provider;
                result = r.note;
                if (l) {
                  patchLead(l.id, (x) => ({
                    ...x,
                    ...fields,
                    activities: [activity('note', `CRM updated: ${[note, fields.nextAction && `next step "${fields.nextAction}"`].filter(Boolean).join('; ')} (demo CRM)`, 'AI COO', true), ...x.activities],
                  }));
                }
                if (fields.status && l) get().changeStatus(l.id, fields.status, 'AI COO');
                break;
              }
              case 'change_status': {
                const r = await services.crm.updateContact(a.leadId!, { status: a.payload.status });
                integration = r.provider;
                result = r.note;
                get().changeStatus(a.leadId!, a.payload.status!, 'AI COO');
                break;
              }
              case 'assign_task': {
                const t = a.payload.task!;
                const r = await services.tasks.assign(t.title, ownerName(t.ownerId));
                integration = services.tasks.name;
                result = r.note;
                if (t.taskId) get().updateTask(t.taskId, { ownerId: t.ownerId, dueAt: t.dueAt, priority: t.priority }, `Reassigned to ${ownerName(t.ownerId)}`);
                else {
                  const related = get().tasks.find((x) => x.id === a.taskId);
                  get().createTask(
                    { title: t.title, ownerId: t.ownerId, priority: t.priority, dueAt: t.dueAt, status: 'todo', clientId: related?.clientId, leadId: related?.leadId, objective: related?.objective ? `Unblock: ${related.title}` : undefined, source: 'ai' },
                    'AI COO',
                  );
                }
                break;
              }
            }
            set((s) => ({
              approvals: s.approvals.map((x) => (x.id === id ? { ...x, status: 'executed', executedAt: nowIso(), result } : x)),
            }));
            log({ actor: 'AI COO', kind: 'executed', message: `Executed (simulated): ${a.title}`, approvalId: id, leadId: a.leadId, taskId: a.taskId, integration });
            get().toast(a.type === 'send_email' ? 'Email sent in demo mode — not delivered' : 'Action executed in demo mode');
          } catch (err) {
            set((s) => ({ approvals: s.approvals.map((x) => (x.id === id ? { ...x, status: 'pending', result: String(err) } : x)) }));
            log({ actor: 'System', kind: 'system', message: `Execution failed for "${a.title}": ${String(err)}`, approvalId: id });
            get().toast('Execution failed — see audit log', 'warn');
          } finally {
            set((s) => {
              const { [id]: _done, ...rest } = s.executing;
              return { executing: rest };
            });
          }
        },

        reject: (id, reason) => {
          const a = get().approvals.find((x) => x.id === id);
          if (!a || a.status !== 'pending') return;
          set((s) => ({
            approvals: s.approvals.map((x) => (x.id === id ? { ...x, status: 'rejected', decidedAt: nowIso(), decidedBy: CURRENT_USER, rejectionReason: reason } : x)),
          }));
          if (a.type === 'send_email' && a.leadId) {
            patchLead(a.leadId, (x) => ({ ...x, followUp: 'due', activities: [activity('ai', `Follow-up draft rejected: ${reason}`, CURRENT_USER), ...x.activities] }));
          }
          log({ actor: CURRENT_USER, kind: 'rejected', message: `Rejected: ${a.title} — reason: ${reason}`, approvalId: id, leadId: a.leadId, taskId: a.taskId });
          get().toast('Rejected — reason saved to audit log', 'info');
        },

        createTask: (t, by = CURRENT_USER) => {
          const task: Task = { ...t, source: t.source ?? 'human', id: uid('task'), createdAt: nowIso() };
          set((s) => ({ tasks: [task, ...s.tasks] }));
          log({
            actor: by,
            kind: task.status === 'suggested' ? 'proposed' : 'created',
            message: `${task.status === 'suggested' ? 'Recommended task' : 'Task created'}: ${task.title} → ${ownerName(task.ownerId)}`,
            taskId: task.id,
            leadId: task.leadId,
          });
          if (task.leadId && task.status !== 'suggested') {
            patchLead(task.leadId, (x) => ({ ...x, activities: [activity('task', `Task created: ${task.title} (${ownerName(task.ownerId)})`, by), ...x.activities] }));
          }
          return task.id;
        },

        updateTask: (id, patch, message) => {
          const t = get().tasks.find((x) => x.id === id);
          if (!t) return;
          set((s) => ({ tasks: s.tasks.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
          log({ actor: CURRENT_USER, kind: 'updated', message: `Task "${t.title}": ${message ?? Object.keys(patch).join(', ') + ' updated'}`, taskId: id, leadId: t.leadId });
        },

        completeTask: (id) => {
          const t = get().tasks.find((x) => x.id === id);
          if (!t || t.status === 'done') return;
          set((s) => ({ tasks: s.tasks.map((x) => (x.id === id ? { ...x, status: 'done', completedAt: nowIso(), completedBy: CURRENT_USER } : x)) }));
          log({ actor: CURRENT_USER, kind: 'updated', message: `Task completed: ${t.title}`, taskId: id, leadId: t.leadId });
          if (t.leadId) patchLead(t.leadId, (x) => ({ ...x, activities: [activity('task', `Task completed: ${t.title}`, CURRENT_USER), ...x.activities] }));
        },

        acceptSuggestion: (id) => {
          const t = get().tasks.find((x) => x.id === id);
          if (!t || t.status !== 'suggested') return;
          set((s) => ({ tasks: s.tasks.map((x) => (x.id === id ? { ...x, status: 'todo' } : x)) }));
          log({ actor: CURRENT_USER, kind: 'approved', message: `Accepted AI-recommended task: ${t.title}`, taskId: id, leadId: t.leadId });
          if (t.leadId) patchLead(t.leadId, (x) => ({ ...x, activities: [activity('task', `Task created: ${t.title} (${ownerName(t.ownerId)})`, CURRENT_USER), ...x.activities] }));
          if (t.id === 'T13') {
            // Rebalancing recommendation: move Marcus's two smallest Qualified deals to Priya.
            const movers = get().leads.filter((l) => l.ownerId === 'u-marcus' && l.status === 'Qualified').sort((a, b) => a.value - b.value).slice(0, 2);
            movers.forEach((l) => get().updateLead(l.id, { ownerId: 'u-priya' }, 'Owner changed: Marcus Reid → Priya Shah (workload rebalance)', 'AI COO'));
            set((s) => ({ tasks: s.tasks.map((x) => (x.id === id ? { ...x, status: 'done', completedAt: nowIso(), completedBy: 'AI COO' } : x)) }));
            log({ actor: 'AI COO', kind: 'executed', message: `Reassigned ${movers.map((m) => m.company).join(' and ')} to Priya Shah (demo CRM)`, taskId: id, integration: services.crm.name });
          }
        },

        dismissSuggestion: (id) => {
          const t = get().tasks.find((x) => x.id === id);
          if (!t) return;
          set((s) => ({ tasks: s.tasks.filter((x) => x.id !== id) }));
          log({ actor: CURRENT_USER, kind: 'rejected', message: `Dismissed AI-recommended task: ${t.title}`, leadId: t.leadId });
        },

        runCommand: (text) => {
          const userMsg: ChatMessage = { id: uid('msg'), at: nowIso(), role: 'user', text };
          set((s) => ({ chat: [...s.chat, userMsg] }));
          const s = get();
          const { result, effects } = interpret(text, { leads: s.leads, tasks: s.tasks, approvals: s.approvals, audit: s.audit });
          for (const e of effects) {
            if (e.type === 'draft') get().generateFollowUps(e.leadIds);
            if (e.type === 'flag_due') e.leadIds.forEach((id) => patchLead(id, (l) => ({ ...l, followUp: 'due' })));
            if (e.type === 'suggest_tasks')
              e.items.forEach((it) => {
                const l = lead(it.leadId)!;
                get().createTask(
                  { title: it.title, ownerId: l.ownerId, priority: it.priority, dueAt: it.priority === 'Urgent' ? new Date(Date.now() + 4 * 3_600_000).toISOString() : daysFromNow(1), status: 'suggested', leadId: l.id, objective: 'Pipeline conversion', rationale: it.rationale, source: 'ai' },
                  'AI COO',
                );
              });
          }
          log({ actor: CURRENT_USER, kind: 'command', message: `Command: "${text}" → ${result.title}` });
          set((st) => ({ chat: [...st.chat, { id: uid('msg'), at: nowIso(), role: 'assistant', text: result.summary, result }] }));
        },

        runAction: (a, navigate) => {
          switch (a.kind) {
            case 'navigate':
              return navigate(a.to);
            case 'open_lead':
              return get().openLead(a.leadId);
            case 'run':
              return get().runCommand(a.command);
            case 'draft': {
              const ids = get().generateFollowUps(a.leadIds);
              get().toast(ids.length ? `${ids.length} draft${ids.length > 1 ? 's' : ''} added to the approval queue` : 'Drafts already pending for these leads', ids.length ? 'ok' : 'info');
              return;
            }
            case 'create_tasks':
              return get().runCommand('Create tasks for leads that need human follow-up');
            case 'schedule_meeting': {
              get().proposeMeeting(a.leadId);
              get().toast('Meeting proposal added to the approval queue');
              return;
            }
          }
        },

        clearChat: () => set({ chat: [] }),

        resetDemo: () => {
          const fresh = createSeed();
          set({ ...fresh, chat: [], executing: {}, openLeadId: null });
          log({ actor: CURRENT_USER, kind: 'system', message: 'Demo data reset to the seeded scenario' });
          get().toast('Demo data reset');
        },
      };
    },
    {
      name: 'stu-ai-coo-demo-v1',
      storage: createJSONStorage(() => {
        try {
          const k = '__stu_probe';
          localStorage.setItem(k, '1');
          localStorage.removeItem(k);
          return localStorage;
        } catch {
          const mem = new Map<string, string>();
          return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
        }
      }),
      partialize: (s) => ({ seededAt: s.seededAt, leads: s.leads, tasks: s.tasks, approvals: s.approvals, audit: s.audit, chat: s.chat }),
      onRehydrateStorage: () => (state) => {
        // Approvals interrupted mid-execution by a reload go back to pending.
        if (state) state.approvals = state.approvals.map((a) => (a.status === 'approved' ? { ...a, status: 'pending' } : a));
      },
    },
  ),
);

