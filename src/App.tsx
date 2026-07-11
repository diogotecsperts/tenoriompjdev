import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { LaudoProvider } from "@/contexts/LaudoContext";
import { NavigationGuardProvider } from "@/contexts/NavigationGuardContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DevProtectedRoute } from "@/components/DevProtectedRoute";
import { ModuleProtectedRoute } from "@/components/ModuleProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlobalErrorListener } from "@/components/GlobalErrorListener";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import Login from "./pages/Login";
import Hub from "./pages/Hub";
import Dashboard from "./pages/Dashboard";
import Historico from "./pages/Historico";
import PautaList from "./modules/previdenciario/pages/PautaList";
import PautaDetalhe from "./modules/previdenciario/pages/PautaDetalhe";
import PrelaudoEditor from "./modules/previdenciario/pages/PrelaudoEditor";
import { PrevLayout } from "./modules/previdenciario/components/PrevLayout";

import LaudoEditor from "./pages/LaudoEditor";
import Configuracoes from "./pages/Configuracoes";
import Impugnacao from "./pages/Impugnacao";
import Financeiro from "./pages/Financeiro";
import DevPanel from "./pages/DevPanel";
import NotFound from "./pages/NotFound";
import Impersonate from "./pages/Impersonate";

const queryClient = new QueryClient();

// Wrapper component that applies AppLayout to protected routes
function ProtectedWithLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/impersonate" element={<Impersonate />} />
      <Route
        path="/hub"
        element={
          <ProtectedRoute>
            <Hub />
          </ProtectedRoute>
        }
      />
      <Route
        path="/previdenciario"
        element={
          <ProtectedRoute>
            <ModuleProtectedRoute module="previdenciario">
              <PrevLayout>
                <PautaList />
              </PrevLayout>
            </ModuleProtectedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/previdenciario/pauta/:pautaId"
        element={
          <ProtectedRoute>
            <ModuleProtectedRoute module="previdenciario">
              <PrevLayout>
                <PautaDetalhe />
              </PrevLayout>
            </ModuleProtectedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/previdenciario/pericia/:periciaId"
        element={
          <ProtectedRoute>
            <ModuleProtectedRoute module="previdenciario">
              <PrevLayout>
                <PrelaudoEditor />
              </PrevLayout>
            </ModuleProtectedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedWithLayout>
            <Dashboard />
          </ProtectedWithLayout>
        }
      />
      <Route
        path="/laudo/new"
        element={
          <ProtectedWithLayout>
            <LaudoEditor />
          </ProtectedWithLayout>
        }
      />
      <Route
        path="/laudo/:id"
        element={
          <ProtectedWithLayout>
            <LaudoEditor />
          </ProtectedWithLayout>
        }
      />
      <Route
        path="/historico"
        element={
          <ProtectedWithLayout>
            <Historico />
          </ProtectedWithLayout>
        }
      />
      <Route
        path="/impugnacao"
        element={
          <ProtectedWithLayout>
            <Impugnacao />
          </ProtectedWithLayout>
        }
      />
      <Route
        path="/financeiro"
        element={
          <ProtectedWithLayout>
            <Financeiro />
          </ProtectedWithLayout>
        }
      />
      <Route
        path="/configuracoes"
        element={
          <ProtectedWithLayout>
            <Configuracoes />
          </ProtectedWithLayout>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedWithLayout>
            <Configuracoes />
          </ProtectedWithLayout>
        }
      />
      <Route
        path="/dev-panel"
        element={
          <DevProtectedRoute>
            <DevPanel />
          </DevProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <TooltipProvider>
          <GlobalErrorListener />
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <LaudoProvider>
                <NavigationGuardProvider>
                  <ImpersonationBanner />
                  <AppRoutes />
                </NavigationGuardProvider>
              </LaudoProvider>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
