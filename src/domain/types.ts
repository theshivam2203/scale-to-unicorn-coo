// Core domain model for the AI COO. Everything the UI shows is derived from these records.

export const STAGES = ['New', 'Contacted', 'Qualified', 'Meeting Booked', 'Proposal Sent', 'Won', 'Lost'] as const;
export type Stage = (typeof STAGES)[number];
export const OPEN_STAGES: Stage[] = ['New', 'Contacted', 'Qualified', 'Meeting Booked', 'Proposal Sent'];

export type LeadSource = 'Meta Ads' | 'Google Ads' | 'Website' | 'Referral' | 'LinkedIn' | 'Cold Outbound';
export const LEAD_SOURCES: LeadSource[] = ['Meta Ads', 'Google Ads', 'Website', 'Referral', 'LinkedIn', 'Cold Outbound'];

export type Priority = 'Critical' | 'High' | 'Medium' | 'Low';

/** Where a lead is in the follow-up workflow. */
export type FollowUpState = 'ok' | 'due' | 'draft_pending' | 'sent' | 'replied';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  initials: string;
}

export interface Client {
  id: string;
  name: string;
  industry: string;
  retainer: number; // monthly
  health: 'Healthy' | 'Watch' | 'At risk';
}

export type ActivityType = 'form' | 'email_in' | 'email_out' | 'call' | 'meeting' | 'note' | 'status' | 'ai' | 'task' | 'proposal';

export interface Activity {
  id: string;
  at: string; // ISO
  type: ActivityType;
  text: string;
  by: string; // team member name, 'AI COO', 'Prospect' or 'System'
  simulated?: boolean; // true when produced by a demo-mode simulation
}

export interface Lead {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  country: 'USA' | 'UK' | 'UAE' | 'Canada';
  source: LeadSource;
  status: Stage;
  value: number;
  ownerId: string;
  createdAt: string;
  lastContactAt: string | null; // last outbound touch by us
  stageEnteredAt: string;
  interest: string; // service they want
  painPoint: string;
  pendingQuestion?: string; // unanswered inbound question
  signals: string[]; // buying signals, e.g. "Viewed proposal 3x"
  urgentReason?: string; // marks an opportunity needing immediate attention
  lostReason?: string;
  lostAtStage?: Stage;
  closedAt?: string;
  followUp: FollowUpState;
  nextFollowUpAt?: string;
  nextAction?: string; // human/AI-set override of the recommended action
  everNeglected?: boolean; // was past the follow-up SLA when the AI COO followed up
  neglectedAtStage?: Stage;
  recoveredAt?: string; // re-engaged (reply or stage advance) after a missed follow-up
  activities: Activity[];
}

export type TaskStatus = 'suggested' | 'todo' | 'in_progress' | 'blocked' | 'done';
export type TaskPriority = 'Urgent' | 'High' | 'Medium' | 'Low';

export interface Task {
  id: string;
  title: string;
  ownerId: string;
  priority: TaskPriority;
  dueAt: string;
  status: TaskStatus;
  leadId?: string;
  clientId?: string;
  objective?: string;
  blockedReason?: string;
  source: 'human' | 'ai';
  rationale?: string; // why the AI recommended it
  createdAt: string;
  completedAt?: string;
  completedBy?: string;
}

export type ApprovalType = 'send_email' | 'update_crm' | 'schedule_meeting' | 'assign_task' | 'change_status';

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
}

export interface ApprovalPayload {
  email?: EmailDraft;
  leadPatch?: Partial<Pick<Lead, 'status' | 'ownerId' | 'value' | 'nextAction'>> & { note?: string };
  meeting?: { when: string; agenda: string; durationMin: number };
  task?: { title: string; ownerId: string; dueAt: string; priority: TaskPriority; taskId?: string };
  status?: Stage;
}

export type ApprovalStatus = 'pending' | 'approved' | 'executed' | 'rejected';

export interface Approval {
  id: string;
  type: ApprovalType;
  title: string;
  reason: string;
  impact: string; // always shown as an estimate
  leadId?: string;
  taskId?: string;
  payload: ApprovalPayload;
  status: ApprovalStatus;
  createdAt: string;
  createdBy: 'AI COO' | string;
  decidedAt?: string;
  decidedBy?: string;
  executedAt?: string;
  rejectionReason?: string;
  edited?: boolean;
  result?: string; // outcome message from the (mock) service
}

export type AuditKind = 'proposed' | 'edited' | 'approved' | 'rejected' | 'executed' | 'created' | 'updated' | 'command' | 'system';

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  kind: AuditKind;
  message: string;
  leadId?: string;
  taskId?: string;
  approvalId?: string;
  mode: 'demo';
  integration?: string; // which (mock) service handled it
}

export interface ChatMessage {
  id: string;
  at: string;
  role: 'user' | 'assistant';
  text: string;
  result?: import('../services/ai/commands').CommandResult;
}
