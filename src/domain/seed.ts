// Seeded demo scenario: "Northlane Digital", a fictional marketing agency with five retained
// clients and 20 prospective leads. All people, companies, emails (.example) and phone numbers
// (reserved fictional ranges) are invented.

import type { Activity, Approval, AuditEntry, Client, Lead, Task, TeamMember } from './types';
import { daysAgo, daysFromNow, endOfToday, hoursAgo, nextBusinessDayAt } from './util';
import { draftFollowUp, emailImpact, recommendAction } from '../services/ai/engine';

export const AGENCY = 'Northlane Digital';
export const CURRENT_USER = 'Alex Morgan';

export const TEAM: TeamMember[] = [
  { id: 'u-alex', name: 'Alex Morgan', role: 'Founder & CEO', initials: 'AM' },
  { id: 'u-priya', name: 'Priya Shah', role: 'Head of Growth', initials: 'PS' },
  { id: 'u-marcus', name: 'Marcus Reid', role: 'Account Executive', initials: 'MR' },
  { id: 'u-elena', name: 'Elena Rossi', role: 'Account Executive', initials: 'ER' },
  { id: 'u-daniel', name: 'Daniel Okafor', role: 'Operations Manager', initials: 'DO' },
];

export const CLIENTS: Client[] = [
  { id: 'c-brightleaf', name: 'Brightleaf Skincare', industry: 'D2C beauty', retainer: 9_500, health: 'Watch' },
  { id: 'c-copperline', name: 'Copperline Coffee', industry: 'D2C food & drink', retainer: 6_000, health: 'Healthy' },
  { id: 'c-meridian', name: 'Meridian Dental Group', industry: 'Healthcare services', retainer: 7_500, health: 'Healthy' },
  { id: 'c-vantage', name: 'Vantage Realty', industry: 'Real estate', retainer: 5_500, health: 'Healthy' },
  { id: 'c-kinetic', name: 'Kinetic Fitwear', industry: 'D2C apparel', retainer: 8_000, health: 'At risk' },
];

export interface SeedState {
  seededAt: string;
  leads: Lead[];
  tasks: Task[];
  approvals: Approval[];
  audit: AuditEntry[];
}

export function createSeed(now = Date.now()): SeedState {
  let a = 0;
  const act = (h: number, type: Activity['type'], text: string, by: string): Activity => ({
    id: `act-seed-${a++}`, at: hoursAgo(h, now), type, text, by,
  });
  const H = (h: number) => hoursAgo(h, now);
  const D = (d: number) => daysAgo(d, now);

  type LeadInput = Omit<Lead, 'followUp' | 'signals' | 'activities'> & Partial<Pick<Lead, 'followUp' | 'signals'>> & { activities: Activity[] };
  const L = (x: LeadInput): Lead => ({ followUp: 'ok', signals: [], ...x });

  const leads: Lead[] = [
    // --- Three high-value leads that missed follow-up ---
    L({
      id: 'L01', name: 'Sarah Whitfield', title: 'Founder', company: 'Harbor & Pine Home', email: 'sarah@harborpine.example',
      phone: '+1 (555) 010-2231', country: 'USA', source: 'Website', status: 'Qualified', value: 42_000, ownerId: 'u-marcus',
      createdAt: D(9), lastContactAt: H(26), stageEnteredAt: D(5), interest: 'Full-funnel growth retainer',
      painPoint: 'paid social spend rising while repeat orders stay flat',
      pendingQuestion: 'Can you share pricing for a 6-month engagement before we commit to a call?',
      signals: ['Visited pricing page twice'],
      activities: [
        act(216, 'form', 'Submitted website contact form: "Looking for a growth partner for Q1."', 'Prospect'),
        act(200, 'email_out', 'Intro email sent', 'Marcus Reid'),
        act(150, 'call', 'Discovery call — budget confirmed, decision by end of month', 'Marcus Reid'),
        act(120, 'status', 'Status changed: Contacted → Qualified', 'Marcus Reid'),
        act(26, 'email_out', 'Sent case overview and asked for a scoping call', 'Marcus Reid'),
        act(25, 'email_in', 'Reply: "Can you share pricing for a 6-month engagement before we commit to a call?"', 'Prospect'),
      ],
    }),
    L({
      id: 'L02', name: 'Omar Al-Rashid', title: 'Marketing Director', company: 'Dune Hospitality Group', email: 'omar@dunehospitality.example',
      phone: '+971 50 000 0142', country: 'UAE', source: 'LinkedIn', status: 'Meeting Booked', value: 36_000, ownerId: 'u-marcus',
      createdAt: D(14), lastContactAt: H(31), stageEnteredAt: D(4), interest: 'Paid social launch',
      painPoint: 'low direct bookings compared to OTA bookings',
      activities: [
        act(330, 'note', 'Connected on LinkedIn after webinar', 'Marcus Reid'),
        act(300, 'email_out', 'Intro email sent', 'Marcus Reid'),
        act(96, 'status', 'Status changed: Qualified → Meeting Booked', 'Marcus Reid'),
        act(31, 'meeting', 'Discovery meeting held — 3 properties, wants launch before peak season', 'Marcus Reid'),
      ],
    }),
    L({
      id: 'L03', name: 'Chloe Bennett', title: 'Co-founder', company: 'Fernway Organics', email: 'chloe@fernway.example',
      phone: '+44 7700 900 318', country: 'UK', source: 'Meta Ads', status: 'New', value: 18_500, ownerId: 'u-elena',
      createdAt: H(52), lastContactAt: null, stageEnteredAt: H(52), interest: 'Meta Ads management',
      painPoint: 'cost per purchase doubling since the summer',
      activities: [act(52, 'form', 'Meta lead form: "Spending £8k/mo on Meta, results getting worse."', 'Prospect')],
    }),
    // --- One opportunity requiring immediate attention ---
    L({
      id: 'L04', name: 'David Chen', title: 'COO', company: 'Atlas Fitness Studios', email: 'david@atlasfitness.example',
      phone: '+1 (555) 014-7720', country: 'Canada', source: 'Referral', status: 'Proposal Sent', value: 64_000, ownerId: 'u-priya',
      createdAt: D(21), lastContactAt: H(20), stageEnteredAt: D(3), interest: 'Full-funnel growth retainer',
      painPoint: 'membership sign-ups stalling across 6 locations',
      signals: ['Viewed proposal 3× in the last 6h', 'Forwarded proposal to CFO'],
      urgentReason: 'Decision meeting is tomorrow; proposal opened 3× in 6h and forwarded to the CFO — no walkthrough booked.',
      activities: [
        act(500, 'note', 'Referred by Lucas Fernandes (Tidewater Marine)', 'Priya Shah'),
        act(300, 'meeting', 'Discovery meeting with COO and Head of Marketing', 'Priya Shah'),
        act(72, 'proposal', 'Proposal sent — 12-month growth retainer', 'Priya Shah'),
        act(20, 'email_out', 'Shared revised timeline', 'Priya Shah'),
        act(6, 'ai', 'Signal detected: proposal viewed 3× and forwarded to CFO', 'AI COO'),
      ],
    }),
    // --- Leads with AI drafts already awaiting approval ---
    L({
      id: 'L05', name: 'Emma Larson', title: 'Head of E-commerce', company: 'Northwind Pet Co', email: 'emma@northwindpet.example',
      phone: '+1 (555) 013-4410', country: 'USA', source: 'Google Ads', status: 'Qualified', value: 12_000, ownerId: 'u-marcus',
      createdAt: D(11), lastContactAt: H(30), stageEnteredAt: D(6), interest: 'Email & retention marketing', followUp: 'draft_pending',
      painPoint: 'customers buying once and not coming back',
      activities: [
        act(260, 'form', 'Google Ads landing page enquiry', 'Prospect'),
        act(240, 'call', 'Qualification call — Shopify Plus, 40k customers', 'Marcus Reid'),
        act(144, 'status', 'Status changed: Contacted → Qualified', 'Marcus Reid'),
        act(30, 'email_out', 'Sent retention audit checklist', 'Marcus Reid'),
      ],
    }),
    L({
      id: 'L06', name: "James O'Connor", title: 'Managing Partner', company: 'Clover Legal', email: 'james@cloverlegal.example',
      phone: '+44 7700 900 455', country: 'UK', source: 'Website', status: 'Contacted', value: 9_500, ownerId: 'u-elena',
      createdAt: D(6), lastContactAt: H(40), stageEnteredAt: D(4), interest: 'Google Ads + SEO', followUp: 'draft_pending',
      painPoint: 'paying for clicks from people outside their practice areas',
      activities: [act(140, 'form', 'Website enquiry', 'Prospect'), act(40, 'email_out', 'Intro email sent', 'Elena Rossi')],
    }),
    L({
      id: 'L07', name: 'Aisha Karim', title: 'Practice Manager', company: 'Lumen Clinics', email: 'aisha@lumenclinics.example',
      phone: '+971 50 000 0287', country: 'UAE', source: 'Meta Ads', status: 'Contacted', value: 14_000, ownerId: 'u-marcus',
      createdAt: D(4), lastContactAt: H(28), stageEnteredAt: D(3), interest: 'Patient acquisition campaigns', followUp: 'draft_pending',
      painPoint: 'enquiries going cold before the front desk calls back',
      activities: [act(96, 'form', 'Meta lead form submitted', 'Prospect'), act(28, 'email_out', 'Intro email sent', 'Marcus Reid')],
    }),
    L({
      id: 'L08', name: 'Ryan Mitchell', title: 'Owner', company: 'Peak Roofing Co', email: 'ryan@peakroofing.example',
      phone: '+1 (555) 019-3302', country: 'USA', source: 'Google Ads', status: 'New', value: 7_800, ownerId: 'u-elena',
      createdAt: H(36), lastContactAt: null, stageEnteredAt: H(36), interest: 'Local SEO + Google Business Profile', followUp: 'draft_pending',
      painPoint: 'not showing up in the map pack in their service area',
      activities: [act(36, 'form', 'Google Ads landing page enquiry', 'Prospect')],
    }),
    // --- Healthy / in-SLA pipeline ---
    L({
      id: 'L09', name: 'Sofia Martinez', title: 'Creative Director', company: 'Casa Verde Interiors', email: 'sofia@casaverde.example',
      phone: '+1 (555) 011-8890', country: 'USA', source: 'Referral', status: 'Meeting Booked', value: 22_000, ownerId: 'u-priya',
      createdAt: D(8), lastContactAt: H(6), stageEnteredAt: D(2), interest: 'Paid social launch',
      painPoint: 'launching a new furniture line with no paid social history',
      activities: [act(190, 'note', 'Referral from Brightleaf Skincare', 'Priya Shah'), act(48, 'status', 'Meeting booked for Thursday', 'Priya Shah'), act(6, 'email_out', 'Sent agenda', 'Priya Shah')],
    }),
    L({
      id: 'L10', name: 'Liam Thompson', title: 'Partner', company: 'Brookfield Accounting', email: 'liam@brookfieldcpa.example',
      phone: '+1 (555) 017-6612', country: 'Canada', source: 'LinkedIn', status: 'Qualified', value: 16_500, ownerId: 'u-marcus',
      createdAt: D(12), lastContactAt: H(10), stageEnteredAt: D(6), interest: 'Google Ads + SEO',
      painPoint: 'seasonal lead flow that dries up after tax season',
      activities: [act(280, 'note', 'Inbound LinkedIn message', 'Marcus Reid'), act(144, 'status', 'Status changed: Contacted → Qualified', 'Marcus Reid'), act(10, 'email_out', 'Sent availability for a call — no reply yet', 'Marcus Reid')],
    }),
    L({
      id: 'L11', name: 'Hannah Wright', title: 'Owner', company: 'Willow & Rye Bakery', email: 'hannah@willowrye.example',
      phone: '+44 7700 900 612', country: 'UK', source: 'Meta Ads', status: 'Qualified', value: 8_200, ownerId: 'u-marcus',
      createdAt: D(9), lastContactAt: H(18), stageEnteredAt: D(5), interest: 'Paid social launch',
      painPoint: 'opening a second shop and needing local awareness',
      activities: [act(210, 'form', 'Meta lead form submitted', 'Prospect'), act(120, 'status', 'Status changed: Contacted → Qualified', 'Marcus Reid'), act(18, 'email_out', 'Follow-up sent', 'Marcus Reid')],
    }),
    L({
      id: 'L12', name: 'Noah Patel', title: 'VP Sales', company: 'Ridgeway Solar', email: 'noah@ridgewaysolar.example',
      phone: '+1 (555) 012-5546', country: 'USA', source: 'Google Ads', status: 'Qualified', value: 27_000, ownerId: 'u-marcus',
      createdAt: D(15), lastContactAt: H(14), stageEnteredAt: D(7), interest: 'Full-funnel growth retainer',
      painPoint: 'high cost per qualified installation lead',
      activities: [act(350, 'form', 'Google Ads enquiry', 'Prospect'), act(168, 'status', 'Status changed: Contacted → Qualified', 'Marcus Reid'), act(14, 'email_out', 'Asked for times for a scoping call', 'Marcus Reid')],
    }),
    L({
      id: 'L13', name: 'Fatima Hassan', title: 'General Manager', company: 'Oasis Wellness Spa', email: 'fatima@oasiswellness.example',
      phone: '+971 50 000 0399', country: 'UAE', source: 'Website', status: 'Proposal Sent', value: 31_000, ownerId: 'u-priya',
      createdAt: D(18), lastContactAt: H(4), stageEnteredAt: D(2), interest: 'Patient acquisition campaigns',
      painPoint: 'weekday treatment slots going unfilled', signals: ['Opened proposal'],
      activities: [act(420, 'form', 'Website enquiry', 'Prospect'), act(48, 'proposal', 'Proposal sent', 'Priya Shah'), act(4, 'email_out', 'Answered questions on reporting', 'Priya Shah')],
    }),
    L({
      id: 'L14', name: 'Ethan Brooks', title: 'Marketing Lead', company: 'Summit Outdoor Gear', email: 'ethan@summitoutdoor.example',
      phone: '+1 (555) 018-2274', country: 'Canada', source: 'Meta Ads', status: 'Contacted', value: 11_000, ownerId: 'u-elena',
      createdAt: D(3), lastContactAt: H(12), stageEnteredAt: D(2), interest: 'Meta Ads management',
      painPoint: 'creative fatigue on their best-performing ads',
      activities: [act(72, 'form', 'Meta lead form submitted', 'Prospect'), act(12, 'email_out', 'Intro email sent', 'Elena Rossi')],
    }),
    L({
      id: 'L15', name: 'Grace Kim', title: 'Owner', company: 'Pixel & Pour Café', email: 'grace@pixelpour.example',
      phone: '+1 (555) 016-0457', country: 'USA', source: 'Meta Ads', status: 'New', value: 4_500, ownerId: 'u-elena',
      createdAt: H(1.5), lastContactAt: null, stageEnteredAt: H(1.5), interest: 'Paid social launch',
      painPoint: 'quiet weekday afternoons',
      activities: [act(1.5, 'form', 'Meta lead form: "Want more weekday foot traffic."', 'Prospect'), act(1.4, 'ai', 'Lead captured from Meta Ads and logged to CRM', 'AI COO')],
    }),
    L({
      id: 'L20', name: 'Mia Johnson', title: 'Practice Owner', company: 'Evergreen Dental Studio', email: 'mia@evergreendental.example',
      phone: '+1 (555) 015-9981', country: 'USA', source: 'Referral', status: 'Contacted', value: 19_000, ownerId: 'u-priya',
      createdAt: D(2), lastContactAt: H(8), stageEnteredAt: D(1), interest: 'Patient acquisition campaigns',
      painPoint: 'relying entirely on word of mouth',
      activities: [act(48, 'note', 'Referred by Meridian Dental Group', 'Priya Shah'), act(8, 'email_out', 'Intro email sent', 'Priya Shah')],
    }),
    // --- Closed ---
    L({
      id: 'L16', name: 'Lucas Fernandes', title: 'CEO', company: 'Tidewater Marine', email: 'lucas@tidewater.example',
      phone: '+1 (555) 010-7765', country: 'USA', source: 'Referral', status: 'Won', value: 38_000, ownerId: 'u-priya',
      createdAt: D(40), lastContactAt: D(2), stageEnteredAt: D(9), closedAt: D(9), interest: 'Full-funnel growth retainer',
      painPoint: 'dealer leads not tracked back to campaigns',
      activities: [act(960, 'note', 'Referral', 'Priya Shah'), act(216, 'status', 'Closed won — contract signed', 'Priya Shah')],
    }),
    L({
      id: 'L17', name: 'Isabelle Dupont', title: 'Founder', company: 'Maison Lumière Boutique', email: 'isabelle@maisonlumiere.example',
      phone: '+1 (555) 014-3328', country: 'Canada', source: 'LinkedIn', status: 'Won', value: 21_000, ownerId: 'u-elena',
      createdAt: D(35), lastContactAt: D(4), stageEnteredAt: D(15), closedAt: D(15), interest: 'Email & retention marketing',
      painPoint: 'abandoned carts with no recovery flow',
      activities: [act(840, 'note', 'LinkedIn conversation', 'Elena Rossi'), act(360, 'status', 'Closed won — contract signed', 'Elena Rossi')],
    }),
    L({
      id: 'L18', name: 'Ben Carter', title: 'Commercial Director', company: 'Ironclad Logistics', email: 'ben@ironclad.example',
      phone: '+44 7700 900 774', country: 'UK', source: 'Cold Outbound', status: 'Lost', value: 45_000, ownerId: 'u-marcus',
      createdAt: D(45), lastContactAt: D(12), stageEnteredAt: D(12), closedAt: D(12), interest: 'Full-funnel growth retainer',
      painPoint: 'no B2B lead pipeline', lostReason: 'No follow-up for 9 days after proposal; chose in-house hire', lostAtStage: 'Proposal Sent',
      activities: [act(1080, 'email_out', 'Cold outreach', 'Marcus Reid'), act(288, 'status', 'Closed lost', 'Marcus Reid')],
    }),
    L({
      id: 'L19', name: 'Zara Ahmed', title: 'Brand Manager', company: 'Glow Theory Cosmetics', email: 'zara@glowtheory.example',
      phone: '+44 7700 900 881', country: 'UK', source: 'Meta Ads', status: 'Lost', value: 13_000, ownerId: 'u-elena',
      createdAt: D(30), lastContactAt: D(20), stageEnteredAt: D(20), closedAt: D(20), interest: 'Meta Ads management',
      painPoint: 'inconsistent ROAS', lostReason: 'Budget frozen until next quarter', lostAtStage: 'Qualified',
      activities: [act(720, 'form', 'Meta lead form', 'Prospect'), act(480, 'status', 'Closed lost — budget freeze', 'Elena Rossi')],
    }),
  ];
  for (const l of leads) {
    l.everNeglected = false;
    l.activities.sort((x, y) => y.at.localeCompare(x.at));
  }

  const T = (t: Omit<Task, 'createdAt' | 'source'> & Partial<Pick<Task, 'createdAt' | 'source'>>): Task => ({ createdAt: D(3), source: 'human', ...t });
  const tasks: Task[] = [
    T({ id: 'T01', title: 'Send Q4 creative performance report', ownerId: 'u-daniel', priority: 'High', dueAt: D(2), status: 'in_progress', clientId: 'c-brightleaf', objective: 'Client retention' }),
    T({ id: 'T02', title: 'Revise Atlas Fitness proposal pricing tiers', ownerId: 'u-priya', priority: 'Urgent', dueAt: D(1), status: 'todo', leadId: 'L04', objective: 'Close Atlas Fitness' }),
    T({ id: 'T03', title: 'Launch Copperline holiday campaign ads', ownerId: 'u-elena', priority: 'High', dueAt: endOfToday(now), status: 'in_progress', clientId: 'c-copperline', objective: 'Q4 client delivery' }),
    T({ id: 'T04', title: 'Update Meridian Dental landing page copy', ownerId: 'u-daniel', priority: 'Medium', dueAt: endOfToday(now), status: 'blocked', clientId: 'c-meridian', blockedReason: 'Waiting on client sign-off for compliance wording', objective: 'Q4 client delivery' }),
    T({ id: 'T05', title: 'Book scoping call with Ridgeway Solar', ownerId: 'u-marcus', priority: 'High', dueAt: daysFromNow(1, now), status: 'todo', leadId: 'L12', objective: 'Pipeline conversion' }),
    T({ id: 'T06', title: 'Monthly analytics review', ownerId: 'u-daniel', priority: 'Medium', dueAt: daysFromNow(3, now), status: 'todo', clientId: 'c-vantage', objective: 'Client retention' }),
    T({ id: 'T07', title: 'Fix purchase tracking pixel on checkout', ownerId: 'u-elena', priority: 'Urgent', dueAt: endOfToday(now), status: 'blocked', clientId: 'c-kinetic', blockedReason: 'Needs Shopify admin access from client', objective: 'Client retention' }),
    T({ id: 'T08', title: 'Prepare Tidewater Marine kickoff deck', ownerId: 'u-priya', priority: 'High', dueAt: daysFromNow(2, now), status: 'in_progress', leadId: 'L16', objective: 'Onboarding' }),
    T({ id: 'T09', title: 'Send contract to Maison Lumière', ownerId: 'u-elena', priority: 'High', dueAt: D(16), status: 'done', leadId: 'L17', completedAt: D(15), completedBy: 'Elena Rossi' }),
    T({ id: 'T10', title: 'Weekly pipeline review', ownerId: 'u-alex', priority: 'Medium', dueAt: D(1), status: 'done', completedAt: D(1), completedBy: 'Alex Morgan', objective: 'Pipeline conversion' }),
    T({ id: 'T11', title: 'Log new Meta Ads leads to CRM', ownerId: 'u-daniel', priority: 'Low', dueAt: H(1), status: 'done', source: 'ai', completedAt: H(1.4), completedBy: 'AI COO', objective: 'Lead capture' }),
    T({ id: 'T12', title: 'Enrich new lead records with company data', ownerId: 'u-daniel', priority: 'Low', dueAt: D(1), status: 'done', source: 'ai', completedAt: D(1), completedBy: 'AI COO', objective: 'Lead capture' }),
    T({
      id: 'T13', title: 'Rebalance Qualified leads: move 2 from Marcus to Priya', ownerId: 'u-alex', priority: 'High', dueAt: daysFromNow(1, now), status: 'suggested', source: 'ai', createdAt: H(2), objective: 'Pipeline conversion',
      rationale: 'Marcus owns every lead stuck in Qualified plus the most overdue follow-ups; Priya has no overdue follow-ups.',
    }),
  ];

  // Four AI drafts waiting for approval (L05–L08), plus other action types.
  const owner = (id: string) => TEAM.find((m) => m.id === id)!.name;
  const draftApproval = (lead: Lead, idx: number): Approval => ({
    id: `A0${idx}`, type: 'send_email', title: `Send follow-up to ${lead.name} (${lead.company})`,
    reason: recommendAction({ ...lead, followUp: 'due' }, now).why, impact: emailImpact(lead),
    leadId: lead.id, payload: { email: draftFollowUp(lead, owner(lead.ownerId), now) }, status: 'pending', createdAt: H(3 + idx), createdBy: 'AI COO',
  });
  const approvals: Approval[] = [
    ...['L05', 'L06', 'L07', 'L08'].map((id, i) => draftApproval(leads.find((l) => l.id === id)!, i + 1)),
    {
      id: 'A05', type: 'schedule_meeting', title: 'Schedule proposal walkthrough with David Chen (Atlas Fitness)', leadId: 'L04',
      reason: 'Proposal opened 3× in 6h and forwarded to the CFO; decision meeting is tomorrow with no walkthrough booked.',
      impact: 'Protects the largest open deal ($64,000 pipeline) · estimate',
      payload: { meeting: { when: nextBusinessDayAt(9, now), durationMin: 30, agenda: 'Walk CFO through pricing tiers, timeline and reporting.' } },
      status: 'pending', createdAt: H(2), createdBy: 'AI COO',
    },
    {
      id: 'A06', type: 'update_crm', title: 'Update CRM: Casa Verde Interiors meeting details', leadId: 'L09',
      reason: 'Meeting confirmed by email but the CRM next step is empty.',
      impact: 'Data hygiene — keeps forecast accurate · no direct revenue impact',
      payload: { leadPatch: { nextAction: 'Prepare paid social launch plan before Thursday meeting', note: 'Meeting Thursday; decision-maker: Sofia Martinez' } },
      status: 'pending', createdAt: H(5), createdBy: 'AI COO',
    },
    {
      id: 'A07', type: 'assign_task', title: 'Assign: request Shopify access from Kinetic Fitwear', taskId: 'T07',
      reason: 'Pixel fix (urgent) has been blocked waiting on access; nobody owns the unblock step.',
      impact: 'Unblocks an urgent task for an at-risk client ($8,000/mo retainer) · estimate',
      payload: { task: { title: 'Request Shopify admin access from Kinetic Fitwear', ownerId: 'u-daniel', dueAt: endOfToday(now), priority: 'Urgent' } },
      status: 'pending', createdAt: H(4), createdBy: 'AI COO',
    },
  ];
  // Mark the draft-pending leads' activities.
  for (const ap of approvals.filter((x) => x.type === 'send_email')) {
    const lead = leads.find((l) => l.id === ap.leadId)!;
    lead.activities.unshift({ id: `act-seed-${a++}`, at: ap.createdAt, type: 'ai', text: 'AI drafted a follow-up email — awaiting approval', by: 'AI COO' });
  }

  let e = 0;
  const audit: AuditEntry[] = (
  [
    { at: D(1), actor: 'AI COO', kind: 'executed', message: 'Enriched 4 new lead records with company data (CRM mock)', integration: 'CRM (mock)' },
    { at: H(1.4), actor: 'AI COO', kind: 'executed', message: 'Logged new Meta Ads lead Grace Kim (Pixel & Pour Café) to CRM', leadId: 'L15', integration: 'CRM (mock)' },
    ...approvals.map((ap) => ({ at: ap.createdAt, actor: 'AI COO', kind: 'proposed' as const, message: `Proposed: ${ap.title}`, approvalId: ap.id, leadId: ap.leadId, taskId: ap.taskId })),
    { at: H(2), actor: 'AI COO', kind: 'proposed', message: 'Recommended task: Rebalance Qualified leads (Marcus → Priya)', taskId: 'T13' },
  ] as Omit<AuditEntry, 'id' | 'mode'>[]
  )
    .map((x) => ({ ...x, id: `aud-seed-${e++}`, mode: 'demo' as const }))
    .sort((x, y) => y.at.localeCompare(x.at));

  return { seededAt: new Date(now).toISOString(), leads, tasks, approvals, audit };
}

