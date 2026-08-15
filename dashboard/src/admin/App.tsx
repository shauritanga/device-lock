import { Navigate, Route, Routes } from 'react-router-dom';
import { AppGuard, RequireRole } from '@/shared/auth/guards';
import { PLATFORM_ADMIN_ROLES, STAFFING_ADMIN_ROLES } from '@/shared/auth/roles';
import { AppShell } from '@/shared/layout/AppShell';
import Login from '@/shared/pages/Login';
import { ADMIN_BRAND, ADMIN_NAV } from './nav';
import Collections from './pages/Collections';
import CollectionCaseDetail from './pages/CollectionCaseDetail';
import CollectionsReports from './pages/CollectionsReports';
import CallCentre from './pages/CallCentre';
import Companies from './pages/Companies';
import CompanyDetail from './pages/CompanyDetail';
import Collectors from './pages/Collectors';
import DemoRequests from './pages/DemoRequests';
import AdminDashboard from './pages/Dashboard';
import Profile from '@/shared/pages/Profile';
import Settings from '@/shared/pages/Settings';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppGuard app="admin">
      <AppShell brand={ADMIN_BRAND} navGroups={ADMIN_NAV}>
        {children}
      </AppShell>
    </AppGuard>
  );
}

export default function AdminApp() {
  return (
    <Routes>
      <Route path="/login" element={<Login app="admin" brand={ADMIN_BRAND} />} />

      <Route path="/" element={<Shell><AdminDashboard /></Shell>} />
      <Route path="/cases" element={<Shell><Collections /></Shell>} />
      <Route path="/cases/:id" element={<Shell><CollectionCaseDetail /></Shell>} />
      <Route path="/reports" element={<Shell><CollectionsReports /></Shell>} />

      <Route
        path="/call-centre"
        element={
          <Shell>
            <RequireRole allow={STAFFING_ADMIN_ROLES}>
              <CallCentre />
            </RequireRole>
          </Shell>
        }
      />
      <Route
        path="/demo-requests"
        element={
          <Shell>
            <RequireRole allow={PLATFORM_ADMIN_ROLES}>
              <DemoRequests />
            </RequireRole>
          </Shell>
        }
      />
      <Route
        path="/companies"
        element={
          <Shell>
            <RequireRole allow={PLATFORM_ADMIN_ROLES}>
              <Companies />
            </RequireRole>
          </Shell>
        }
      />
      <Route
        path="/companies/:id"
        element={
          <Shell>
            <RequireRole allow={PLATFORM_ADMIN_ROLES}>
              <CompanyDetail />
            </RequireRole>
          </Shell>
        }
      />
      <Route path="/collectors" element={<Shell><Collectors /></Shell>} />
      <Route path="/profile" element={<Shell><Profile /></Shell>} />
      <Route path="/settings" element={<Shell><Settings /></Shell>} />

      {/* Legacy paths from the single-console build. */}
      <Route path="/collections" element={<Navigate to="/cases" replace />} />
      <Route path="/collections/reports" element={<Navigate to="/reports" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
