import { AlertTriangle, ArrowRight, Bot, CheckCircle2, ClipboardCheck, ListOrdered, Newspaper, RefreshCw, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../store/store';
import { buildBriefing, type BriefItem } from '../services/ai/briefing';
import { navigate } from '../router';
import { Button, Card, CardHeader, PageHeader, cx } from '../components/ui';

function Section({ title, icon, items, empty, numbered, tone }: { title: string; icon: LucideIcon; items: BriefItem[]; empty: string; numbered?: boolean; tone?: string }) {
  const openLead = useStore((s) => s.openLead);
  return (
    <Card>
      <CardHeader title={title} icon={icon} right={<span className="text-xs tabular-nums text-zinc-400">{items.length}</span>} />
      {items.length ? (
        <ul className="divide-y divide-zinc-100">
          {items.map((it, i) => {
            const clickable = it.leadId || it.to;
            return (
              <li key={i}>
                <button
                  disabled={!clickable}
                  onClick={() => (it.leadId ? openLead(it.leadId) : it.to && navigate(it.to))}
                  className="flex w-full items-start gap-3 px-4 py-2.5 text-left enabled:hover:bg-zinc-50 sm:px-5"
                >
                  {numbered ? (
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white">{i + 1}</span>
                  ) : (
                    <span className={cx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', tone ?? 'bg-zinc-300')} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-800">{it.text}</p>
                    {it.detail && <p className="mt-0.5 text-xs text-zinc-500">{it.detail}</p>}
                  </div>
                  {clickable && <ArrowRight size={14} className="mt-1 shrink-0 text-zinc-300" />}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-5 py-6 text-center text-xs text-zinc-500">{empty}</p>
      )}
    </Card>
  );
}

export function Briefing() {
  const leads = useStore((s) => s.leads);
  const tasks = useStore((s) => s.tasks);
  const approvals = useStore((s) => s.approvals);
  const audit = useStore((s) => s.audit);
  const [generatedAt, setGeneratedAt] = useState(() => new Date());
  const b = buildBriefing({ leads, tasks, approvals, audit });
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily Briefing"
        subtitle={`${date} · generated from live demo data`}
        actions={<Button icon={RefreshCw} onClick={() => setGeneratedAt(new Date())}>Regenerate</Button>}
      />
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="hidden rounded-xl bg-brand-700 p-2.5 text-white sm:block"><Bot size={20} /></div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{b.greeting}</h2>
            <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-zinc-700">{b.narrative}</p>
            <p className="mt-3 text-[11px] text-zinc-400">Updated {generatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · reflects every approval, task and lead change so far</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Recommended priorities" icon={ListOrdered} items={b.priorities} numbered empty="No priorities — you're clear." />
        <Section title="Critical issues" icon={AlertTriangle} items={b.critical} tone="bg-red-500" empty="No critical issues." />
        <Section title="Opportunities" icon={TrendingUp} items={b.opportunities} tone="bg-emerald-500" empty="No standout opportunities right now." />
        <Section title="Key developments (last 24h)" icon={Newspaper} items={b.developments} tone="bg-sky-500" empty="No new developments in the last 24 hours." />
        <Section title="Completed by the AI COO (last 24h, simulated)" icon={CheckCircle2} items={b.completed} tone="bg-brand-500" empty="No actions executed in the last 24 hours." />
        <Section title="Decisions awaiting approval" icon={ClipboardCheck} items={b.awaiting} tone="bg-amber-500" empty="Nothing waiting on you." />
      </div>
    </div>
  );
}
