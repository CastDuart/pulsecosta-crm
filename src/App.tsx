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

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
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
