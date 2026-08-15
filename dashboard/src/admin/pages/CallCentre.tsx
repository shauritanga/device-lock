import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Clock,
  Headphones,
  Phone,
  Search,
  Target,
  UserCheck,
  X,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import { StatCard } from '@/shared/components/StatCard';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Table, Row } from '@/shared/components/ui/Table';
import { EmptyState, Center, Spinner } from '@/shared/components/ui/misc';
import { Modal } from '@/shared/components/ui/Modal';
import { Input, Select } from '@/shared/components/ui/Field';
import { shortDate } from '@/shared/lib/format';

type PerfRow = {
  collectorId: string;
  collectorName: string;
  email: string;
  followUpsCount: number;
  callsCount: number;
  smsCount: number;
  whatsappCount: number;
  talkSeconds: number;
  hoursWorked: number;
  avgCallSeconds: number | null;
  ptpCount: number;
  casesWorked: number;
  daysActive: number;
};

type PerfResponse = {
  period: { kind: string; from: string; to: string };
  byCollector: PerfRow[];
  totals: {
    followUpsCount: number;
    callsCount: number;
    talkSeconds: number;
    hoursWorkedSeconds: number;
    ptpCount: number;
  };
};

type CollectorStaff = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  phone?: string | null;
  _count?: { assignedCollectionCases: number };
};

function formatDuration(seconds: number) {
  if (!seconds || seconds < 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatAvgCall(seconds: number | null) {
  if (seconds == null || seconds <= 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * Admin view of collector task performance — same inbox pattern as Demo requests.
 */
export default function CallCentre() {
  const [search, setSearch] = useState('');
  const [activityFilter, setActivityFilter] = useState<
    '' | 'active' | 'idle'
  >('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const perf = useQuery({
    queryKey: ['call-centre', 'collector-performance', 'day'],
    queryFn: async () =>
      (
        await api.get<PerfResponse>('/collections/reports/collector-performance', {
          params: { period: 'day' },
        })
      ).data,
  });

  const collectors = useQuery({
    queryKey: ['collections', 'collectors'],
    queryFn: async () =>
      (await api.get<CollectorStaff[]>('/collections/collectors')).data,
  });

  const openCasesById = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of collectors.data ?? []) {
      map.set(c.id, c._count?.assignedCollectionCases ?? 0);
    }
    return map;
  }, [collectors.data]);

  const phoneById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const c of collectors.data ?? []) {
      map.set(c.id, c.phone ?? null);
    }
    return map;
  }, [collectors.data]);

  const rows = useMemo(() => {
    const byPerf = new Map((perf.data?.byCollector ?? []).map((r) => [r.collectorId, r]));
    const staff = (collectors.data ?? []).filter(
      (c) => c.role === 'COLLECTOR' || c.role === 'MASTER_COLLECTOR',
    );

    // Prefer staff directory so idle collectors still appear.
    if (staff.length) {
      return staff.map((c) => {
        const p = byPerf.get(c.id);
        return (
          p ?? {
            collectorId: c.id,
            collectorName: c.fullName,
            email: c.email,
            followUpsCount: 0,
            callsCount: 0,
            smsCount: 0,
            whatsappCount: 0,
            talkSeconds: 0,
            hoursWorked: 0,
            avgCallSeconds: null,
            ptpCount: 0,
            casesWorked: 0,
            daysActive: 0,
          }
        );
      });
    }
    return perf.data?.byCollector ?? [];
  }, [collectors.data, perf.data]);

  const stats = useMemo(() => {
    const t = perf.data?.totals;
    const active = rows.filter(
      (r) => r.followUpsCount > 0 || r.callsCount > 0 || r.hoursWorked > 0,
    ).length;
    const openCases = rows.reduce(
      (sum, r) => sum + (openCasesById.get(r.collectorId) ?? 0),
      0,
    );
    return {
      collectors: rows.length,
      active,
      followUps: t?.followUpsCount ?? 0,
      calls: t?.callsCount ?? 0,
      ptps: t?.ptpCount ?? 0,
      hours: Number(((t?.hoursWorkedSeconds ?? 0) / 3600).toFixed(1)),
      openCases,
    };
  }, [perf.data, rows, openCasesById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        const busy = r.followUpsCount > 0 || r.callsCount > 0 || r.hoursWorked > 0;
        if (activityFilter === 'active' && !busy) return false;
        if (activityFilter === 'idle' && busy) return false;
        if (!q) return true;
        return `${r.collectorName} ${r.email}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.followUpsCount - a.followUpsCount || b.callsCount - a.callsCount);
  }, [rows, search, activityFilter]);

  const selected = useMemo(
    () => rows.find((r) => r.collectorId === selectedId) ?? null,
    [rows, selectedId],
  );

  const hasFilters = search.trim() !== '' || activityFilter !== '';

  function clearFilters() {
    setSearch('');
    setActivityFilter('');
  }

  if (perf.isLoading || collectors.isLoading) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="hidden text-xl font-bold tracking-tight text-ink md:block">Call Centre</h1>
          <p className="mt-0.5 text-sm text-muted">
            Daily collector performance — follow-ups, calls, promises, and time on task.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={UserCheck}
          label="Collectors"
          value={stats.collectors}
          hint={`${stats.active} active in period`}
          tone="brand"
        />
        <StatCard
          icon={Headphones}
          label="Follow-ups"
          value={stats.followUps}
          hint={`${stats.calls} calls · ${stats.ptps} PTPs`}
          tone="amber"
        />
        <StatCard
          icon={Clock}
          label="Hours worked"
          value={stats.hours}
          hint={formatDuration(perf.data?.totals.talkSeconds ?? 0) + ' talk time'}
          tone="brand"
        />
        <StatCard
          icon={Target}
          label="Open cases"
          value={stats.openCases}
          hint="Currently assigned"
          tone="green"
        />
      </div>

      <Card>
        <div className="border-b border-line px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative w-full min-w-0 sm:min-w-[12rem] sm:flex-[1.6]">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
                aria-hidden
              />
              <Input
                className="w-full min-w-0 pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search collectors…"
                aria-label="Search collectors"
              />
            </div>
            <Select
              className="w-full min-w-0 sm:w-auto sm:min-w-[9rem] sm:flex-1"
              value={activityFilter}
              onChange={(e) =>
                setActivityFilter(e.target.value as '' | 'active' | 'idle')
              }
              aria-label="Filter by activity"
            >
              <option value="">All activity</option>
              <option value="active">Active in period</option>
              <option value="idle">No activity yet</option>
            </Select>
            {hasFilters ? (
              <Button
                type="button"
                variant="ghost"
                onClick={clearFilters}
                className="w-full shrink-0 gap-1.5 px-2.5 sm:w-auto"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            ) : null}
          </div>
          {perf.data?.period ? (
            <p className="mt-2 text-xs text-muted">
              Today · {shortDate(perf.data.period.from)}
            </p>
          ) : null}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={rows.length === 0 ? 'No collectors yet' : 'No matching collectors'}
            hint={
              rows.length === 0
                ? 'Add collectors under Collectors, then assign cases.'
                : 'Try clearing search or filters.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table
              columns={[
                'Collector',
                'Open cases',
                'Follow-ups',
                'Calls',
                'SMS',
                'WhatsApp',
                'PTPs',
                'Talk',
                'Hours',
                'Avg call',
              ]}
            >
              {filtered.map((row) => {
                const open = openCasesById.get(row.collectorId) ?? 0;
                const busy =
                  row.followUpsCount > 0 || row.callsCount > 0 || row.hoursWorked > 0;
                return (
                  <Row key={row.collectorId} onClick={() => setSelectedId(row.collectorId)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas text-muted">
                          <Phone className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{row.collectorName}</p>
                          <p className="mt-0.5 truncate text-xs text-faint">{row.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink">{open}</td>
                    <td className="px-4 py-3 tabular-nums font-medium text-ink">
                      {row.followUpsCount}
                      {!busy ? (
                        <span className="ml-1.5 text-xs font-normal text-amber-700">idle</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted">{row.callsCount}</td>
                    <td className="px-4 py-3 tabular-nums text-muted">{row.smsCount}</td>
                    <td className="px-4 py-3 tabular-nums text-muted">{row.whatsappCount}</td>
                    <td className="px-4 py-3 tabular-nums text-ink">{row.ptpCount}</td>
                    <td className="px-4 py-3 tabular-nums text-muted">
                      {formatDuration(row.talkSeconds)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted">
                      {row.hoursWorked.toFixed(1)}h
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {formatAvgCall(row.avgCallSeconds)}
                    </td>
                  </Row>
                );
              })}
            </Table>
          </div>
        )}
      </Card>

      <Modal
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected?.collectorName ?? 'Collector'}
        className="max-w-lg"
      >
        {selected ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              {selected.email}
              {phoneById.get(selected.collectorId)
                ? ` · ${phoneById.get(selected.collectorId)}`
                : ''}
            </p>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Metric label="Open cases" value={String(openCasesById.get(selected.collectorId) ?? 0)} />
              <Metric label="Cases worked" value={String(selected.casesWorked)} />
              <Metric label="Follow-ups" value={String(selected.followUpsCount)} />
              <Metric label="Calls" value={String(selected.callsCount)} />
              <Metric label="SMS" value={String(selected.smsCount)} />
              <Metric label="WhatsApp" value={String(selected.whatsappCount)} />
              <Metric label="Promises (PTP)" value={String(selected.ptpCount)} />
              <Metric label="Days active" value={String(selected.daysActive)} />
              <Metric label="Talk time" value={formatDuration(selected.talkSeconds)} />
              <Metric label="Hours worked" value={`${selected.hoursWorked.toFixed(2)}h`} />
              <Metric
                label="Avg call"
                value={formatAvgCall(selected.avgCallSeconds)}
              />
            </dl>

            <p className="text-xs text-muted">
              Metrics are for today. Case work happens on the Cases page; this view
              tracks how each collector executes that work.
            </p>

            <div className="flex justify-end border-t border-line pt-4">
              <Button type="button" variant="ghost" onClick={() => setSelectedId(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2.5">
      <dt className="text-2xs font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-ink">{value}</dd>
    </div>
  );
}
