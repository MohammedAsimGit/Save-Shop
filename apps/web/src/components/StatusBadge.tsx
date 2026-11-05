export type StatusTone = 'ok' | 'warn' | 'error' | 'neutral';

const toneClasses: Record<StatusTone, string> = {
  ok: 'bg-status-ok/10 text-status-ok',
  warn: 'bg-status-warn/10 text-status-warn',
  error: 'bg-status-error/10 text-status-error',
  neutral: 'bg-surface-muted text-ink-muted',
};

const dotClasses: Record<StatusTone, string> = {
  ok: 'bg-status-ok',
  warn: 'bg-status-warn',
  error: 'bg-status-error',
  neutral: 'bg-ink-muted/60',
};

export function StatusBadge({
  tone,
  label,
}: {
  readonly tone: StatusTone;
  readonly label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${toneClasses[tone]}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dotClasses[tone]}`} />
      {label}
    </span>
  );
}
