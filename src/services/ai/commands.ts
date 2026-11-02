// Command interpreter for the AI COO Command Center.
// interpret() is pure: it reads a state snapshot and returns a structured result plus a list
// of effects. The store applies the effects (creating drafts, tasks, flags) so commands
// genuinely change application state.

import type { Approval, AuditEntry, Lead, Task } from '../../domain/types';
import { computeKpis, findBottleneck, followUpQueue, funnel, isTaskDueToday, isTaskOverdue, ownerName, sourcePerformance } from '../../domain/metrics';
import { money, pct } from '../../domain/util';
import { buildBriefing } from './briefing';
import { FOLLOW_UP_SLA_HOURS, HIGH_VALUE, closeLikelihood, hoursSinceTouch, isOpen, isOverdue, recommendAction, scoreLead } from './engine';

export type CommandAction =
  | { kind: 'navigate'; label: string; to: string }
  | { kind: 'draft'; label: string; leadIds: string[] }
  | { kind: 'create_tasks'; label: string; leadIds: string[] }
  | { kind: 'open_lead'; label: string; leadId: string }
  | { kind: 'schedule_meeting'; label: string; leadId: string }
  | { kind: 'run'; label: string; command: string };

export interface ResultRow {
  leadId?: string;
  taskId?: string;
  primary: string;
  secondary?: string;
  metric?: string;
  badge?: string;
  tone?: 'danger' | 'warn' | 'ok' | 'info' | 'neutral';
}

export interface CommandResult {
  intent: string;
  title: string;
  summary: string;
  reasoning: string[];
  stats?: { label: string; value: string; hint?: string }[];
  rows?: ResultRow[];
  changes?: string[]; // state changes applied by this command
  actions: CommandAction[];
}

export type Effect =
  | { type: 'draft'; leadIds: string[] }
  | { type: 'suggest_tasks'; items: { leadId: string; title: string; rationale: string; priority: Task['priority'] }[] }
  | { type: 'flag_due'; leadIds: string[] };

export interface Snapshot {
  leads: Lead[];
  tasks: Task[];
  approvals: Approval[];
  audit: AuditEntry[];
}

export const EXAMPLE_COMMANDS = [
  'Find every lead that has not been contacted in the last 24 hours.',
  'Prepare follow-up emails for all qualified leads.',
  'Show me which deals are most likely to close this week.',
  'Identify where we are losing revenue.',
  "Summarize today's business operations.",
  'Create tasks for leads that need human follow-up.',
];

const leadRow = (l: Lead, now: number, extra?: Partial<ResultRow>): ResultRow => {
  const s = scoreLead(l, now);
  return {
    leadId: l.id,
    primary: `${l.name} · ${l.company}`,
    secondary: `${l.status} · ${ownerName(l.ownerId)} · last touch ${Math.round(hoursSinceTouch(l, now))}h ago`,
    metric: money(l.value),
    badge: `${s.priority} · ${s.total}`,
    tone: s.priority === 'Critical' ? 'danger' : s.priority === 'High' ? 'warn' : 'neutral',
    ...extra,
  };
};

function mentionedLeads(text: string, leads: Lead[]): Lead[] {
  const t = text.toLowerCase();
  return leads.filter((l) => {
    const names = [l.name, ...l.name.split(' '), l.company, l.company.split(' ')[0]].map((x) => x.toLowerCase().replace(/[^a-z0-9&' ]/g, ''));
    return names.some((n) => n.length > 3 && new RegExp(`\\b${escape(n)}\\b`).test(t));
  });
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function interpret(text: string, s: Snapshot, now = Date.now()): { result: CommandResult; effects: Effect[] } {
  const t = text.toLowerCase().trim();
  const open = s.leads.filter(isOpen);
  const mentioned = mentionedLeads(t, s.leads);
  const pendingDraftLeads = new Set(s.approvals.filter((a) => a.status === 'pending' && a.type === 'send_email').map((a) => a.leadId));

  // --- Safety: no bulk auto-approval or direct sending ---
  if (/\b(approve|execute)\b.*\b(all|everything)\b/.test(t) || /\bauto[- ]?approve\b/.test(t)) {
    const pending = s.approvals.filter((a) => a.status === 'pending');
    return {
      effects: [],
      result: {
        intent: 'safety',
        title: 'Approvals stay with you',
        summary: `I can't bulk-approve actions. Each of the ${pending.length} pending action${pending.length === 1 ? '' : 's'} needs an explicit human decision before I simulate it.`,
        reasoning: ['Execution policy: sensitive actions require explicit approval.', 'Review each card — you can edit drafts before approving.'],
        actions: [{ kind: 'navigate', label: 'Open approval queue', to: '/approvals' }],
      },
    };
  }

  // --- Create tasks for human follow-up ---
  if (/(create|make|add|assign).*(task|to-?do)/.test(t)) {
    const linked = new Set(s.tasks.filter((x) => x.status !== 'done' && x.leadId).map((x) => x.leadId));
    const needHuman = open.filter(
      (l) => !linked.has(l.id) && (l.urgentReason || (isOverdue(l, now) && (l.value >= HIGH_VALUE || l.pendingQuestion)) || l.followUp === 'replied'),
    );
    const items = needHuman.map((l) => {
      const rec = recommendAction(l, now);
      return {
        leadId: l.id,
        title: l.urgentReason ? `Call ${l.name} (${l.company}) before the decision meeting` : l.pendingQuestion ? `Personally answer ${l.name}'s question (${l.company})` : `${rec.action} — ${l.company}`,
        rationale: l.urgentReason ?? (l.pendingQuestion ? `Prospect asked a direct question ${Math.round(hoursSinceTouch(l, now))}h ago; a personal reply converts better than automation.` : `${money(l.value)} deal past SLA — needs a human touch, not just an email.`),
        priority: (l.urgentReason || l.pendingQuestion ? 'Urgent' : 'High') as Task['priority'],
      };
    });
    return {
      effects: items.length ? [{ type: 'suggest_tasks', items }] : [],
      result: {
        intent: 'create_tasks',
        title: items.length ? `Proposed ${items.length} human follow-up task${items.length > 1 ? 's' : ''}` : 'No new tasks needed',
        summary: items.length
          ? `These leads need a person, not just an email: high value past SLA, a direct question, an imminent decision, or a fresh reply. I added them as AI-recommended tasks assigned to each lead owner — accept them in Operations to put them on the board.`
          : 'Every lead that needs a human touch already has an open task.',
        reasoning: ['Criteria: imminent decision, unanswered question, reply received, or ≥ $15k past the 24h SLA.', 'Leads that already have an open task were skipped.'],
        rows: needHuman.map((l, i) => leadRow(l, now, { secondary: items[i].title, badge: items[i].priority, tone: items[i].priority === 'Urgent' ? 'danger' : 'warn' })),
        changes: items.length ? [`${items.length} AI-recommended task${items.length > 1 ? 's' : ''} added to Operations`] : [],
        actions: [{ kind: 'navigate', label: 'Review recommended tasks', to: '/operations' }],
      },
    };
  }

  // --- Draft follow-ups ---
  if (/(prepare|draft|write|generate|compose|create).*(follow|email|message)/.test(t) || /^(send|email)\b/.test(t)) {
    let targets: Lead[];
    let scope: string;
    if (mentioned.length) {
      targets = mentioned.filter(isOpen);
      scope = targets.map((l) => l.name).join(', ');
    } else if (/qualified/.test(t)) {
      targets = open.filter((l) => l.status === 'Qualified' && hoursSinceTouch(l, now) > 12);
      scope = 'qualified leads not contacted in the last 12h';
    } else if (/high[- ]?value/.test(t)) {
      targets = open.filter((l) => isOverdue(l, now) && l.value >= HIGH_VALUE);
      scope = 'overdue high-value leads';
    } else {
      targets = open.filter((l) => isOverdue(l, now));
      scope = `leads past the ${FOLLOW_UP_SLA_HOURS}h follow-up SLA`;
    }
    const already = targets.filter((l) => pendingDraftLeads.has(l.id));
    const fresh = targets.filter((l) => !pendingDraftLeads.has(l.id) && l.followUp !== 'sent');
    const recentlySent = targets.filter((l) => l.followUp === 'sent');
    const directSend = /^(send|email)\b/.test(t);
    return {
      effects: fresh.length ? [{ type: 'draft', leadIds: fresh.map((l) => l.id) }] : [],
      result: {
        intent: 'draft_followups',
        title: fresh.length ? `Drafted ${fresh.length} personalised follow-up${fresh.length > 1 ? 's' : ''}` : 'No new drafts needed',
        summary: fresh.length
          ? `I wrote ${fresh.length} follow-up${fresh.length > 1 ? 's' : ''} for ${scope}, using each lead's stage, stated pain point and last interaction. They are in the approval queue as drafts — nothing has been sent.`
          : `I checked ${targets.length} ${scope}; none need a new draft right now.`,
        reasoning: [
          ...(directSend ? ['Demo mode never sends email directly — I prepare drafts and route them to you for approval.'] : []),
          'Drafts reference the specific question or pain point on the CRM record rather than a generic template.',
          ...(already.length ? [`${already.length} already had a draft waiting for approval — left unchanged.`] : []),
          ...(recentlySent.length ? [`${recentlySent.length} were followed up recently — skipped to avoid double-contacting.`] : []),
        ],
        rows: [
          ...fresh.map((l) => leadRow(l, now, { badge: 'Draft created', tone: 'info' as const })),
          ...already.map((l) => leadRow(l, now, { badge: 'Draft already pending', tone: 'neutral' as const })),
        ],
        changes: fresh.length ? [`${fresh.length} draft email${fresh.length > 1 ? 's' : ''} added to the approval queue`, 'Lead follow-up status set to "Draft awaiting approval"'] : [],
        actions: [
          ...(fresh.length || already.length ? [{ kind: 'navigate' as const, label: 'Review drafts in approval queue', to: '/approvals' }] : []),
          { kind: 'navigate', label: 'Open follow-up workflow', to: '/follow-up' },
        ],
      },
    };
  }

  // --- Leads not contacted / needing follow-up ---
  if (/(not|n't|never|no|without).*(contact|follow|touch|respon|repl)|neglect|24 ?h|overdue lead|need(s)? (a )?follow|missed follow|uncontacted/.test(t)) {
    const q = followUpQueue(s.leads, now);
    const value = q.reduce((x, y) => x + y.lead.value, 0);
    const noDraft = q.filter((x) => !pendingDraftLeads.has(x.lead.id));
    const toFlag = q.filter((x) => x.lead.followUp === 'ok').map((x) => x.lead.id);
    const hv = q.filter((x) => x.lead.value >= HIGH_VALUE);
    return {
      effects: toFlag.length ? [{ type: 'flag_due', leadIds: toFlag }] : [],
      result: {
        intent: 'find_overdue',
        title: `${q.length} lead${q.length === 1 ? '' : 's'} not contacted in the last ${FOLLOW_UP_SLA_HOURS}h`,
        summary: q.length
          ? `${money(value)} of pipeline is waiting on us. ${hv.length} of these are high-value (≥ ${money(HIGH_VALUE)}). Sorted by priority score.`
          : 'Every open lead has been contacted within the SLA.',
        stats: [
          { label: 'Leads past SLA', value: String(q.length) },
          { label: 'Value waiting', value: money(value, true) },
          { label: 'Without a draft', value: String(noDraft.length) },
        ],
        reasoning: [
          `Rule: open lead with no outbound touch for more than ${FOLLOW_UP_SLA_HOURS}h (new leads measured from when they arrived).`,
          'Score = deal value + stage + delay + source quality + buying signals (0–100).',
          ...(q.some((x) => x.lead.pendingQuestion) ? ['Leads with an unanswered question are marked Critical regardless of score.'] : []),
        ],
        rows: q.map((x) => leadRow(x.lead, now, pendingDraftLeads.has(x.lead.id) ? { secondary: `${x.lead.status} · draft awaiting approval` } : {})),
        changes: toFlag.length ? [`${toFlag.length} lead${toFlag.length > 1 ? 's' : ''} flagged "Follow-up due" in the CRM (demo)`] : [],
        actions: [
          ...(noDraft.length ? [{ kind: 'draft' as const, label: `Draft follow-ups for ${noDraft.length} lead${noDraft.length > 1 ? 's' : ''}`, leadIds: noDraft.map((x) => x.lead.id) }] : []),
          ...(hv.length ? [{ kind: 'create_tasks' as const, label: 'Create human follow-up tasks', leadIds: hv.map((x) => x.lead.id) }] : []),
          ...(q[0] ? [{ kind: 'open_lead' as const, label: `Open ${q[0].lead.name}`, leadId: q[0].lead.id }] : []),
        ],
      },
    };
  }

  // --- Deals likely to close ---
  if (/(close|closing|likely|forecast|hot deal|win this week|best deal)/.test(t)) {
    const ranked = open.map((l) => ({ l, p: closeLikelihood(l, now) })).sort((a, b) => b.p - a.p).slice(0, 6);
    const expected = ranked.reduce((x, r) => x + r.p * r.l.value, 0);
    const top = ranked[0]?.l;
    return {
      effects: [],
      result: {
        intent: 'likely_to_close',
        title: 'Deals most likely to close this week',
        summary: top
          ? `${top.company} leads at an estimated ${pct(ranked[0].p)}. Probability-weighted value of the top ${ranked.length}: ${money(expected)} — an estimate, not a forecast commitment.`
          : 'No open deals.',
        stats: [
          { label: 'Top deals', value: String(ranked.length) },
          { label: 'Weighted value', value: money(expected, true), hint: 'estimate' },
        ],
        reasoning: [
          'Likelihood = stage probability, adjusted up for buying signals (proposal views, forwards, replies) and imminent decisions, down for missed follow-ups.',
          ...(ranked.filter((r) => isOverdue(r.l, now)).length ? [`${ranked.filter((r) => isOverdue(r.l, now)).length} of these are past the follow-up SLA — fixing that is the cheapest way to raise the odds.`] : []),
        ],
        rows: ranked.map(({ l, p }) => ({
          leadId: l.id, primary: `${l.company} · ${l.name}`, secondary: `${l.status}${l.signals.length ? ' · ' + l.signals.join(', ') : ''}`,
          metric: money(l.value), badge: `${pct(p)} est.`, tone: p > 0.5 ? 'ok' : p > 0.3 ? 'info' : 'neutral',
        })),
        actions: [
          ...(top && !s.approvals.some((a) => a.status === 'pending' && a.type === 'schedule_meeting' && a.leadId === top.id)
            ? [{ kind: 'schedule_meeting' as const, label: `Propose meeting with ${top.name}`, leadId: top.id }]
            : []),
          ...(top ? [{ kind: 'open_lead' as const, label: `Open ${top.company}`, leadId: top.id }] : []),
          { kind: 'navigate', label: 'Revenue intelligence', to: '/revenue' },
        ],
      },
    };
  }

  // --- Revenue leakage ---
  if (/(los(e|ing|t)|leak|revenue|money|at risk|where.*(drop|leak))/.test(t)) {
    const k = computeKpis(s.leads, s.approvals, s.audit, now);
    const q = followUpQueue(s.leads, now);
    const b = findBottleneck(s.leads, now);
    const slowLost = s.leads.filter((l) => l.status === 'Lost' && /follow/i.test(l.lostReason ?? ''));
    const blockedClient = s.tasks.filter((x) => x.status === 'blocked' && x.clientId);
    const rows: ResultRow[] = [
      { primary: 'Missed follow-ups', secondary: `${q.length} open leads past the ${FOLLOW_UP_SLA_HOURS}h SLA`, metric: money(k.revenueAtRisk), badge: 'At risk', tone: 'danger' },
      ...(b ? [{ primary: `Stalled in ${b.stage}`, secondary: `${b.stuck.length} leads, avg ${b.avgDays.toFixed(1)} days in stage`, metric: money(b.stuckValue), badge: 'Bottleneck', tone: 'warn' as const }] : []),
      ...slowLost.map((l) => ({ leadId: l.id, primary: `Lost: ${l.company}`, secondary: l.lostReason, metric: money(l.value), badge: 'Lost to slow follow-up', tone: 'neutral' as const })),
      ...blockedClient.map((x) => ({ taskId: x.id, primary: `Client delivery blocked: ${x.title}`, secondary: x.blockedReason, badge: 'Retention risk', tone: 'warn' as const })),
    ];
    const hv = q.filter((x) => x.lead.value >= HIGH_VALUE && !pendingDraftLeads.has(x.lead.id));
    return {
      effects: [],
      result: {
        intent: 'revenue_leak',
        title: 'Where revenue is leaking',
        summary: `The biggest leak is speed-to-follow-up: ${money(k.revenueAtRisk)} of open pipeline has gone more than ${FOLLOW_UP_SLA_HOURS}h without a touch.${b ? ` Second is a ${b.stage} bottleneck holding ${money(b.stuckValue)}.` : ''}${slowLost.length ? ` We have already lost ${money(slowLost.reduce((x, l) => x + l.value, 0))} where slow follow-up was recorded as the cause.` : ''}`,
        stats: [
          { label: 'Pipeline at risk', value: money(k.revenueAtRisk, true) },
          { label: 'Open pipeline', value: money(k.pipelineValue, true) },
          { label: 'Verified revenue (won)', value: money(k.verifiedRevenue, true) },
        ],
        reasoning: [
          '"At risk" is full deal value of open leads past SLA — it is exposure, not a loss forecast.',
          ...(b ? [b.summary] : []),
          'Recommended order: answer pending questions, follow up high-value leads, then rebalance owner workload.',
        ],
        rows,
        actions: [
          ...(hv.length ? [{ kind: 'draft' as const, label: `Draft follow-ups for ${hv.length} high-value lead${hv.length > 1 ? 's' : ''}`, leadIds: hv.map((x) => x.lead.id) }] : []),
          { kind: 'navigate', label: 'Revenue intelligence', to: '/revenue' },
          { kind: 'navigate', label: 'Operations & bottlenecks', to: '/operations' },
        ],
      },
    };
  }

  // --- Summary / briefing ---
  if (/(summar|today|brief|status|what.*happen|overview|update me|morning)/.test(t)) {
    const br = buildBriefing(s, now);
    const k = computeKpis(s.leads, s.approvals, s.audit, now);
    return {
      effects: [],
      result: {
        intent: 'summary',
        title: "Today's operations",
        summary: `${br.greeting} ${br.narrative}`,
        stats: [
          { label: 'Open pipeline', value: money(k.pipelineValue, true) },
          { label: 'At risk', value: money(k.revenueAtRisk, true) },
          { label: 'Pending approvals', value: String(k.pendingApprovals) },
          { label: 'AI actions completed', value: String(k.aiCompleted) },
        ],
        reasoning: br.priorities.slice(0, 4).map((p, i) => `${i + 1}. ${p.text}`),
        actions: [
          { kind: 'navigate', label: 'Full daily briefing', to: '/briefing' },
          ...(k.pendingApprovals ? [{ kind: 'navigate' as const, label: 'Review approvals', to: '/approvals' }] : []),
        ],
      },
    };
  }

  // --- Operations / bottlenecks ---
  if (/(bottleneck|overdue task|blocked|operation|team|capacity|workload|task)/.test(t)) {
    const overdue = s.tasks.filter((x) => isTaskOverdue(x, now));
    const blocked = s.tasks.filter((x) => x.status === 'blocked');
    const today = s.tasks.filter((x) => isTaskDueToday(x, now));
    const b = findBottleneck(s.leads, now);
    return {
      effects: [],
      result: {
        intent: 'operations',
        title: 'Operational bottlenecks',
        summary: b ? b.summary : 'No pipeline-stage bottleneck detected.',
        stats: [
          { label: 'Overdue tasks', value: String(overdue.length) },
          { label: 'Blocked', value: String(blocked.length) },
          { label: 'Due today', value: String(today.length) },
        ],
        reasoning: [
          'Attention order: overdue client deliverables → blocked urgent tasks → pipeline bottleneck.',
          ...blocked.map((x) => `Blocked "${x.title}": ${x.blockedReason}`),
        ],
        rows: [...overdue, ...blocked].map((x) => ({
          taskId: x.id, primary: x.title, secondary: `${ownerName(x.ownerId)} · ${x.status === 'blocked' ? 'Blocked' : 'Overdue'}`,
          badge: x.priority, tone: x.status === 'blocked' ? 'warn' : 'danger',
        })),
        actions: [{ kind: 'navigate', label: 'Open operations', to: '/operations' }],
      },
    };
  }

  // --- Funnel / pipeline ---
  if (/(pipeline|conversion|funnel|source|channel)/.test(t)) {
    const f = funnel(s.leads);
    const src = sourcePerformance(s.leads, now).sort((a, b) => b.pipeline - a.pipeline);
    const weakest = f.slice(1).reduce((m, x) => (x.conversion < m.conversion ? x : m), f[1]);
    return {
      effects: [],
      result: {
        intent: 'pipeline',
        title: 'Pipeline and conversion',
        summary: `Weakest conversion step is into ${weakest.stage} (${pct(weakest.conversion)}). ${src[0]?.source} carries the most open pipeline.`,
        reasoning: ['Conversion = share of leads that reached the previous stage and also reached this one (lost deals counted at the stage they were lost).'],
        rows: [
          ...f.slice(1).map((x) => ({ primary: `→ ${x.stage}`, secondary: `${x.reached} reached`, badge: pct(x.conversion), tone: (x.conversion < 0.6 ? 'warn' : 'neutral') as ResultRow['tone'] })),
          ...src.map((x) => ({ primary: x.source, secondary: `${x.leads} leads · ${x.overdue} overdue`, metric: money(x.pipeline), badge: x.winRate === null ? 'no closed deals' : `${pct(x.winRate)} win rate`, tone: 'neutral' as const })),
        ],
        actions: [{ kind: 'navigate', label: 'Revenue intelligence', to: '/revenue' }],
      },
    };
  }

  // --- Specific lead lookup ---
  if (mentioned.length) {
    const l = mentioned[0];
    const rec = recommendAction(l, now);
    const sc = scoreLead(l, now);
    return {
      effects: [],
      result: {
        intent: 'lead_lookup',
        title: `${l.name} · ${l.company}`,
        summary: `${l.status} · ${money(l.value)} · owner ${ownerName(l.ownerId)}. Recommended: ${rec.action}.`,
        stats: isOpen(l)
          ? [
              { label: 'Priority', value: `${sc.priority} (${sc.total})` },
              { label: 'Last touch', value: `${Math.round(hoursSinceTouch(l, now))}h ago` },
              { label: 'Close likelihood', value: pct(closeLikelihood(l, now)), hint: 'estimate' },
            ]
          : undefined,
        reasoning: [rec.why, `Interested in ${l.interest}; pain point: ${l.painPoint}.`],
        actions: [
          { kind: 'open_lead', label: 'Open lead', leadId: l.id },
          ...(isOpen(l) && !pendingDraftLeads.has(l.id) ? [{ kind: 'draft' as const, label: 'Draft follow-up', leadIds: [l.id] }] : []),
        ],
      },
    };
  }

  return {
    effects: [],
    result: {
      intent: 'help',
      title: "Here's what I can do",
      summary: "I didn't map that to an operation yet. I work on your live demo data — try one of these:",
      reasoning: [],
      actions: EXAMPLE_COMMANDS.map((c) => ({ kind: 'run' as const, label: c, command: c })),
    },
  };
}
