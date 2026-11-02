// Derived business metrics. Every number on screen comes from these functions over app state.

import type { Approval, AuditEntry, Lead, LeadSource, Stage, Task } from './types';
import { LEAD_SOURCES, OPEN_STAGES } from './types';
import { HIGH_VALUE, STAGE_PROBABILITY, hoursSinceTouch, isNeglectedHighValue, isOpen, isOverdue, scoreLead } from '../services/ai/engine';
import { hoursBetween, isSameDay } from './util';
import { TEAM } from './seed';

export const ownerName = (id: string) => TEAM.find((m) => m.id === id)?.name ?? 'Unassigned';

export const isTaskOverdue = (t: Task, now = Date.now()) => t.status !== 'done' && t.status !== 'suggested' && new Date(t.dueAt).getTime() < now;
export const isTaskDueToday = (t: Task, now = Date.now()) => t.status !== 'done' && t.status !== 'suggested' && isSameDay(t.dueAt, now) && !isTaskOverdue(t, now);

export interface Kpis {
  revenueAtRisk: number;
  leadsNeedingFollowUp: number;
  highValueNeglected: number;
  openDeals: number;
  pipelineValue: number;
  weightedPipeline: number;
  aiCompleted: number;
  pendingApprovals: number;
  reengagedValue: number; // estimate
  reengagedCount: number;
  verifiedRevenue: number; // closed-won in CRM
  verifiedRecovered: number; // closed-won among re-engaged
}

export function computeKpis(leads: Lead[], approvals: Approval[], audit: AuditEntry[], now = Date.now()): Kpis {
  const open = leads.filter(isOpen);
  const overdue = open.filter((l) => isOverdue(l, now));
  const reengaged = leads.filter((l) => l.recoveredAt && l.status !== 'Lost');
  return {
    revenueAtRisk: sum(overdue.map((l) => l.value)),
    leadsNeedingFollowUp: overdue.length,
    highValueNeglected: open.filter((l) => isNeglectedHighValue(l, now)).length,
    openDeals: open.length,
    pipelineValue: sum(open.map((l) => l.value)),
    weightedPipeline: sum(open.map((l) => l.value * STAGE_PROBABILITY[l.status])),
    aiCompleted: audit.filter((a) => a.kind === 'executed').length,
    pendingApprovals: approvals.filter((a) => a.status === 'pending').length,
    reengagedValue: sum(reengaged.map((l) => l.value)),
    reengagedCount: reengaged.length,
    verifiedRevenue: sum(leads.filter((l) => l.status === 'Won').map((l) => l.value)),
    verifiedRecovered: sum(reengaged.filter((l) => l.status === 'Won').map((l) => l.value)),
  };
}

const STUCK_DAYS: Partial<Record<Stage, number>> = { New: 1, Contacted: 3, Qualified: 4, 'Meeting Booked': 5, 'Proposal Sent': 7 };

export interface Bottleneck {
  stage: Stage;
  nextStage: Stage;
  stuck: Lead[];
  stuckValue: number;
  avgDays: number;
  topOwner?: { name: string; count: number };
  overdueByOwner: { name: string; count: number }[];
  summary: string;
}

export function findBottleneck(leads: Lead[], now = Date.now()): Bottleneck | null {
  let best: Bottleneck | null = null;
  OPEN_STAGES.forEach((stage, i) => {
    const stuck = leads.filter((l) => l.status === stage && hoursBetween(l.stageEnteredAt, now) / 24 > (STUCK_DAYS[stage] ?? 5));
    if (stuck.length < 2) return;
    const stuckValue = sum(stuck.map((l) => l.value));
    if (best && stuckValue <= best.stuckValue) return;
    const avgDays = sum(stuck.map((l) => hoursBetween(l.stageEnteredAt, now) / 24)) / stuck.length;
    const byOwner = countBy(stuck.map((l) => ownerName(l.ownerId)));
    const topOwner = byOwner[0];
    const overdueByOwner = countBy(leads.filter((l) => isOverdue(l, now)).map((l) => ownerName(l.ownerId)));
    const nextStage = OPEN_STAGES[i + 1] ?? 'Won';
    const ownerOverdue = overdueByOwner.find((o) => o.name === topOwner?.name)?.count ?? 0;
    best = {
      stage, nextStage, stuck, stuckValue, avgDays, topOwner, overdueByOwner,
      summary:
        `${stage} → ${nextStage} is the bottleneck: ${stuck.length} leads worth $${Math.round(stuckValue / 1000)}k have sat in ${stage} for ${avgDays.toFixed(1)} days on average.` +
        (topOwner && topOwner.count / stuck.length >= 0.5
          ? ` ${topOwner.name} owns ${topOwner.count} of them${ownerOverdue ? ` and ${ownerOverdue} overdue follow-up${ownerOverdue > 1 ? 's' : ''}` : ''} — a capacity problem, not a demand problem.`
          : ''),
    };
  });
  return best;
}

export const FUNNEL: Stage[] = ['New', 'Contacted', 'Qualified', 'Meeting Booked', 'Proposal Sent', 'Won'];

export function funnel(leads: Lead[]) {
  const reachedIdx = (l: Lead) => (l.status === 'Lost' ? FUNNEL.indexOf(l.lostAtStage ?? 'New') : FUNNEL.indexOf(l.status));
  const reached = FUNNEL.map((_, i) => leads.filter((l) => reachedIdx(l) >= i).length);
  return FUNNEL.map((stage, i) => ({
    stage,
    reached: reached[i],
    current: leads.filter((l) => l.status === stage).length,
    value: sum(leads.filter((l) => l.status === stage).map((l) => l.value)),
    conversion: i === 0 ? 1 : reached[i - 1] ? reached[i] / reached[i - 1] : 0,
  }));
}

export function sourcePerformance(leads: Lead[], now = Date.now()) {
  return LEAD_SOURCES.map((source: LeadSource) => {
    const ls = leads.filter((l) => l.source === source);
    const won = ls.filter((l) => l.status === 'Won');
    const lost = ls.filter((l) => l.status === 'Lost');
    const open = ls.filter(isOpen);
    return {
      source,
      leads: ls.length,
      pipeline: sum(open.map((l) => l.value)),
      won: sum(won.map((l) => l.value)),
      winRate: won.length + lost.length ? won.length / (won.length + lost.length) : null,
      avgValue: ls.length ? sum(ls.map((l) => l.value)) / ls.length : 0,
      overdue: open.filter((l) => isOverdue(l, now)).length,
    };
  }).filter((s) => s.leads > 0);
}

export function delayBuckets(leads: Lead[], now = Date.now()) {
  const buckets = [
    { label: '< 24h', min: 0, max: 24 },
    { label: '24–48h', min: 24, max: 48 },
    { label: '48–72h', min: 48, max: 72 },
    { label: '72h +', min: 72, max: Infinity },
  ];
  const open = leads.filter(isOpen);
  return buckets.map((b) => {
    const ls = open.filter((l) => {
      const h = hoursSinceTouch(l, now);
      return h >= b.min && h < b.max;
    });
    return { label: b.label, count: ls.length, value: sum(ls.map((l) => l.value)), overdue: b.min >= 24 };
  });
}

/** Overdue open leads, most important first. */
export function followUpQueue(leads: Lead[], now = Date.now()) {
  return leads
    .filter((l) => isOverdue(l, now))
    .map((l) => ({ lead: l, score: scoreLead(l, now) }))
    .sort((a, b) => b.score.total - a.score.total);
}

export const isHighValue = (l: Lead) => l.value >= HIGH_VALUE;

export const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

function countBy(xs: string[]) {
  const m = new Map<string, number>();
  xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}
