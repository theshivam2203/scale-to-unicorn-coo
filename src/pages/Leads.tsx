import { useMemo, useState } from 'react';
import { AlertTriangle, Search, Sparkles, Users } from 'lucide-react';
import type { LeadSource, Stage } from '../domain/types';
import { LEAD_SOURCES, STAGES } from '../domain/types';
import { useStore } from '../store/store';
import { ownerName } from '../domain/metrics';
import { money, relTime } from '../domain/util';
import { hoursSinceTouch, isNeglectedHighValue, isOpen, isOverdue, recommendAction, scoreLead } from '../services/ai/engine';
import { navigate, type Route } from '../router';
import { Avatar, Badge, Button, Card, EmptyState, FollowUpBadge, PageHeader, PriorityBadge, StageBadge, cx } from '../components/ui';

type Urgency = 'all' | 'overdue' | 'critical' | 'ok';
const VIEWS: Record<string, string> = { all: 'All leads', open: 'Open deals', overdue: 'Needs follow-up', reengaged: 'Re-engaged' };

export function Leads({ route }: { route: Route }) {
  const leads = useStore((s) => s.leads);
  const openLead = useStore((s) => s.openLead);
  const generateFollowUps = useStore((s) => s.generateFollowUps);
  const toast = useStore((s) => s.toast);
  const view = route.params.get('view') ?? 'all';
  const [q, setQ] = useState('');
  const [source, setSource] = useState<LeadSource | 'all'>('all');
  const [status, setStatus] = useState<Stage | 'all'>('all');
  const [minValue, setMinValue] = useState(0);
  const [urgency, setUrgency] = useState<Urgency>('all');
  const [sort, setSort] = useState<'priority' | 'value' | 'touch'>('priority');

  const rows = useMemo(() => {
    const now = Date.now();
    return leads
      .filter((l) => (view === 'open' ? isOpen(l) : view === 'overdue' ? isOverdue(l, now) : view === 'reengaged' ? !!l.recoveredAt : true))
      .filter((l) => source === 'all' || l.source === source)
      .filter((l) => status === 'all' || l.status === status)
      .filter((l) => l.value >= minValue)
      .filter((l) => {
        const sc = scoreLead(l, now);
        if (urgency === 'overdue') return isOverdue(l, now);
        if (urgency === 'critical') return isOpen(l) && (sc.priority === 'Critical' || sc.priority === 'High');
        if (urgency === 'ok') return isOpen(l) && !isOverdue(l, now);
        return true;
      })
      .filter((l) => !q || `${l.name} ${l.company} ${l.email}`.toLowerCase().includes(q.toLowerCase()))
      .map((l) => ({ l, s: scoreLead(l, now) }))
      .sort((a, b) =>
        sort === 'value' ? b.l.value - a.l.value : sort === 'touch' ? hoursSinceTouch(b.l, now) - hoursSinceTouch(a.l, now) : b.s.total - a.s.total || b.l.value - a.l.value,
      );
  }, [leads, view, source, status, minValue, urgency, q, sort]);

  const neglected = leads.filter((l) => isNeglectedHighValue(l));
  const draftable = rows.filter(({ l }) => isOverdue(l) && l.followUp !== 'draft_pending').map(({ l }) => l.id);
  const selCls = 'h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-700 focus:border-brand-400 focus:outline-none';
  const filtered = source !== 'all' || status !== 'all' || minValue > 0 || urgency !== 'all' || q;

  return (
    <div>
      <PageHeader
        title="Leads & CRM"
        subtitle={`${leads.length} leads · ${leads.filter(isOpen).length} open · demo CRM (GoHighLevel mock)`}
        actions={draftable.length > 0 && (
          <Button variant="primary" icon={Sparkles} onClick={() => { const ids = generateFollowUps(draftable); toast(`${ids.length} follow-up draft${ids.length > 1 ? 's' : ''} sent to approvals`); }}>
            Draft follow-ups for {draftable.length} overdue
          </Button>
        )}
      />

      {neglected.length > 0 && (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span><b>{neglected.length} high-value lead{neglected.length > 1 ? 's have' : ' has'} missed follow-up</b> — {neglected.map((l) => `${l.company} (${money(l.value, true)})`).join(', ')}.</span>
          </span>
          {view !== 'overdue' && <Button size="sm" variant="danger" onClick={() => navigate('/leads?view=overdue')}>Show them</Button>}
        </div>
      )}

      {/* Stage pipeline strip */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {STAGES.map((s) => {
          const ls = leads.filter((l) => l.status === s);
          const active = status === s;
          return (
            <button key={s} onClick={() => setStatus(active ? 'all' : s)} className={cx('min-w-[118px] flex-1 rounded-lg border px-3 py-2 text-left transition', active ? 'border-brand-400 bg-brand-50' : 'border-zinc-200 bg-white hover:border-zinc-300')}>
              <div className="text-[11px] font-medium text-zinc-500">{s}</div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-semibold text-zinc-900">{ls.length}</span>
                <span className="text-[11px] tabular-nums text-zinc-500">{money(ls.reduce((x, l) => x + l.value, 0), true)}</span>
              </div>
            </button>
          );
        })}
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-zinc-100 p-3 sm:p-4">
          <div className="flex flex-wrap gap-1">
            {Object.entries(VIEWS).map(([k, v]) => (
              <button key={k} onClick={() => navigate(k === 'all' ? '/leads' : `/leads?view=${k}`)} className={cx('rounded-md px-2.5 py-1 text-xs font-medium', view === k ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100')}>
                {v}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, email" className={cx(selCls, 'w-full pl-8')} />
            </div>
            <select className={selCls} value={source} onChange={(e) => setSource(e.target.value as LeadSource | 'all')} aria-label="Lead source">
              <option value="all">All sources</option>{LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select className={selCls} value={status} onChange={(e) => setStatus(e.target.value as Stage | 'all')} aria-label="Status">
              <option value="all">All statuses</option>{STAGES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select className={selCls} value={minValue} onChange={(e) => setMinValue(Number(e.target.value))} aria-label="Minimum value">
              <option value={0}>Any value</option><option value={10000}>≥ $10k</option><option value={15000}>≥ $15k (high value)</option><option value={30000}>≥ $30k</option>
            </select>
            <select className={selCls} value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)} aria-label="Follow-up urgency">
              <option value="all">Any urgency</option><option value="overdue">Follow-up overdue</option><option value="critical">Critical / High priority</option><option value="ok">Within SLA</option>
            </select>
            <select className={selCls} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
              <option value="priority">Sort: priority</option><option value="value">Sort: value</option><option value="touch">Sort: longest without touch</option>
            </select>
            {filtered && <Button variant="ghost" onClick={() => { setQ(''); setSource('all'); setStatus('all'); setMinValue(0); setUrgency('all'); }}>Clear</Button>}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={Users} title="No leads match these filters" text={view === 'overdue' ? 'Every open lead is within the 24h follow-up SLA.' : undefined} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-2.5">Lead</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Value</th>
                    <th className="px-3 py-2.5">Source</th><th className="px-3 py-2.5">Last contact</th><th className="px-3 py-2.5">Owner</th>
                    <th className="px-3 py-2.5">Next recommended action</th><th className="px-4 py-2.5">Priority</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {rows.map(({ l, s }) => {
                    const hot = isNeglectedHighValue(l) || !!l.urgentReason;
                    const overdue = isOverdue(l);
                    return (
                      <tr key={l.id} onClick={() => openLead(l.id)} className={cx('cursor-pointer hover:bg-zinc-50', hot && 'bg-red-50/40 shadow-[inset_3px_0_0_#dc2626]')}>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-zinc-900">{l.name}</div>
                          <div className="text-xs text-zinc-500">{l.company} · {l.country}</div>
                        </td>
                        <td className="px-3 py-2.5"><StageBadge stage={l.status} /></td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums text-zinc-900">{money(l.value)}</td>
                        <td className="px-3 py-2.5 text-xs text-zinc-600">{l.source}</td>
                        <td className="px-3 py-2.5 text-xs">
                          <div className={cx(overdue ? 'font-medium text-red-700' : 'text-zinc-600')}>{l.lastContactAt ? relTime(l.lastContactAt) : `never (arrived ${relTime(l.createdAt)})`}</div>
                          {isOpen(l) && <div className="mt-0.5"><FollowUpBadge state={l.followUp} overdue={overdue} /></div>}
                        </td>
                        <td className="px-3 py-2.5"><span className="flex items-center gap-1.5 text-xs text-zinc-700"><Avatar ownerId={l.ownerId} />{ownerName(l.ownerId).split(' ')[0]}</span></td>
                        <td className="max-w-[260px] px-3 py-2.5 text-xs text-zinc-700">{recommendAction(l).action}</td>
                        <td className="px-4 py-2.5">{isOpen(l) ? <div className="flex items-center gap-1.5"><PriorityBadge p={s.priority} /><span className="text-[11px] tabular-nums text-zinc-400">{s.total}</span></div> : <span className="text-xs text-zinc-400">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile list */}
            <ul className="divide-y divide-zinc-100 md:hidden">
              {rows.map(({ l, s }) => (
                <li key={l.id}>
                  <button onClick={() => openLead(l.id)} className={cx('w-full px-4 py-3 text-left', (isNeglectedHighValue(l) || l.urgentReason) && 'bg-red-50/50 shadow-[inset_3px_0_0_#dc2626]')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-zinc-900">{l.name}</div>
                        <div className="text-xs text-zinc-500">{l.company} · {l.source}</div>
                      </div>
                      <div className="text-right font-medium tabular-nums">{money(l.value)}</div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StageBadge stage={l.status} />
                      {isOpen(l) && <PriorityBadge p={s.priority} />}
                      {isOpen(l) && <FollowUpBadge state={l.followUp} overdue={isOverdue(l)} />}
                    </div>
                    <p className="mt-1.5 text-xs text-zinc-600">{recommendAction(l).action}</p>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="border-t border-zinc-100 px-4 py-2 text-[11px] text-zinc-500">
          Showing {rows.length} of {leads.length}. <Badge tone="danger" className="ml-1">red edge</Badge> = neglected high-value lead or immediate-attention opportunity.
        </div>
      </Card>
    </div>
  );
}
