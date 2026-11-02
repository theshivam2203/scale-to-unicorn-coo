// Task service. Demo: local only. Production: an n8n workflow that writes to the team's task
// tool (or the Supabase `tasks` table) and notifies the owner.

import { assertDemoMode, simulatedLatency } from './config';

export interface TaskService {
  readonly name: string;
  assign(title: string, ownerName: string): Promise<{ simulated: boolean; note: string }>;
}

export const mockTasks: TaskService = {
  name: 'n8n task workflow (mock)',
  async assign(title, ownerName) {
    assertDemoMode('assign task');
    await simulatedLatency(300);
    return { simulated: true, note: `Task "${title}" assigned to ${ownerName} in the demo workspace — no notification sent.` };
  },
};
