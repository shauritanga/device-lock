import { Navigate, Route, Routes } from 'react-router-dom';
import { AppGuard, RequireRole } from '@/shared/auth/guards';
import { SELLER_ADMIN_ROLES } from '@/shared/auth/roles';
import { AppShell } from '@/shared/layout/AppShell';
import Login from '@/shared/pages/Login';
import { CLIENT_BRAND, CLIENT_NAV } from './nav';
import Dashboard from './pages/Dashboard';
import Sales from './pages/NewSale';
import Devices from './pages/Devices';
import DeviceDetail from './pages/DeviceDetail';
import Customers from './pages/Customers';
import Loans from './pages/Loans';
import LoanDetail from './pages/LoanDetail';
import Payments from './pages/Payments';
import Staff from './pages/Staff';
import Billing from './pages/Billing';
import CollectionsService from './pages/CollectionsService';
import Profile from '@/shared/pages/Profile';
import Settings from '@/shared/pages/Settings';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppGuard app="client">
      <AppShell brand={CLIENT_BRAND} navGroups={CLIENT_NAV}>
        {children}
      </AppShell>
    </AppGuard>
  );
}

export default function ClientApp() {
  return (
    <Routes>
      <Route path="/login" element={<Login app="client" brand={CLIENT_BRAND} />} />

      <Route path="/" element={<Shell><Dashboard /></Shell>} />
      <Route path="/sales" element={<Shell><Sales /></Shell>} />
      <Route path="/sales/new" element={<Navigate to="/sales" replace />} />
      <Route path="/devices" element={<Shell><Devices /></Shell>} />
      <Route path="/devices/:id" element={<Shell><DeviceDetail /></Shell>} />
      <Route path="/customers" element={<Shell><Customers /></Shell>} />
      <Route path="/loans" element={<Shell><Loans /></Shell>} />
      <Route path="/loans/:id" element={<Shell><LoanDetail /></Shell>} />
      <Route path="/payments" element={<Shell><Payments /></Shell>} />

      <Route
        path="/collections-service"
        element={
          <Shell>
            <RequireRole allow={['OWNER', 'MANAGER']}>
              <CollectionsService />
            </RequireRole>
          </Shell>
        }
      />

      <Route
        path="/billing"
        element={
          <Shell>
            <RequireRole allow={SELLER_ADMIN_ROLES}>
              <Billing />
            </RequireRole>
          </Shell>
        }
      />
      <Route
        path="/staff"
        element={
          <Shell>
            <RequireRole allow={SELLER_ADMIN_ROLES}>
              <Staff />
            </RequireRole>
          </Shell>
        }
      />
      <Route path="/profile" element={<Shell><Profile /></Shell>} />
      <Route path="/settings" element={<Shell><Settings /></Shell>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
