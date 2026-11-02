import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Info } from 'lucide-react';
import { useStore } from '../store/store';
import { OPEN_STAGES } from '../domain/types';
import { computeKpis, delayBuckets, followUpQueue, funnel, ownerName, sourcePerformance } from '../domain/metrics';
import { money, pct } from '../domain/util';
import { STAGE_PROBABILITY, hoursSinceTouch } from '../services/ai/engine';
import { navigate } from '../router';
import { Badge, Card, CardHeader, PageHeader, PriorityBadge } from '../components/ui';

const BRAND = '#7c3aed';
const DANGER = '#dc2626';
const AXIS = { fontSize: 11, fill: '#71717a' };

function Tile({ label, value, note, tag, tone }: { label: string; value: string; note: string; tag: string; tone: 'neutral' | 'brand' | 'danger' | 'ok' | 'info' }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-zinc-600">{label}</span><Badge tone={tone}>{tag}</Badge></div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">{value}</div>
      <p className="mt-1 text-[11px] leading-snug text-zinc-500">{note}</p>
    </Card>
  );
}

function ChartTip({ active, payload, label, fmt }: { active?: boolean; payload?: { value: number; payload: Record<string, unknown> }[]; label?: string; fmt: (p: Record<string, unknown>) => string[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-pop">
      <div className="mb-0.5 font-semibold text-zinc-900">{label}</div>
      {fmt(payload[0].payload).map((l) => <div key={l} className="text-zinc-600">{l}</div>)}
    </div>
  );
}

export function Revenue() {
  const leads = useStore((s) => s.leads);
  const approvals = useStore((s) => s.approvals);
  const audit = useStore((s) => s.audit);
  const openLead = useStore((s) => s.openLead);
  const k = computeKpis(leads, approvals, audit);

  const byStage = OPEN_STAGES.map((stage) => {
    const ls = leads.filter((l) => l.status === stage);
    const value = ls.reduce((x, l) => x + l.value, 0);
    return { stage, value, weighted: value * STAGE_PROBABILITY[stage], count: ls.length };
  });
  const fun = funnel(leads).slice(1).map((f) => ({ ...f, label: `→ ${f.stage}`, pctv: Math.round(f.conversion * 100) }));
  const buckets = delayBuckets(leads);
  const sources = sourcePerformance(leads).sort((a, b) => b.pipeline - a.pipeline);
  const neglected = followUpQueue(leads);
  const neglectedWeighted = neglected.reduce((x, q) => x + q.lead.value * STAGE_PROBABILITY[q.lead.status], 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue Intelligence" subtitle="Connects lead activity to business outcomes. Pipeline, estimates and verified revenue are kept strictly separate." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Tile label="Open pipeline" value={money(k.pipelineValue, true)} tag="Pipeline" tone="neutral" note={`${k.openDeals} open deals at full value. Not revenue.`} />
        <Tile label="Weighted pipeline" value={money(k.weightedPipeline, true)} tag="Estimate" tone="brand" note="Each deal × stage win probability." />
        <Tile label="Revenue at risk" value={money(k.revenueAtRisk, true)} tag="Exposure" tone="danger" note={`${k.leadsNeedingFollowUp} open deals past the 24h follow-up SLA.`} />
        <Tile label="Re-engaged after missed follow-up" value={money(k.reengagedValue, true)} tag="Estimate" tone="info" note={k.reengagedCount ? `${k.reengagedCount} deal(s) replied or advanced after a late follow-up.` : 'Counts only when a neglected deal replies or advances — not when an email is sent.'} />
        <Tile label="Verified revenue" value={money(k.verifiedRevenue, true)} tag="Closed-won" tone="ok" note={`From CRM closed-won deals. ${money(k.verifiedRecovered, true)} of it from re-engaged deals.`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Open pipeline by stage" subtitle="Full value per stage — hover for weighted value and count" />
          <div className="h-64 px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStage} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#f4f4f5" />
                <XAxis dataKey="stage" tick={AXIS} tickLine={false} axisLine={{ stroke: '#e4e4e7' }} interval={0} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => money(v, true)} width={52} />
                <Tooltip cursor={{ fill: '#f4f4f5' }} content={<ChartTip fmt={(p) => [`${money(p.value as number)} full value`, `${money(p.weighted as number)} weighted (est.)`, `${p.count} deal(s)`]} />} />
                <Bar dataKey="value" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                  <LabelList dataKey="value" position="top" formatter={(v: number) => (v ? money(v, true) : '')} style={{ fontSize: 11, fill: '#3f3f46' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Stage-to-stage conversion" subtitle="Share of leads reaching each stage from the previous one (lost deals counted where they were lost)" />
          <div className="h-64 px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fun} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="#f4f4f5" />
                <XAxis type="number" domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="label" tick={AXIS} tickLine={false} axisLine={false} width={112} />
                <Tooltip cursor={{ fill: '#f4f4f5' }} content={<ChartTip fmt={(p) => [`${p.pctv}% conversion`, `${p.reached} lead(s) reached this stage`]} />} />
                <Bar dataKey="pctv" fill={BRAND} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
                  <LabelList dataKey="pctv" position="right" formatter={(v: number) => `${v}%`} style={{ fontSize: 11, fill: '#3f3f46' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader title="Open pipeline by time since last touch" subtitle="Where follow-up delay is concentrated" />
          <div className="h-60 px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#f4f4f5" />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: '#e4e4e7' }} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => money(v, true)} width={52} />
                <Tooltip cursor={{ fill: '#f4f4f5' }} content={<ChartTip fmt={(p) => [`${money(p.value as number)} pipeline`, `${p.count} lead(s)`, p.overdue ? 'Past 24h SLA' : 'Within SLA']} />} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                  {buckets.map((b) => <Cell key={b.label} fill={b.overdue ? DANGER : BRAND} />)}
                  <LabelList dataKey="count" position="top" formatter={(v: number) => (v ? `${v} lead${v > 1 ? 's' : ''}` : '')} style={{ fontSize: 11, fill: '#3f3f46' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 border-t border-zinc-100 px-5 py-2 text-[11px] text-zinc-500">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: BRAND }} />Within SLA</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: DANGER }} />Past 24h SLA</span>
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader
            title="Neglected opportunities"
            subtitle={`${neglected.length} deals past SLA · ${money(neglected.reduce((x, q) => x + q.lead.value, 0))} full value · ${money(neglectedWeighted)} estimated (weighted) value`}
          />
          {neglected.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead><tr className="border-b border-zinc-100 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2">Lead</th><th className="px-3 py-2">Waiting</th><th className="px-3 py-2 text-right">Full value</th><th className="px-3 py-2 text-right">Est. value</th><th className="px-4 py-2">Priority</th>
                </tr></thead>
                <tbody className="divide-y divide-zinc-100">
                  {neglected.map(({ lead: l, score }) => (
                    <tr key={l.id} className="cursor-pointer hover:bg-zinc-50" onClick={() => openLead(l.id)}>
                      <td className="px-4 py-2"><div className="font-medium text-zinc-900">{l.company}</div><div className="text-[11px] text-zinc-500">{l.status} · {ownerName(l.ownerId)}</div></td>
                      <td className="px-3 py-2 text-xs font-medium text-red-700">{Math.round(hoursSinceTouch(l))}h</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(l.value)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{money(l.value * STAGE_PROBABILITY[l.status])}</td>
                      <td className="px-4 py-2"><PriorityBadge p={score.priority} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-zinc-500">No neglected opportunities — every open deal is within SLA.</p>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Lead source performance" subtitle="Win rate uses closed deals only (won ÷ won + lost)" right={<button className="text-xs font-medium text-brand-700 hover:underline" onClick={() => navigate('/leads')}>View leads</button>} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-zinc-100 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-2">Source</th><th className="px-3 py-2 text-right">Leads</th><th className="px-3 py-2 text-right">Open pipeline</th><th className="px-3 py-2 text-right">Won (verified)</th><th className="px-3 py-2 text-right">Win rate</th><th className="px-3 py-2 text-right">Avg deal</th><th className="px-4 py-2 text-right">Past SLA</th>
            </tr></thead>
            <tbody className="divide-y divide-zinc-100">
              {sources.map((s) => (
                <tr key={s.source}>
                  <td className="px-4 py-2 font-medium text-zinc-900">{s.source}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.leads}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(s.pipeline)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(s.won)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.winRate === null ? <span className="text-zinc-400">—</span> : pct(s.winRate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(s.avgValue)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{s.overdue ? <span className="font-medium text-red-700">{s.overdue}</span> : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs text-zinc-600">
        <Info size={14} className="mt-px shrink-0 text-zinc-400" />
        <span>
          <b>Definitions.</b> <i>Pipeline</i>: full value of open deals. <i>Estimated value</i>: value × stage probability (New 5%, Contacted 10%, Qualified 25%, Meeting 40%, Proposal 60%).
          <i> Re-engaged</i>: a deal that was past SLA when followed up and has since replied or advanced a stage — still pipeline, not revenue. <i>Verified revenue</i>: closed-won in the CRM.
          Sending or drafting an email never counts as recovered revenue. All figures come from the fictional demo dataset.
        </span>
      </div>
    </div>
  );
}
