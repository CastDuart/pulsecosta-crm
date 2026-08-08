import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LangProvider } from './context/LangContext';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Pipeline from './pages/Pipeline';
import Leads from './pages/Leads';
import Accounts from './pages/Accounts';
import AccountDetail from './pages/AccountDetail';
import Tasks from './pages/Tasks';
import Activities from './pages/Activities';
import Reports from './pages/Reports';
import Assistant from './pages/Assistant';
import OpsDashboard from './pages/ops/OpsDashboard';
import Invoices from './pages/ops/Invoices';
import Cash from './pages/ops/Cash';
import TimeLog from './pages/ops/TimeLog';
import OpsClients from './pages/ops/OpsClients';
import OpsVisits from './pages/ops/OpsVisits';
import OpsVenues from './pages/ops/OpsVenues';
import AiAssistant from './pages/ops/AiAssistant';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function OpsRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return user?.role === 'super_admin' ? <>{children}</> : <Navigate to="/" replace />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <AppLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="leads" element={<Leads />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="accounts/:id" element={<AccountDetail />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="activities" element={<Activities />} />
        <Route path="reports" element={<Reports />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="ops" element={<OpsRoute><OpsDashboard /></OpsRoute>} />
        <Route path="ops/invoices" element={<OpsRoute><Invoices /></OpsRoute>} />
        <Route path="ops/cash" element={<OpsRoute><Cash /></OpsRoute>} />
        <Route path="ops/timelog" element={<OpsRoute><TimeLog /></OpsRoute>} />
        <Route path="ops/clients" element={<OpsRoute><OpsClients /></OpsRoute>} />
        <Route path="ops/visits" element={<OpsRoute><OpsVisits /></OpsRoute>} />
        <Route path="ops/venues" element={<OpsRoute><OpsVenues /></OpsRoute>} />
        <Route path="ops/ai" element={<OpsRoute><AiAssistant /></OpsRoute>} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LangProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </LangProvider>
    </AuthProvider>
  );
}
