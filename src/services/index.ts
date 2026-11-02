// Service registry — the single place where mock adapters get swapped for real ones.
import { mockCrm } from './crm';
import { mockEmail } from './email';
import { mockTasks } from './tasks';
import { localAudit } from './audit';

export const services = {
  crm: mockCrm,
  email: mockEmail,
  tasks: mockTasks,
  audit: localAudit,
};

export const INTEGRATIONS = [
  { key: 'crm', name: 'GoHighLevel', role: 'CRM — contacts, pipeline, appointments', adapter: mockCrm.name, env: 'GHL_API_KEY, GHL_LOCATION_ID' },
  { key: 'automation', name: 'n8n', role: 'Automation — task routing, webhooks, schedules', adapter: mockTasks.name, env: 'N8N_WEBHOOK_URL, N8N_WEBHOOK_SECRET' },
  { key: 'email', name: 'Google Workspace / Gmail', role: 'Email — send follow-ups from rep mailboxes', adapter: mockEmail.name, env: 'Google OAuth client + refresh tokens' },
  { key: 'db', name: 'Supabase / PostgreSQL', role: 'Database — leads, tasks, approvals, audit log', adapter: 'Browser localStorage (demo)', env: 'SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY' },
  { key: 'ai', name: 'AI reasoning', role: 'Lead scoring, recommendations, drafting, commands', adapter: 'Rules engine (local, demo)', env: 'LLM provider API key' },
] as const;
