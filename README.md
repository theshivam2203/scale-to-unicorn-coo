# Scale To Unicorn — AI COO (Demo)

*Your AI COO. Your Business, Under Control.*

A working demo of an AI Chief Operating Officer for a fictional marketing agency, **Northlane Digital**
(5 clients, 20 leads). It runs entirely in the browser with seeded data and mock integrations — no API keys needed.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # store + UI journey tests
npm run build      # typecheck + production build
```

## Demo script (≈5 minutes)

1. **Dashboard** — the AI summary names the problems: 3 neglected high-value leads, Atlas Fitness needing
   immediate attention, 2 overdue tasks, 4 drafts awaiting review, and a Qualified-stage bottleneck.
2. **AI COO Command** — run *"Find every lead that has not been contacted in the last 24 hours."* then
   *"Prepare follow-up emails for every overdue lead"*.
3. **Follow-up Autopilot / Approvals** — read a draft (it answers Sarah's actual pricing question), edit it,
   **Approve & send (demo)**. Watch it move Draft → Approved → Completed (simulated). Reject another with a reason.
4. Approve the **Atlas Fitness** meeting. Open Sarah's lead: the activity history shows the simulated send, the
   scheduled next touch and a follow-up task. Click **Simulate reply (demo)** to show the re-engaged estimate.
5. **Dashboard / Revenue / Briefing** — numbers and narrative reflect everything you did.
6. **Operations** — accept the AI's rebalance recommendation; **Audit Log** shows the full trail.
7. **Reset demo** (top bar) before the next presentation.

## Safety rules (enforced in code)

- Only `demo` execution mode exists. Emails, CRM writes, meetings and task notifications are simulated by mock
  adapters and never leave the browser. All leads use `.example` domains and fictional phone ranges.
- Sensitive actions require explicit per-item approval; bulk approval is refused.
- Every proposed / edited / approved / rejected / executed action is written to the audit log.
- Revenue is split into **pipeline**, **estimates** (weighted / re-engaged) and **verified** (closed-won).
  Drafting or sending an email never counts as recovered revenue.

## Architecture

```
src/
  domain/      types, seed scenario, derived metrics (KPIs, bottleneck, funnel)
  services/    integration seams — crm.ts (GoHighLevel), email.ts (Gmail), tasks.ts (n8n),
               audit.ts (Supabase/Postgres), ai/ (scoring, drafting, commands, briefing)
  store/       app state + approval execution (calls services, then updates state)
  pages/       Dashboard, Command, Briefing, Leads, Follow-up, Approvals, Operations, Revenue, Audit, Integrations
```

To go live, add a server API that holds credentials, then swap the mock adapters in `src/services/index.ts`
for the provided `GoHighLevelCrm` / `GmailService` shapes. Never put secrets in `VITE_*` variables — they are
bundled into the browser. The AI engine (`services/ai/engine.ts`) is a deterministic rules engine with the same
inputs/outputs an LLM-backed server endpoint would have.
