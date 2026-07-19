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

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Center><Spinner /></Center>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/sales" element={<Protected><Sales /></Protected>} />
      <Route path="/sales/new" element={<Navigate to="/sales" replace />} />
      <Route path="/devices" element={<Protected><Devices /></Protected>} />
      <Route path="/devices/:id" element={<Protected><DeviceDetail /></Protected>} />
      <Route path="/customers" element={<Protected><Customers /></Protected>} />
      <Route path="/loans" element={<Protected><Loans /></Protected>} />
      <Route path="/loans/:id" element={<Protected><LoanDetail /></Protected>} />
      <Route path="/payments" element={<Protected><Payments /></Protected>} />
      <Route path="/call-centre" element={<Protected><CallCentre /></Protected>} />
      <Route path="/billing" element={<Protected><Billing /></Protected>} />
      <Route path="/staff" element={<Protected><Staff /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
