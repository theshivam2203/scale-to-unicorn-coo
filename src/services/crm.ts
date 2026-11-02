// CRM service. Demo: mockCrm writes only to local state. Production: GoHighLevel via a
// server-side proxy (or an n8n workflow) that holds the GHL API key.

import { assertDemoMode, simulatedLatency } from './config';

export interface CrmWriteResult {
  ok: boolean;
  simulated: boolean;
  provider: string;
  note: string;
}

export interface CrmService {
  readonly name: string;
  updateContact(leadId: string, fields: Record<string, unknown>): Promise<CrmWriteResult>;
  scheduleAppointment(leadId: string, whenIso: string, title: string): Promise<CrmWriteResult>;
}

export const mockCrm: CrmService = {
  name: 'GoHighLevel (mock)',
  async updateContact(leadId, fields) {
    assertDemoMode('update CRM');
    await simulatedLatency();
    return {
      ok: true, simulated: true, provider: 'GoHighLevel (mock)',
      note: `Demo CRM record ${leadId} updated (${Object.keys(fields).join(', ')}). Live CRM untouched.`,
    };
  },
  async scheduleAppointment(leadId, whenIso, title) {
    assertDemoMode('schedule meeting');
    await simulatedLatency();
    return {
      ok: true, simulated: true, provider: 'GoHighLevel (mock)',
      note: `Demo calendar entry "${title}" for ${leadId} at ${new Date(whenIso).toLocaleString()} — no invite sent.`,
    };
  },
};

/** Production adapter shape (not wired in the demo). */
export class GoHighLevelCrm implements CrmService {
  readonly name = 'GoHighLevel';
  constructor(private apiBase: string) {}
  private async post(path: string, body: unknown): Promise<CrmWriteResult> {
    const res = await fetch(`${this.apiBase}/crm/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`CRM API error ${res.status}`);
    return { ok: true, simulated: false, provider: this.name, note: 'Synced to GoHighLevel' };
  }
  updateContact(leadId: string, fields: Record<string, unknown>) {
    return this.post('contacts/update', { leadId, fields });
  }
  scheduleAppointment(leadId: string, whenIso: string, title: string) {
    return this.post('appointments', { leadId, whenIso, title });
  }
}
