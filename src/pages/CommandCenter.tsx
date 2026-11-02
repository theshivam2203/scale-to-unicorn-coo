import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, CheckCircle2, CornerDownLeft, Lightbulb, Trash2 } from 'lucide-react';
import { useStore } from '../store/store';
import { EXAMPLE_COMMANDS, type CommandResult } from '../services/ai/commands';
import { navigate } from '../router';
import { Avatar, Badge, Button, Card, PageHeader, cx } from '../components/ui';
import { CURRENT_USER } from '../domain/seed';

const TONE: Record<string, string> = { danger: 'danger', warn: 'warn', ok: 'ok', info: 'info', neutral: 'neutral' };

function Result({ r }: { r: CommandResult }) {
  const { runAction, openLead } = useStore();
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">{r.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-zinc-700">{r.summary}</p>
      </div>
      {r.stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {r.stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <div className="text-base font-semibold tabular-nums text-zinc-900">{s.value}</div>
              <div className="text-[11px] text-zinc-500">{s.label}{s.hint && <span className="ml-1 text-zinc-400">({s.hint})</span>}</div>
            </div>
          ))}
        </div>
      )}
      {r.rows && r.rows.length > 0 && (
        <div className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          {r.rows.map((row, i) => (
            <button
              key={i}
              disabled={!row.leadId && !row.taskId}
              onClick={() => (row.leadId ? openLead(row.leadId) : navigate('/operations'))}
              className="flex w-full items-center gap-3 px-3 py-2 text-left enabled:hover:bg-zinc-50"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-800">{row.primary}</div>
                {row.secondary && <div className="truncate text-[11px] text-zinc-500">{row.secondary}</div>}
              </div>
              {row.metric && <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900">{row.metric}</span>}
              {row.badge && <Badge tone={(TONE[row.tone ?? 'neutral'] as never) ?? 'neutral'}>{row.badge}</Badge>}
            </button>
          ))}
        </div>
      )}
      {r.reasoning.length > 0 && (
        <div className="rounded-lg bg-zinc-50 px-3 py-2">
          <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-zinc-500"><Lightbulb size={11} /> Reasoning</div>
          <ul className="space-y-0.5 text-xs text-zinc-600">{r.reasoning.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}
      {r.changes && r.changes.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <div className="mb-0.5 flex items-center gap-1 font-medium"><CheckCircle2 size={12} /> Applied to the demo workspace</div>
          <ul className="list-inside list-disc">{r.changes.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      )}
      {r.actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {r.actions.map((a, i) => (
            <Button key={i} size="sm" variant={i === 0 && a.kind !== 'run' ? 'primary' : 'secondary'} onClick={() => runAction(a, navigate)}>
              {a.label} {a.kind === 'navigate' && <ArrowRight size={13} />}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CommandCenter() {
  const chat = useStore((s) => s.chat);
  const runCommand = useStore((s) => s.runCommand);
  const clearChat = useStore((s) => s.clearChat);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.length, thinking]);

  const submit = (cmd: string) => {
    const c = cmd.trim();
    if (!c || thinking) return;
    setText('');
    setThinking(true);
    // Brief pause so the "analysing" state is visible; the engine itself is synchronous.
    setTimeout(() => { runCommand(c); setThinking(false); }, 650);
  };

  return (
    <div>
      <PageHeader
        title="AI COO Command Center"
        subtitle="Give operational instructions in plain English. Results are computed from your live demo data and can change it."
        actions={chat.length > 0 && <Button size="sm" variant="ghost" icon={Trash2} onClick={clearChat}>Clear conversation</Button>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="flex min-h-[60vh] flex-col">
          <div className="flex-1 space-y-5 p-4 sm:p-5">
            {chat.length === 0 && !thinking && (
              <div className="flex flex-col items-center py-10 text-center">
                <div className="rounded-2xl bg-brand-50 p-3 text-brand-700"><Bot size={24} /></div>
                <h2 className="mt-3 text-base font-semibold text-zinc-900">What should we work on?</h2>
                <p className="mt-1 max-w-md text-sm text-zinc-500">I can find neglected leads, draft follow-ups, rank deals, find revenue leaks, summarise operations and create tasks. Sensitive actions always come back to you for approval.</p>
                <div className="mt-5 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
                  {EXAMPLE_COMMANDS.map((c) => (
                    <button key={c} onClick={() => submit(c)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-left text-sm text-zinc-700 transition hover:border-brand-300 hover:bg-brand-50/40">
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chat.map((m) => (
              <div key={m.id} className={cx('flex animate-fadein gap-3', m.role === 'user' && 'flex-row-reverse')}>
                {m.role === 'user' ? <Avatar name={CURRENT_USER} size="md" /> : <Avatar name="AI COO" size="md" />}
                <div className={cx('max-w-[92%] rounded-2xl px-4 py-3', m.role === 'user' ? 'bg-zinc-900 text-sm text-white' : 'flex-1 border border-zinc-200 bg-zinc-50/60')}>
                  {m.role === 'user' ? m.text : m.result ? <Result r={m.result} /> : m.text}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex gap-3">
                <Avatar name="AI COO" size="md" />
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 px-4 py-3 text-sm text-zinc-500">
                  <span className="inline-flex gap-1">
                    Analysing CRM, tasks and approvals
                    <span className="animate-pulseDot">.</span><span className="animate-pulseDot [animation-delay:.2s]">.</span><span className="animate-pulseDot [animation-delay:.4s]">.</span>
                  </span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form className="sticky bottom-0 border-t border-zinc-100 bg-white p-3 sm:p-4" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
            <div className="flex items-end gap-2 rounded-xl border border-zinc-200 bg-white p-1.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
              <textarea
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(text); } }}
                placeholder="e.g. Find every lead that has not been contacted in the last 24 hours"
                className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
              />
              <Button type="submit" variant="primary" disabled={!text.trim() || thinking} icon={CornerDownLeft}>Run</Button>
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-zinc-400">Reasoning engine: local rules engine (demo). No data leaves this browser.</p>
          </form>
        </Card>

        <div className="space-y-3">
          <Card className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Try a command</h3>
            <div className="mt-2 space-y-1">
              {[...EXAMPLE_COMMANDS, 'Tell me about Atlas Fitness', 'What are our operational bottlenecks?', 'Approve all pending actions'].map((c) => (
                <button key={c} onClick={() => submit(c)} className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100">{c}</button>
              ))}
            </div>
          </Card>
          <Card className="p-4 text-xs text-zinc-600">
            <h3 className="mb-1 font-semibold text-zinc-800">How commands act</h3>
            <p>Read-only questions return analysis. Commands that prepare work — drafts, meetings, tasks — add items to the approval queue or Operations. Nothing is executed until you approve it.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
