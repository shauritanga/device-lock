import { type LucideIcon } from 'lucide-react';
import { Card } from './ui/Card';

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'brand',
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'brand' | 'green' | 'red' | 'amber';
}) {
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
