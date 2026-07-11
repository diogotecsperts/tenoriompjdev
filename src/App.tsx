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

// Layout route: monta AppLayout uma vez e usa <Outlet/> para as filhas.
// Isso evita a remontagem do sidebar/heartbeat/is_developer a cada navegação.
function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <AppLayout>
        <Outlet />
      </AppLayout>
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

      {/* Grupo com AppLayout persistente entre rotas */}
      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/laudo/new" element={<LaudoEditor />} />
        <Route path="/laudo/:id" element={<LaudoEditor />} />
        <Route path="/historico" element={<Historico />} />
        <Route path="/impugnacao" element={<Impugnacao />} />
        <Route path="/financeiro" element={<Financeiro />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
        <Route path="/profile" element={<Configuracoes />} />
      </Route>

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
