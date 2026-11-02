import { useState, type ReactNode } from 'react';
import {
  BarChart3, Bot, CheckCircle2, ClipboardCheck, LayoutDashboard, Menu, Plug, RotateCcw, ScrollText, Sun, Users, Workflow, X, AlertTriangle, Info,
} from 'lucide-react';
import { useStore } from '../store/store';
import { CURRENT_USER, AGENCY } from '../domain/seed';
import { MODE_OVERRIDE_IGNORED } from '../services/config';
import { navigate } from '../router';
import { Avatar, Button, Modal, cx } from './ui';

export const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/command', label: 'AI COO Command', icon: Bot },
  { to: '/briefing', label: 'Daily Briefing', icon: Sun },
  { to: '/leads', label: 'Leads & CRM', icon: Users },
  { to: '/follow-up', label: 'Follow-up Autopilot', icon: Workflow },
  { to: '/approvals', label: 'Approvals', icon: ClipboardCheck },
  { to: '/operations', label: 'Operations', icon: CheckCircle2 },
  { to: '/revenue', label: 'Revenue Intelligence', icon: BarChart3 },
  { to: '/audit', label: 'Audit Log', icon: ScrollText },
  { to: '/integrations', label: 'Integrations & Safety', icon: Plug },
];

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <img src="/logo.png" alt="Scale To Unicorn" className="h-11 w-auto" />
      <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">AI COO</span>
    </div>
  );
}

export function Layout({ path, children }: { path: string; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const pending = useStore((s) => s.approvals.filter((a) => a.status === 'pending').length);
  const resetDemo = useStore((s) => s.resetDemo);
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = to === '/' ? path === '/' : path.startsWith(to);
        return (
          <a
            key={to}
            href={`#${to}`}
            onClick={() => setMobileOpen(false)}
            className={cx(
              'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
              active ? 'bg-white text-zinc-900 shadow-card ring-1 ring-zinc-200' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
            )}
          >
            <Icon size={16} className={active ? 'text-brand-700' : 'text-zinc-400 group-hover:text-zinc-600'} />
            <span className="flex-1">{label}</span>
            {to === '/approvals' && pending > 0 && <span className="rounded-full bg-brand-700 px-1.5 text-[10px] font-semibold leading-4 text-white">{pending}</span>}
          </a>
        );
      })}
    </nav>
  );

  const sideFooter = (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Avatar name={CURRENT_USER} size="md" />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-xs font-semibold text-zinc-800">{CURRENT_USER}</div>
          <div className="truncate text-[11px] text-zinc-500">Founder · {AGENCY}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col justify-between border-r border-zinc-200 bg-zinc-50/80 px-3 py-4 lg:flex">
        <div className="space-y-6">
          <div className="px-1.5"><Logo /></div>
          {nav}
        </div>
        {sideFooter}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-zinc-900/30 lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside className="flex h-full w-72 animate-fadein flex-col justify-between bg-zinc-50 px-3 py-4" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-6">
              <div className="flex items-center justify-between px-1.5"><Logo /><button onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
              {nav}
            </div>
            {sideFooter}
          </aside>
        </div>
      )}

      <div className="min-w-0 overflow-x-clip lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-zinc-200 bg-white/85 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
            <div className="lg:hidden"><Logo /></div>
            <p className="hidden text-sm text-zinc-500 lg:block">Your AI COO. Your Business, Under Control.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setConfirmReset(true)}>
              <span className="hidden sm:inline">Reset data</span>
            </Button>
          </div>
        </header>

        {MODE_OVERRIDE_IGNORED && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-xs text-red-800">
            VITE_EXECUTION_MODE requested a non-demo mode. Only demo mode is available in this build; all actions remain simulated.
          </div>
        )}

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset data?"
        footer={<><Button onClick={() => setConfirmReset(false)}>Cancel</Button><Button variant="primary" icon={RotateCcw} onClick={() => { resetDemo(); setConfirmReset(false); navigate('/'); }}>Reset to seeded scenario</Button></>}
      >
        <p className="text-sm text-zinc-600">This restores the 20 seeded leads, tasks, approvals and audit history, and clears the command history.</p>
      </Modal>

      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex animate-fadein items-start gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm shadow-pop">
            {t.tone === 'warn' ? <AlertTriangle size={16} className="mt-0.5 text-amber-600" /> : t.tone === 'info' ? <Info size={16} className="mt-0.5 text-sky-600" /> : <CheckCircle2 size={16} className="mt-0.5 text-emerald-600" />}
            <span className="flex-1 text-zinc-800">{t.text}</span>
            <button onClick={() => dismiss(t.id)} className="text-zinc-400 hover:text-zinc-700" aria-label="Dismiss"><X size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
