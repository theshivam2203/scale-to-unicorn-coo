import { X, type LucideIcon } from 'lucide-react';
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ApprovalStatus, FollowUpState, Priority, Stage, TaskPriority, TaskStatus } from '../domain/types';
import { TEAM } from '../domain/seed';

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export function Button({
  variant = 'secondary', size = 'md', icon: Icon, loading, className, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: LucideIcon; loading?: boolean }) {
  const v: Record<Variant, string> = {
    primary: 'bg-brand-700 text-white hover:bg-brand-800 shadow-sm',
    secondary: 'bg-white text-zinc-800 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50 shadow-sm',
    ghost: 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
    danger: 'bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
  };
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 whitespace-nowrap',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        v[variant],
        className,
      )}
    >
      {loading ? <Spinner /> : Icon ? <Icon size={size === 'sm' ? 14 : 16} strokeWidth={2} /> : null}
      {children}
    </button>
  );
}

export const Spinner = ({ className }: { className?: string }) => (
  <span className={cx('inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent', className)} />
);

export type Tone = 'neutral' | 'brand' | 'danger' | 'warn' | 'ok' | 'info';
const TONES: Record<Tone, string> = {
  neutral: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
};
export function Badge({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap', TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('min-w-0 rounded-xl border border-zinc-200 bg-white shadow-card', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, icon: Icon, right }: { title: ReactNode; subtitle?: ReactNode; icon?: LucideIcon; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && <Icon size={16} className="mt-0.5 shrink-0 text-zinc-400" />}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Avatar({ ownerId, name, size = 'sm' }: { ownerId?: string; name?: string; size?: 'sm' | 'md' }) {
  const m = TEAM.find((t) => t.id === ownerId || t.name === name);
  const initials = m?.initials ?? (name ?? '?').split(' ').map((x) => x[0]).join('').slice(0, 2);
  const isAi = name === 'AI COO';
  return (
    <span
      title={m?.name ?? name}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs',
        isAi ? 'bg-brand-700 text-white' : 'bg-zinc-200 text-zinc-700',
      )}
    >
      {isAi ? 'AI' : initials}
    </span>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [open, onClose]);
  if (!open) return null;
  // Portal to <body> so a transformed ancestor (e.g. the sliding lead drawer) can't trap the overlay.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        className={cx('w-full animate-fadein rounded-t-2xl bg-white shadow-pop sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-zinc-100 p-3 text-zinc-400"><Icon size={20} /></div>
      <p className="text-sm font-medium text-zinc-800">{title}</p>
      {text && <p className="mt-1 max-w-sm text-xs text-zinc-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const Label = ({ children }: { children: ReactNode }) => <label className="mb-1 block text-xs font-medium text-zinc-600">{children}</label>;

export const inputCls =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100';

// ---------- Domain badges ----------

const STAGE_TONE: Record<Stage, Tone> = {
  New: 'info', Contacted: 'neutral', Qualified: 'brand', 'Meeting Booked': 'brand', 'Proposal Sent': 'warn', Won: 'ok', Lost: 'neutral',
};
export const StageBadge = ({ stage }: { stage: Stage }) => <Badge tone={STAGE_TONE[stage]}>{stage}</Badge>;

const PRIORITY_TONE: Record<Priority | TaskPriority, Tone> = { Critical: 'danger', Urgent: 'danger', High: 'warn', Medium: 'neutral', Low: 'neutral' };
export const PriorityBadge = ({ p }: { p: Priority | TaskPriority }) => <Badge tone={PRIORITY_TONE[p]} dot={p === 'Critical' || p === 'Urgent'}>{p}</Badge>;

export function FollowUpBadge({ state, overdue }: { state: FollowUpState; overdue: boolean }) {
  if (state === 'draft_pending') return <Badge tone="brand">Draft awaiting approval</Badge>;
  if (state === 'sent') return <Badge tone="ok">Followed up (simulated)</Badge>;
  if (state === 'replied') return <Badge tone="info">Replied</Badge>;
  if (overdue) return <Badge tone="danger" dot>Follow-up overdue</Badge>;
  return <Badge>On track</Badge>;
}

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  if (status === 'pending') return <Badge tone="warn">Draft · awaiting approval</Badge>;
  if (status === 'approved') return <Badge tone="info"><Spinner className="!h-2.5 !w-2.5" /> Approved · executing</Badge>;
  if (status === 'executed') return <Badge tone="ok">Completed · simulated</Badge>;
  return <Badge tone="neutral">Rejected</Badge>;
}

const TASK_STATUS: Record<TaskStatus, [string, Tone]> = {
  suggested: ['AI suggested', 'brand'], todo: ['To do', 'neutral'], in_progress: ['In progress', 'info'], blocked: ['Blocked', 'warn'], done: ['Done', 'ok'],
};
export const TaskStatusBadge = ({ s }: { s: TaskStatus }) => <Badge tone={TASK_STATUS[s][1]}>{TASK_STATUS[s][0]}</Badge>;

export const SimTag = () => (
  <span className="inline-flex items-center rounded bg-zinc-100 px-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">simulated</span>
);
