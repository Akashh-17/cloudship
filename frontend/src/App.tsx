import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import DeploymentsPage from "./pages/DeploymentsPage";
import DeploymentDetailPage from "./pages/DeploymentDetailPage";
import { useAuth } from "./hooks/useAuth";

function ProtectedRoute({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <DeploymentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/deployments/:id"
          element={
            <ProtectedRoute>
              <DeploymentDetailPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
