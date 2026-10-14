import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, ExternalLink, List, Map as MapIcon, MapPin, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Table, Row } from '@/shared/components/ui/Table';
import { StatusPill } from '@/shared/components/ui/Pill';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { Modal } from '@/shared/components/ui/Modal';
import { Input } from '@/shared/components/ui/Field';
import { cn } from '@/shared/lib/cn';
import { useAuth } from '@/shared/auth/AuthContext';
import { PLATFORM_ADMIN_ROLES, roleAllowed } from '@/shared/auth/roles';
import { DeviceLockActions, DeviceLockDialog } from '../components/DeviceLockDialog';

type AdminDevice = {
  id: string;
  imei: string;
  make?: string | null;
  model?: string | null;
  status: string;
  lastCheckInAt?: string | null;
  lastLat?: number | null;
  lastLng?: number | null;
  lastLocationAccuracy?: number | null;
  lastLocationAt?: string | null;
  tenant: { id: string; name: string };
  customer?: { id: string; fullName: string; phone: string; address?: string | null } | null;
  loan?: {
    id: string;
    status: string;
    installments?: Array<{ id: string }>;
    collectionCase?: { id: string; status: string } | null;
  } | null;
};

type Filter = 'all' | 'overdue' | 'locked' | 'located';
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'locked', label: 'Locked' },
  { id: 'located', label: 'With location' },
];

const STALE_DAYS = 3;

function ago(iso?: string | null): string {
  if (!iso) return 'never';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins || 1} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

function isStale(iso?: string | null) {
  return !iso || Date.now() - new Date(iso).getTime() > STALE_DAYS * 86400000;
}

function overdueCount(d: AdminDevice) {
  return d.loan?.installments?.length ?? 0;
}

function pinColor(d: AdminDevice) {
  if (d.status === 'LOCKED') return '#e11d48';
  if (overdueCount(d) > 0) return '#d97706';
  return '#059669';
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Leaflet map with one pin per located device. */
function DevicesMap({ devices, onOpen }: { devices: AdminDevice[]; onOpen: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { scrollWheelZoom: true }).setView([-6.8, 39.28], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    const pts: L.LatLngTuple[] = [];
    for (const d of devices) {
      if (d.lastLat == null || d.lastLng == null) continue;
      pts.push([d.lastLat, d.lastLng]);
      const m = L.circleMarker([d.lastLat, d.lastLng], {
        radius: 9,
        color: '#fff',
        weight: 2,
        fillColor: pinColor(d),
        fillOpacity: 1,
      }).addTo(layer.current);
      const wrap = document.createElement('div');
      wrap.innerHTML = `<b>${esc(d.customer?.fullName ?? d.imei)}</b><br/>${esc(d.customer?.phone ?? '')}<br/><small>${esc(d.tenant.name)} · ${esc(ago(d.lastLocationAt))}</small>`;
      const btn = document.createElement('button');
      btn.textContent = 'Open details';
      btn.style.cssText = 'margin-top:6px;color:#4338ca;text-decoration:underline;font-size:12px';
      btn.onclick = () => onOpen(d.id);
      wrap.appendChild(document.createElement('br'));
      wrap.appendChild(btn);
      m.bindPopup(wrap);
    }
    if (pts.length) map.current.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 15 });
  }, [devices, onOpen]);

  return <div ref={el} className="h-[28rem] w-full overflow-hidden rounded-xl border border-line" />;
}

function embed(lat: number, lng: number) {
  const d = 0.005;
  const bbox = [lng - d, lat - d, lng + d, lat + d].join('%2C');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
}

/** Platform-admin view of phones handed over for collections follow-up, with last-known location. */
export default function Devices() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canLockDevices = roleAllowed(user?.role, PLATFORM_ADMIN_ROLES);
  const [lockAction, setLockAction] = useState<'LOCK' | 'UNLOCK' | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-devices', q, filter],
    queryFn: async () =>
      (
        await api.get<AdminDevice[]>('/collections/devices', {
          params: {
            ...(q.trim() ? { q: q.trim() } : {}),
            ...(filter === 'overdue' ? { overdue: 'true' } : {}),
            ...(filter === 'locked' ? { status: 'LOCKED' } : {}),
            ...(filter === 'located' ? { located: 'true' } : {}),
          },
        })
      ).data,
  });

  const selected = data?.find((d) => d.id === selectedId) ?? null;
  const located = data?.filter((d) => d.lastLat != null) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            className="!pl-9"
            placeholder="Search customer, phone or IMEI"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="inline-flex rounded-xl border border-line bg-surface p-0.5">
          {(['list', 'map'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium',
                view === v ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink',
              )}
            >
              {v === 'list' ? <List className="h-4 w-4" /> : <MapIcon className="h-4 w-4" />}
              {v === 'list' ? 'List' : 'Map'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm transition',
              filter === f.id
                ? 'border-brand-500 bg-brand-50 font-medium text-brand-800'
                : 'border-line bg-surface text-ink hover:bg-canvas',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Center>
          <Spinner />
        </Center>
      ) : !data || data.length === 0 ? (
        <Card className="p-3">
          <EmptyState
            title="No handed-over phones"
            hint="Phones appear here once a seller hands the customer over for collections follow-up, or the case opens automatically. Try a different search or filter."
          />
        </Card>
      ) : view === 'map' ? (
        <Card className="space-y-3 p-3">
          {located.length === 0 ? (
            <EmptyState
              title="No locations yet"
              hint="Phones report a location the next time they check in."
            />
          ) : (
            <>
              <DevicesMap devices={located} onOpen={setSelectedId} />
              <div className="flex flex-wrap gap-4 px-1 text-xs text-muted">
                {[
                  ['#059669', 'In good standing'],
                  ['#d97706', 'Overdue'],
                  ['#e11d48', 'Locked'],
                ].map(([c, l]) => (
                  <span key={l} className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                    {l}
                  </span>
                ))}
                <span>
                  {located.length} of {data.length} phones have a location
                </span>
              </div>
            </>
          )}
        </Card>
      ) : (
        <Card className="p-3">
          <Table columns={['Customer', 'Company', 'Device', 'Status', 'Last seen', 'Location']}>
            {data.map((d) => (
              <Row key={d.id} onClick={() => setSelectedId(d.id)}>
                <td className="px-4 py-3">
                  <div className="font-medium">{d.customer?.fullName ?? '—'}</div>
                  <div className="text-xs text-muted">
                    {d.customer?.phone}
                    {d.customer?.address ? ` · ${d.customer.address}` : ''}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{d.tenant.name}</td>
                <td className="px-4 py-3 text-muted">
                  {d.imei}
                  {d.model ? ` · ${d.model}` : ''}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusPill status={d.status} />
                    {overdueCount(d) > 0 ? (
                      <StatusPill status="OVERDUE" />
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1',
                      d.status !== 'PENDING_ENROLLMENT' && isStale(d.lastCheckInAt)
                        ? 'font-medium text-amber-700'
                        : 'text-muted',
                    )}
                  >
                    {d.status !== 'PENDING_ENROLLMENT' && isStale(d.lastCheckInAt) ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : null}
                    {ago(d.lastCheckInAt)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {d.lastLat != null ? (
                    <span className="inline-flex items-center gap-1 text-brand-700">
                      <MapPin className="h-4 w-4" />
                      {ago(d.lastLocationAt)}
                    </span>
                  ) : (
                    <span className="text-muted">No fix</span>
                  )}
                </td>
              </Row>
            ))}
          </Table>
        </Card>
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected?.customer?.fullName ?? 'Device'}
      >
        {selected ? (
          <div className="space-y-3">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted">Phone</p>
                <p>{selected.customer?.phone ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Address</p>
                <p>{selected.customer?.address ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Company</p>
                <p>{selected.tenant.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Last check-in</p>
                <p>{ago(selected.lastCheckInAt)}</p>
              </div>
            </div>
            {selected.lastLat != null && selected.lastLng != null ? (
              <>
                <iframe
                  title="Device location"
                  className="h-64 w-full rounded-xl border border-line"
                  src={embed(selected.lastLat, selected.lastLng)}
                />
                <p className="text-xs text-muted">
                  {selected.lastLat.toFixed(5)}, {selected.lastLng.toFixed(5)}
                  {selected.lastLocationAccuracy != null
                    ? ` · ±${Math.round(selected.lastLocationAccuracy)} m`
                    : ''}
                  {' · '}
                  {ago(selected.lastLocationAt)}
                </p>
                <a
                  className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
                  href={`https://www.google.com/maps?q=${selected.lastLat},${selected.lastLng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Google Maps <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </>
            ) : (
              <p className="rounded-xl bg-canvas px-3 py-2 text-sm text-muted">
                No location yet. It appears after the phone's next check-in with location on.
              </p>
            )}
            {canLockDevices ? (
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <DeviceLockActions
                  device={{
                    id: selected.id,
                    imei: selected.imei,
                    model: selected.model,
                    customerName: selected.customer?.fullName,
                    company: selected.tenant.name,
                    status: selected.status,
                  }}
                  onAction={setLockAction}
                />
              </div>
            ) : null}
            {selected.loan?.collectionCase ? (
              <button
                type="button"
                className="text-sm font-medium text-brand-700 hover:underline"
                onClick={() => navigate(`/cases/${selected.loan!.collectionCase!.id}`)}
              >
                Open collections case →
              </button>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <DeviceLockDialog
        device={
          selected && lockAction
            ? {
                id: selected.id,
                imei: selected.imei,
                model: selected.model,
                customerName: selected.customer?.fullName,
                company: selected.tenant.name,
                status: selected.status,
              }
            : null
        }
        action={lockAction ?? 'LOCK'}
        onClose={() => setLockAction(null)}
      />
    </div>
  );
}
