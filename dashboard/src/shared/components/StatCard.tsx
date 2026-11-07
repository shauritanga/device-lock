import { type AppIcon } from '@/shared/icons';
import { IS_FLAT_THEME } from '../config';
import { Card } from './ui/Card';

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'brand',
}: {
  icon: AppIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'brand' | 'green' | 'red' | 'amber';
}) {
  if (IS_FLAT_THEME) {
    const tint = {
      brand: 'bg-brand-600/10 text-brand-600',
      green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      red: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
      amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    }[tone];
    // rucky-rentals stat tile: tinted icon, big value, quiet label underneath.
    return (
      <Card className="p-5 transition-colors hover:border-brand-500">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className={`flex h-[34px] w-[34px] items-center justify-center rounded-[9px] ${tint}`}>
            <Icon className="h-4 w-4" />
          </div>
          {hint ? <span className="text-[11px] text-faint">{hint}</span> : null}
        </div>
        <div className="mb-1 text-[28px] font-semibold leading-none tracking-[-0.5px] tabular-nums text-ink">
          {value}
        </div>
        <div className="text-[12.5px] text-muted">{label}</div>
      </Card>
    );
  }

  const toneBg = {
    brand: 'bg-brand-100 text-brand-700',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-700',
  }[tone];

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${toneBg}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <span className="min-w-0 text-sm font-medium text-muted">{label}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2 sm:mt-4">
        <span className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
          {value}
        </span>
        {hint && <span className="mb-0.5 text-xs text-muted sm:mb-1">{hint}</span>}
      </div>
    </Card>
  );
}
