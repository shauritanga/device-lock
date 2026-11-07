import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from '@/shared/icons';
import { api } from '@/shared/api/client';
import type { Customer } from '@/shared/api/types';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Table, Row } from '@/shared/components/ui/Table';
import { Avatar, Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { FigureStrip } from '@/shared/components/FigureStrip';
import { ListToolbar } from '@/shared/components/ListToolbar';
import { PanelEmpty } from '@/shared/components/Panel';
import { shortDate } from '@/shared/lib/format';

const ID_TYPES = [
  { value: 'NATIONAL_ID', label: 'National ID' },
  { value: 'VOTER_ID', label: 'Voter ID' },
  { value: 'DRIVING_LICENSE', label: 'Driving licence' },
  { value: 'PASSPORT', label: 'Passport' },
] as const;

function idTypeLabel(type?: string | null) {
  return ID_TYPES.find((t) => t.value === type)?.label ?? 'ID';
}

export default function Customers() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get<Customer[]>('/customers')).data,
  });

  const stats = useMemo(() => {
    const all = data ?? [];
    const now = new Date();
    return {
      total: all.length,
      month: all.filter((c) => {
        const d = new Date(c.createdAt);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }).length,
      withGuardians: all.filter((c) => (c._count?.guardians ?? 0) > 0).length,
      without: all.filter((c) => (c._count?.guardians ?? 0) === 0).length,
    };
  }, [data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((c) =>
      [c.fullName, c.phone, c.nationalId].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [data, query]);

  if (isLoading) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => navigate('/sales')}>
          <Plus className="h-4 w-4" /> New customer (credit sale)
        </Button>
      </div>

      <FigureStrip
        items={[
          { label: 'Total customers', value: stats.total },
          { label: 'Joined this month', value: stats.month },
          { label: 'With guardians', value: stats.withGuardians },
          { label: 'No guardians yet', value: stats.without },
        ]}
      />

      <Card>
        <ListToolbar
          title="All customers"
          noun="customer"
          count={rows.length}
          query={query}
          onQuery={setQuery}
          placeholder="Search name, phone, ID number"
        />
        {!data || data.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No customers yet"
              hint="Customers are added through a credit sale, with their guardians."
            />
          </div>
        ) : rows.length === 0 ? (
          <PanelEmpty>No customers match your search.</PanelEmpty>
        ) : (
          <Table columns={['Customer', 'Phone', 'Person ID', 'Guardians', 'Joined']}>
            {rows.map((c) => (
              <Row key={c.id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.fullName} />
                    <span className="font-medium">{c.fullName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{c.phone}</td>
                <td className="px-4 py-3 text-muted">
                  {c.nationalId
                    ? `${idTypeLabel(c.idDocumentType)} · ${c.nationalId}`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-muted">{c._count?.guardians ?? 0} of 3</td>
                <td className="px-4 py-3 text-right text-muted">
                  {shortDate(c.createdAt)}
                </td>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
