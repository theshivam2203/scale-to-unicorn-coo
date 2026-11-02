// Email service. Demo: mockEmail (no delivery). Production: GmailService calls a server-side
// endpoint that holds the Google Workspace OAuth token — never the browser.

import type { EmailDraft } from '../domain/types';
import { assertDemoMode, simulatedLatency } from './config';

export interface SendResult {
  messageId: string;
  simulated: boolean;
  provider: string;
  note: string;
}

export interface EmailService {
  readonly name: string;
  send(draft: EmailDraft): Promise<SendResult>;
}

export const mockEmail: EmailService = {
  name: 'Gmail (mock)',
  async send(draft) {
    assertDemoMode('send email');
    await simulatedLatency(700);
    return {
      messageId: `demo-msg-${Math.random().toString(36).slice(2, 10)}`,
      simulated: true,
      provider: 'Gmail (mock)',
      note: `Simulated send to ${draft.to} — not delivered (demo mode).`,
    };
  },
};

/** Production adapter shape (not wired in the demo). */
export class GmailService implements EmailService {
  readonly name = 'Gmail';
  constructor(private apiBase: string) {}
  async send(draft: EmailDraft): Promise<SendResult> {
    const res = await fetch(`${this.apiBase}/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    if (!res.ok) throw new Error(`Email API error ${res.status}`);
    return { ...(await res.json()), simulated: false, provider: this.name };
  }
}
