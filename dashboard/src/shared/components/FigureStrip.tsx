import { Card } from './ui/Card';

export type Figure = { label: string; value: string | number; hint?: string };

/** A row of key figures in one calm card — no icons, no coloured tiles. */
export function FigureStrip({ items }: { items: Figure[] }) {
  return (
    <Card>
      <dl
        className="grid grid-cols-2 divide-line sm:divide-x lg:grid-cols-[repeat(var(--n),minmax(0,1fr))]"
        style={{ ['--n' as string]: items.length }}
      >
        {items.map((f) => (
          <div key={f.label} className="px-5 py-4">
            <dt className="text-xs text-muted">{f.label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-ink">
              {f.value}
            </dd>
            {f.hint ? <p className="mt-0.5 text-xs text-faint">{f.hint}</p> : null}
          </div>
        ))}
      </dl>
    </Card>
  );
}
