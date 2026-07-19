import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Center, Spinner } from './components/ui/misc';
import { AppShell } from './components/layout/AppShell';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sales from './pages/NewSale';
import Devices from './pages/Devices';
import DeviceDetail from './pages/DeviceDetail';
import Customers from './pages/Customers';
import Loans from './pages/Loans';
import LoanDetail from './pages/LoanDetail';
import Payments from './pages/Payments';
import Staff from './pages/Staff';
import CallCentre from './pages/CallCentre';
import Billing from './pages/Billing';
import Collections from './pages/Collections';
import CollectionCaseDetail from './pages/CollectionCaseDetail';
import CollectionsReports from './pages/CollectionsReports';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Center><Spinner /></Center>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

function Home() {
  const { user } = useAuth();
  if (user?.role === 'COLLECTOR' || user?.role === 'COLLECTIONS_ADMIN') {
    return <Navigate to="/collections" replace />;
  }
  return <Dashboard />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Home /></Protected>} />
      <Route path="/sales" element={<Protected><Sales /></Protected>} />
      <Route path="/sales/new" element={<Navigate to="/sales" replace />} />
      <Route path="/devices" element={<Protected><Devices /></Protected>} />
      <Route path="/devices/:id" element={<Protected><DeviceDetail /></Protected>} />
      <Route path="/customers" element={<Protected><Customers /></Protected>} />
      <Route path="/loans" element={<Protected><Loans /></Protected>} />
      <Route path="/loans/:id" element={<Protected><LoanDetail /></Protected>} />
      <Route path="/payments" element={<Protected><Payments /></Protected>} />
      <Route path="/call-centre" element={<Protected><CallCentre /></Protected>} />
      <Route path="/collections" element={<Protected><Collections /></Protected>} />
      <Route path="/collections/cases/:id" element={<Protected><CollectionCaseDetail /></Protected>} />
      <Route path="/collections/reports" element={<Protected><CollectionsReports /></Protected>} />
      <Route path="/billing" element={<Protected><Billing /></Protected>} />
      <Route path="/staff" element={<Protected><Staff /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
