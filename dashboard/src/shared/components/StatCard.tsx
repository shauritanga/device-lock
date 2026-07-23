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
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${toneBg}`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-sm font-medium text-muted">{label}</span>
      </div>
      <div className="mt-4 flex items-end gap-2">
        <span className="text-3xl font-bold tracking-tight tabular-nums">{value}</span>
        {hint && <span className="mb-1 text-xs text-muted">{hint}</span>}
      </div>
    </Card>
  );
}
