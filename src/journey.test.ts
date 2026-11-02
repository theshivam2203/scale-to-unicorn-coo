// End-to-end user journey against the real store, engine and mock services (no UI).
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store/store';
import { computeKpis, findBottleneck, isTaskOverdue } from './domain/metrics';
import { buildBriefing } from './services/ai/briefing';
import { isNeglectedHighValue, isOpen } from './services/ai/engine';
import { EXAMPLE_COMMANDS } from './services/ai/commands';

const S = () => useStore.getState();
const kpis = () => computeKpis(S().leads, S().approvals, S().audit);

describe('seeded scenario', () => {
  beforeEach(() => S().resetDemo());

  it('matches the demo brief', () => {
    expect(S().leads).toHaveLength(20);
    expect(S().leads.filter((l) => isNeglectedHighValue(l)).map((l) => l.id).sort()).toEqual(['L01', 'L02', 'L03']);
    expect(S().tasks.filter((t) => isTaskOverdue(t))).toHaveLength(2);
    expect(S().approvals.filter((a) => a.type === 'send_email' && a.status === 'pending')).toHaveLength(4);
    expect(S().leads.filter((l) => isOpen(l) && l.urgentReason)).toHaveLength(1);
    expect(findBottleneck(S().leads)?.stage).toBe('Qualified');
    expect(kpis().reengagedValue).toBe(0);
    expect(S().leads.every((l) => l.email.endsWith('.example'))).toBe(true);
  });

  it('every example command resolves to a real intent', () => {
    for (const c of EXAMPLE_COMMANDS) S().runCommand(c);
    const intents = S().chat.filter((m) => m.role === 'assistant').map((m) => m.result!.intent);
    expect(intents).toEqual(['find_overdue', 'draft_followups', 'likely_to_close', 'revenue_leak', 'summary', 'create_tasks']);
  });

  it('refuses bulk approval', () => {
    S().runCommand('Approve all pending actions');
    expect(S().chat.at(-1)!.result!.intent).toBe('safety');
    expect(S().approvals.filter((a) => a.status === 'pending')).toHaveLength(7);
  });
});

describe('full journey: discover → investigate → draft → approve → dashboard updates', () => {
  beforeEach(() => S().resetDemo());

  it('runs end to end', async () => {
    const before = kpis();
    expect(before.leadsNeedingFollowUp).toBe(7);

    // Investigate
    S().runCommand('Find every lead that has not been contacted in the last 24 hours.');
    const found = S().chat.at(-1)!.result!;
    expect(found.rows!.length).toBe(7);
    expect(found.rows![0].leadId).toBe('L01'); // pending question → critical, highest score

    // Draft follow-ups (3 neglected high-value leads have no drafts yet)
    S().runCommand('Prepare follow-up emails for every overdue lead');
    const drafted = S().approvals.filter((a) => a.status === 'pending' && a.type === 'send_email');
    expect(drafted).toHaveLength(7);
    const sarahDraft = drafted.find((a) => a.leadId === 'L01')!;
    expect(sarahDraft.payload.email!.body).toContain('pricing for a 6-month engagement');
    expect(S().leads.find((l) => l.id === 'L01')!.followUp).toBe('draft_pending');

    // Edit then approve
    S().editApproval(sarahDraft.id, { email: { ...sarahDraft.payload.email!, subject: 'Pricing options for Harbor & Pine' } });
    await S().approve(sarahDraft.id);
    const a = S().approvals.find((x) => x.id === sarahDraft.id)!;
    expect(a.status).toBe('executed');
    expect(a.edited).toBe(true);
    expect(a.result).toMatch(/not delivered/);
    const sarah = S().leads.find((l) => l.id === 'L01')!;
    expect(sarah.followUp).toBe('sent');
    expect(sarah.pendingQuestion).toBeUndefined();
    expect(sarah.everNeglected).toBe(true);
    expect(sarah.activities.find((x) => x.type === 'email_out')!.simulated).toBe(true);
    expect(S().tasks.some((t) => t.leadId === 'L01' && t.title.includes('if no reply'))).toBe(true);
    const kinds = S().audit.filter((e) => e.approvalId === sarahDraft.id).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['proposed', 'edited', 'approved', 'executed']));

    // Reject one with a reason
    const chloe = S().approvals.find((x) => x.leadId === 'L03' && x.status === 'pending')!;
    S().reject(chloe.id, 'Already contacted by phone');
    expect(S().audit[0].message).toContain('Already contacted by phone');
    expect(S().leads.find((l) => l.id === 'L03')!.followUp).toBe('due');

    // Approve the immediate-attention meeting
    await S().approve('A05');
    const atlas = S().leads.find((l) => l.id === 'L04')!;
    expect(atlas.urgentReason).toBeUndefined();

    // Other approval types
    await S().approve('A06');
    expect(S().leads.find((l) => l.id === 'L09')!.nextAction).toContain('Thursday');
    const tasksBefore = S().tasks.length;
    await S().approve('A07');
    expect(S().tasks.length).toBe(tasksBefore + 1);

    // Dashboard reflects it
    const after = kpis();
    expect(after.leadsNeedingFollowUp).toBe(6);
    expect(after.revenueAtRisk).toBe(before.revenueAtRisk - 42_000);
    expect(after.aiCompleted).toBe(before.aiCompleted + 4);
    expect(after.reengagedValue).toBe(0); // sending is not recovery

    // Prospect replies (simulated) → re-engaged estimate, then won → verified
    S().simulateReply('L01');
    expect(kpis().reengagedValue).toBe(42_000);
    S().changeStatus('L01', 'Won');
    expect(kpis().verifiedRecovered).toBe(42_000);

    // Briefing reflects state
    const b = buildBriefing(S());
    expect(b.narrative).not.toContain('Sarah Whitfield (Harbor');
    expect(b.completed.length).toBeGreaterThanOrEqual(4);

    // Tasks: suggestions → accept → complete; rebalance
    S().runCommand('Create tasks for leads that need human follow-up.');
    const sug = S().tasks.filter((t) => t.status === 'suggested' && t.id !== 'T13');
    expect(sug.length).toBeGreaterThan(0);
    S().acceptSuggestion(sug[0].id);
    S().completeTask(sug[0].id);
    expect(S().tasks.find((t) => t.id === sug[0].id)!.status).toBe('done');
    S().acceptSuggestion('T13');
    expect(S().leads.filter((l) => l.ownerId === 'u-priya' && l.status === 'Qualified').length).toBe(2);

    // Reset restores the scenario
    S().resetDemo();
    expect(kpis().leadsNeedingFollowUp).toBe(7);
    expect(S().chat).toHaveLength(0);
  });
});
