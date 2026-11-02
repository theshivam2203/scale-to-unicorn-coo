// AI reasoning service — demo implementation.
// A deterministic rules engine that scores leads, recommends actions and drafts emails
// from the lead's own CRM context. In production this module is the seam where a
// server-side LLM call (with the same inputs/outputs) replaces the rules.

import type { EmailDraft, Lead, LeadSource, Priority, Stage } from '../../domain/types';
import { OPEN_STAGES } from '../../domain/types';
import { firstName, hoursBetween, nextSlots, relTime } from '../../domain/util';

export const FOLLOW_UP_SLA_HOURS = 24;
export const HIGH_VALUE = 15_000;

export const isOpen = (l: Lead) => OPEN_STAGES.includes(l.status);
export const hoursSinceTouch = (l: Lead, now = Date.now()) => hoursBetween(l.lastContactAt ?? l.createdAt, now);
export const isOverdue = (l: Lead, now = Date.now()) => isOpen(l) && hoursSinceTouch(l, now) > FOLLOW_UP_SLA_HOURS;
export const isNeglectedHighValue = (l: Lead, now = Date.now()) => isOverdue(l, now) && l.value >= HIGH_VALUE;

const STAGE_WEIGHT: Record<Stage, number> = {
  New: 10, Contacted: 12, Qualified: 20, 'Meeting Booked': 22, 'Proposal Sent': 25, Won: 0, Lost: 0,
};
const SOURCE_WEIGHT: Record<LeadSource, number> = {
  Referral: 10, Website: 8, LinkedIn: 7, 'Google Ads': 6, 'Meta Ads': 5, 'Cold Outbound': 3,
};
/** Stage-based probability of winning — used for weighted pipeline. */
export const STAGE_PROBABILITY: Record<Stage, number> = {
  New: 0.05, Contacted: 0.1, Qualified: 0.25, 'Meeting Booked': 0.4, 'Proposal Sent': 0.6, Won: 1, Lost: 0,
};

export interface ScoreBreakdown {
  total: number;
  priority: Priority;
  parts: { label: string; points: number; max: number }[];
}

export function scoreLead(l: Lead, now = Date.now()): ScoreBreakdown {
  if (!isOpen(l)) return { total: 0, priority: 'Low', parts: [] };
  const h = hoursSinceTouch(l, now);
  const value = Math.min(35, (l.value / 64_000) * 35);
  const stage = STAGE_WEIGHT[l.status];
  const delay = h > FOLLOW_UP_SLA_HOURS ? Math.min(25, 10 + (h - FOLLOW_UP_SLA_HOURS) / 2) : h > 12 ? 5 : 0;
  const source = SOURCE_WEIGHT[l.source];
  const intent = Math.min(5, (l.pendingQuestion ? 3 : 0) + l.signals.length * 2);
  const parts = [
    { label: 'Deal value', points: value, max: 35 },
    { label: 'Pipeline stage', points: stage, max: 25 },
    { label: 'Follow-up delay', points: delay, max: 25 },
    { label: 'Source quality', points: source, max: 10 },
    { label: 'Buying signals', points: intent, max: 5 },
  ].map((p) => ({ ...p, points: Math.round(p.points) }));
  const total = Math.min(100, parts.reduce((s, p) => s + p.points, 0));

  let priority: Priority = total >= 70 ? 'Critical' : total >= 55 ? 'High' : total >= 40 ? 'Medium' : 'Low';
  const overdue = h > FOLLOW_UP_SLA_HOURS;
  if (l.urgentReason || (overdue && l.pendingQuestion)) priority = 'Critical';
  else if (overdue && l.value >= HIGH_VALUE && priority !== 'Critical') priority = 'High';
  return { total, priority, parts };
}

/** Probability the deal closes in the next 7 days (demo heuristic, shown as an estimate). */
export function closeLikelihood(l: Lead, now = Date.now()): number {
  if (!isOpen(l)) return 0;
  let p = STAGE_PROBABILITY[l.status] * 0.8;
  p += l.signals.length * 0.05;
  if (l.urgentReason) p += 0.1;
  if (l.followUp === 'replied') p += 0.08;
  if (isOverdue(l, now)) p -= 0.1;
  return Math.max(0.02, Math.min(0.92, p));
}

export interface Recommendation {
  action: string;
  why: string;
  channel: 'email' | 'call' | 'meeting' | 'task' | 'none';
}

export function recommendAction(l: Lead, now = Date.now()): Recommendation {
  const h = hoursSinceTouch(l, now);
  const overdue = isOverdue(l, now);
  const first = firstName(l.name);
  if (l.status === 'Won') return { action: 'Hand off to onboarding', why: 'Deal closed — make sure kickoff is scheduled.', channel: 'task' };
  if (l.status === 'Lost') return { action: 'Add to 90-day nurture', why: `Lost${l.lostReason ? `: ${l.lostReason}` : ''}.`, channel: 'none' };
  if (l.followUp === 'draft_pending') return { action: 'Review AI follow-up draft', why: 'A personalised draft is waiting in the approval queue.', channel: 'email' };
  if (l.nextAction) return { action: l.nextAction, why: 'Set on the CRM record.', channel: 'task' };
  if (l.urgentReason) return { action: `Call ${first} today and confirm the decision meeting`, why: l.urgentReason, channel: 'call' };
  if (l.followUp === 'replied') return { action: `Reply to ${first} and book the next step`, why: 'Prospect replied to the last follow-up.', channel: 'email' };
  if (overdue && l.pendingQuestion)
    return { action: `Answer ${first}'s question and offer a call`, why: `Unanswered question for ${Math.round(h)}h: "${l.pendingQuestion}"`, channel: 'email' };
  if (l.followUp === 'sent' && l.nextFollowUpAt)
    return { action: `Wait for reply · next touch ${relTime(l.nextFollowUpAt, now)}`, why: 'Follow-up sent (simulated in demo mode).', channel: 'none' };
  const late = overdue ? `No touch for ${Math.round(h)}h (SLA ${FOLLOW_UP_SLA_HOURS}h). ` : '';
  switch (l.status) {
    case 'New':
      return { action: 'Send intro email and offer a 15-min discovery call', why: `${late}New ${l.source} lead — speed to first contact drives conversion.`, channel: 'email' };
    case 'Contacted':
      return { action: 'Send a value-add follow-up', why: `${late}Contacted but not yet qualified.`, channel: 'email' };
    case 'Qualified':
      return { action: 'Book a scoping meeting', why: `${late}Qualified for ${Math.round(hoursBetween(l.stageEnteredAt, now) / 24)}d without a meeting.`, channel: 'meeting' };
    case 'Meeting Booked':
      return { action: 'Send meeting recap and next steps', why: `${late}Keep momentum after the meeting.`, channel: 'email' };
    default:
      return { action: 'Check in on the proposal and offer a walkthrough', why: `${late}Proposal is out — remove friction to a decision.`, channel: 'email' };
  }
}

// ---------- Email drafting ----------

const IDEAS: Record<string, [string, string]> = {
  'Meta Ads management': [
    'separate prospecting and retargeting budgets so you can see true acquisition cost',
    'rotate creative on a fixed cadence before frequency starts eroding results',
  ],
  'Google Ads + SEO': [
    'tighten search terms and negative keywords to cut spend on low-intent clicks',
    'map your highest-intent keywords to dedicated landing pages',
  ],
  'Full-funnel growth retainer': [
    'connect ad spend to booked revenue so every channel is judged on the same number',
    'fix the hand-off between lead capture and sales follow-up before adding budget',
  ],
  'Patient acquisition campaigns': [
    'route enquiries to the front desk within minutes, not hours',
    'run separate campaigns for high-value treatments so they are not drowned out',
  ],
  'Email & retention marketing': [
    'set up post-purchase and win-back flows before scaling acquisition',
    'segment by purchase frequency so repeat buyers get different messages',
  ],
  'Paid social launch': [
    'start with two or three tightly defined audiences and expand from data',
    'pair launch ads with a simple landing page built for one action',
  ],
  'Local SEO + Google Business Profile': [
    'clean up your Google Business Profile categories and service areas',
    'build a steady review-request flow after every completed job',
  ],
};
const ideasFor = (interest: string): [string, string] =>
  IDEAS[interest] ?? ['review where qualified leads currently drop off', 'agree one north-star metric we report on weekly'];

export function draftFollowUp(l: Lead, ownerName: string, now = Date.now()): EmailDraft {
  const first = firstName(l.name);
  const uk = l.country === 'UK';
  const enquiry = uk ? 'enquiry' : 'inquiry';
  const [slot1, slot2] = nextSlots(2, now);
  const [ideaA, ideaB] = ideasFor(l.interest);
  const sign = `\n\nBest,\n${ownerName}\nNorthlane Digital`;
  const days = Math.max(1, Math.round(hoursSinceTouch(l, now) / 24));
  const sourcePhrase: Record<LeadSource, string> = {
    'Meta Ads': 'our Instagram ad', 'Google Ads': 'our website', Website: 'our website',
    Referral: 'your referral', LinkedIn: 'LinkedIn', 'Cold Outbound': 'my earlier note',
  };

  if (l.pendingQuestion) {
    return {
      to: l.email,
      subject: `Re: your question about ${l.interest.toLowerCase()}`,
      body:
        `Hi ${first},\n\nApologies for the slow reply to your question — "${l.pendingQuestion}"\n\n` +
        `Short answer: we scope ${l.interest.toLowerCase()} in two options — a focused starter scope and a growth scope — so you can compare cost against what each one covers. ` +
        `Given what you shared about ${l.painPoint}, I'd lean towards starting focused and expanding once we can see the numbers.\n\n` +
        `I can walk you through both options in 20 minutes. Would ${slot1} or ${slot2} work for you?` + sign,
    };
  }
  switch (l.status) {
    case 'New':
      return {
        to: l.email,
        subject: `Your ${l.interest} ${enquiry} — quick next step`,
        body:
          `Hi ${first},\n\nThanks for reaching out through ${sourcePhrase[l.source]} about ${l.interest.toLowerCase()} for ${l.company}. ` +
          `You mentioned ${l.painPoint} — that's a problem we spend a lot of time on.\n\n` +
          `Rather than send a generic deck, I'd suggest a 15-minute call so I can understand your goals and tell you honestly whether we're a fit. ` +
          `Would ${slot1} or ${slot2} work?` + sign,
      };
    case 'Contacted':
      return {
        to: l.email,
        subject: `Re: ${l.interest} for ${l.company}`,
        body:
          `Hi ${first},\n\nFollowing up on my note from ${days} day${days > 1 ? 's' : ''} ago. I've been thinking about ${l.painPoint}, and two things we'd look at first for ${l.company}:\n\n` +
          `1. ${cap(ideaA)}\n2. ${cap(ideaB)}\n\n` +
          `Happy to share how we'd approach both on a short call — would ${slot1} suit you?` + sign,
      };
    case 'Qualified':
      return {
        to: l.email,
        subject: `Next step for ${l.company}: scoping call`,
        body:
          `Hi ${first},\n\nBased on our conversation, I think the best next step is a 30-minute scoping session to map out ${l.interest.toLowerCase()} for ${l.company}. ` +
          `We'd cover your current setup, ${l.painPoint}, and what a realistic first 90 days would look like.\n\n` +
          `I have ${slot1} or ${slot2} open. Which works better?` + sign,
      };
    case 'Meeting Booked':
      return {
        to: l.email,
        subject: `Recap and next steps — ${l.company} × Northlane`,
        body:
          `Hi ${first},\n\nThanks again for your time. Quick recap of what I heard:\n\n` +
          `• Main challenge: ${l.painPoint}\n• Focus area: ${l.interest}\n\n` +
          `Proposed next steps:\n1. We send a scoped proposal with two options\n2. A 20-minute walkthrough with you and any other decision-makers (${slot2}?)\n\n` +
          `Let me know if I've missed anything.` + sign,
      };
    default:
      return {
        to: l.email,
        subject: `Your proposal from Northlane — any questions?`,
        body:
          `Hi ${first},\n\nChecking in on the proposal for ${l.company}. If it would help, I'm happy to walk you and your team through it — ` +
          `particularly how we'd tackle ${l.painPoint} in the first month.\n\nWould ${slot1} work for a 20-minute call?` + sign,
      };
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Impact text for an email approval. Always framed as an estimate, never as revenue. */
export function emailImpact(l: Lead): string {
  const weighted = Math.round((l.value * STAGE_PROBABILITY[l.status]) / 100) * 100;
  return `Re-engages a $${l.value.toLocaleString('en-US')} ${l.status} opportunity · est. weighted value $${weighted.toLocaleString('en-US')} (estimate, not revenue)`;
}
