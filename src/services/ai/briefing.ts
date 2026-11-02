// Daily executive briefing, generated from the current application state.

import type { Approval, AuditEntry, Lead, Task } from '../../domain/types';
import { findBottleneck, followUpQueue, isTaskOverdue, ownerName } from '../../domain/metrics';
import { CLIENTS, CURRENT_USER } from '../../domain/seed';
import { firstName, hoursBetween, money } from '../../domain/util';
import { closeLikelihood, hoursSinceTouch, isOpen, recommendAction } from './engine';

export interface BriefItem {
  text: string;
  detail?: string;
  leadId?: string;
  taskId?: string;
  approvalId?: string;
  to?: string;
}

export interface Briefing {
  greeting: string;
  narrative: string;
  developments: BriefItem[];
  critical: BriefItem[];
  opportunities: BriefItem[];
  priorities: BriefItem[];
  completed: BriefItem[];
  awaiting: BriefItem[];
}

export function buildBriefing(s: { leads: Lead[]; tasks: Task[]; approvals: Approval[]; audit: AuditEntry[] }, now = Date.now()): Briefing {
  const { leads, tasks, approvals, audit } = s;
  const hour = new Date(now).getHours();
  const greeting = `Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}, ${firstName(CURRENT_USER)}.`;
  const queue = followUpQueue(leads, now);
  const urgent = leads.filter((l) => isOpen(l) && l.urgentReason);
  const highPriority = queue.filter((q) => q.score.priority === 'Critical' || q.score.priority === 'High');
  const waiting = queue.filter((q) => q.lead.pendingQuestion).sort((a, b) => hoursSinceTouch(b.lead, now) - hoursSinceTouch(a.lead, now))[0];
  const overdueTasks = tasks.filter((t) => isTaskOverdue(t, now));
  const blocked = tasks.filter((t) => t.status === 'blocked');
  const pending = approvals.filter((a) => a.status === 'pending');
  const drafts = pending.filter((a) => a.type === 'send_email');
  const dayAgo = now - 24 * 3_600_000;
  const executedToday = audit.filter((a) => a.kind === 'executed' && new Date(a.at).getTime() > dayAgo);
  const replied = leads.filter((l) => isOpen(l) && l.followUp === 'replied');
  const bottleneck = findBottleneck(leads, now);

  // ---- Narrative ----
  const parts: string[] = [];
  const hpCount = new Set([...highPriority.map((q) => q.lead.id), ...urgent.map((l) => l.id)]).size;
  if (hpCount) parts.push(`${spell(hpCount, true)} high-priority lead${hpCount > 1 ? 's need' : ' needs'} attention today.`);
  if (waiting) {
    const h = Math.round(hoursSinceTouch(waiting.lead, now));
    parts.push(`${waiting.lead.status === 'Qualified' ? 'One qualified prospect' : waiting.lead.name}${waiting.lead.status === 'Qualified' ? ` (${waiting.lead.name}, ${waiting.lead.company})` : ''} has been waiting ${h} hours for a response.`);
  }
  if (urgent[0]) parts.push(`${urgent[0].company} (${money(urgent[0].value)}) needs immediate attention — ${lowerFirst(urgent[0].urgentReason!.split(';')[0])}.`);
  if (replied.length) parts.push(`${spell(replied.length, true)} prospect${replied.length > 1 ? 's have' : ' has'} replied to recent follow-ups.`);
  if (overdueTasks.length) parts.push(`${spell(overdueTasks.length, true)} task${overdueTasks.length > 1 ? 's are' : ' is'} overdue${blocked.length ? ` and ${spell(blocked.length)} ${blocked.length > 1 ? 'are' : 'is'} blocked` : ''}.`);
  if (drafts.length) parts.push(`${spell(drafts.length, true)} follow-up draft${drafts.length > 1 ? 's are' : ' is'} ready for review.`);
  else if (pending.length) parts.push(`${spell(pending.length, true)} action${pending.length > 1 ? 's await' : ' awaits'} your approval.`);
  const first = urgent[0] ?? waiting?.lead ?? queue[0]?.lead;
  if (first) parts.push(`I recommend starting with ${first.name} at ${first.company} — ${lowerFirst(recommendAction(first, now).action)}.`);
  if (!parts.length) parts.push('No critical issues right now. Pipeline follow-ups are within SLA and nothing is waiting on you.');

  // ---- Sections ----
  const developments: BriefItem[] = [];
  for (const l of leads) {
    for (const a of l.activities) {
      if (new Date(a.at).getTime() < dayAgo) continue;
      if (a.type === 'form') developments.push({ text: `New ${l.source} lead: ${l.name} (${l.company})`, detail: money(l.value) + ' est. value', leadId: l.id });
      if (a.type === 'email_in') developments.push({ text: `${l.name} replied${a.simulated ? ' (simulated)' : ''}`, detail: a.text, leadId: l.id });
      if (a.type === 'meeting') developments.push({ text: `Meeting activity: ${l.company}`, detail: a.text, leadId: l.id });
      if (a.type === 'status') developments.push({ text: `${l.company}: ${a.text}`, leadId: l.id });
      if (a.type === 'ai' && a.text.startsWith('Signal')) developments.push({ text: `${l.company}: ${a.text.replace('Signal detected: ', '')}`, leadId: l.id });
    }
  }

  const critical: BriefItem[] = [
    ...queue
      .filter((q) => q.lead.value >= 15_000)
      .map((q) => ({
        text: `${q.lead.name} (${q.lead.company}) — no follow-up for ${Math.round(hoursSinceTouch(q.lead, now))}h`,
        detail: `${money(q.lead.value)} ${q.lead.status} · owner ${ownerName(q.lead.ownerId)}`,
        leadId: q.lead.id,
      })),
    ...overdueTasks.map((t) => ({ text: `Overdue: ${t.title}`, detail: `${ownerName(t.ownerId)} · due ${Math.round(hoursBetween(t.dueAt, now) / 24) || 1}d ago`, taskId: t.id, to: '/operations' })),
    ...blocked.filter((t) => t.priority === 'Urgent').map((t) => ({ text: `Blocked: ${t.title}`, detail: t.blockedReason, taskId: t.id, to: '/operations' })),
    ...CLIENTS.filter((c) => c.health === 'At risk').map((c) => ({ text: `Client at risk: ${c.name}`, detail: `${money(c.retainer)}/mo retainer`, to: '/operations' })),
  ];

  const opportunities: BriefItem[] = [
    ...urgent.map((l) => ({ text: `${l.company} — ${money(l.value)} ${l.status}`, detail: l.urgentReason, leadId: l.id })),
    ...replied.map((l) => ({ text: `${l.name} replied — book the next step`, detail: `${money(l.value)} ${l.status}`, leadId: l.id })),
    ...leads
      .filter((l) => isOpen(l) && !l.urgentReason && l.followUp !== 'replied')
      .map((l) => ({ l, p: closeLikelihood(l, now) }))
      .sort((a, b) => b.p * b.l.value - a.p * a.l.value)
      .slice(0, 2)
      .map(({ l, p }) => ({ text: `${l.company} — ${Math.round(p * 100)}% est. close likelihood this week`, detail: `${money(l.value)} ${l.status}`, leadId: l.id })),
  ];

  const priorities: BriefItem[] = [];
  if (urgent[0]) priorities.push({ text: `Secure ${urgent[0].company}: ${recommendAction(urgent[0], now).action}`, leadId: urgent[0].id });
  if (waiting && waiting.lead.id !== urgent[0]?.id) priorities.push({ text: `Reply to ${waiting.lead.name}'s question (${money(waiting.lead.value)})`, leadId: waiting.lead.id });
  const neglectedNoDraft = queue.filter((q) => q.lead.followUp !== 'draft_pending' && q.lead.value >= 15_000 && q.lead.id !== waiting?.lead.id);
  if (neglectedNoDraft.length) priorities.push({ text: `Generate follow-ups for ${neglectedNoDraft.length} more neglected high-value lead${neglectedNoDraft.length > 1 ? 's' : ''}`, to: '/follow-up' });
  if (pending.length) priorities.push({ text: `Review ${pending.length} pending approval${pending.length > 1 ? 's' : ''}`, to: '/approvals' });
  if (overdueTasks.length) priorities.push({ text: `Clear ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`, to: '/operations' });
  if (bottleneck) priorities.push({ text: `Fix the ${bottleneck.stage} bottleneck`, detail: bottleneck.summary, to: '/operations' });

  return {
    greeting,
    narrative: parts.join(' '),
    developments: developments.slice(0, 8),
    critical,
    opportunities,
    priorities: priorities.slice(0, 6),
    completed: executedToday.slice(0, 8).map((a) => ({ text: a.message, leadId: a.leadId })),
    awaiting: pending.map((a) => ({ text: a.title, detail: a.impact, approvalId: a.id, to: '/approvals' })),
  };
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
function spell(n: number, capital = false) {
  const w = WORDS[n] ?? String(n);
  return capital ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
