// Execution policy. The demo build only ships simulated adapters; there is no code path
// that reaches a live CRM, mailbox or payment system from the browser.

export type ExecutionMode = 'demo';

const requested = import.meta.env.VITE_EXECUTION_MODE as string | undefined;
export const EXECUTION_MODE: ExecutionMode = 'demo';
export const MODE_OVERRIDE_IGNORED = requested !== undefined && requested !== 'demo';

export const EXECUTION_POLICY = [
  'Never send real emails — sends are simulated and never leave the browser.',
  'Never modify a live CRM — CRM writes go to the local demo dataset.',
  'Never contact real leads — all leads are fictional (.example domains).',
  'Never execute financial transactions.',
  'Sensitive actions require explicit human approval before simulation.',
  'Every proposed, edited, approved, rejected and completed action is written to the audit log.',
] as const;

export const simulatedLatency = (ms = 450) => new Promise((r) => setTimeout(r, ms + Math.random() * 250));

export function assertDemoMode(action: string) {
  if (EXECUTION_MODE !== 'demo') throw new Error(`Blocked: "${action}" requires a server-side integration that is not configured.`);
}
