import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Loader2 } from "lucide-react";
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
import { PrevLayout } from "./modules/previdenciario/components/PrevLayout";

// Lazy-loaded pages — cada rota vira um chunk separado, mantendo o bundle
// inicial mínimo (apenas shell + Login). Nenhuma mudança de comportamento.
const Hub = lazy(() => import("./pages/Hub"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Historico = lazy(() => import("./pages/Historico"));
const LaudoEditor = lazy(() => import("./pages/LaudoEditor"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Impugnacao = lazy(() => import("./pages/Impugnacao"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const DevPanel = lazy(() => import("./pages/DevPanel"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Impersonate = lazy(() => import("./pages/Impersonate"));
const SolicitarCadastro = lazy(() => import("./pages/SolicitarCadastro"));
const FinalizarCadastro = lazy(() => import("./pages/FinalizarCadastro"));
const PautaList = lazy(() => import("./modules/previdenciario/pages/PautaList"));
const PautaDetalhe = lazy(() => import("./modules/previdenciario/pages/PautaDetalhe"));
const PrelaudoEditor = lazy(() => import("./modules/previdenciario/pages/PrelaudoEditor"));


const queryClient = new QueryClient();

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

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
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/solicitar-cadastro" element={<SolicitarCadastro />} />
        <Route path="/finalizar-cadastro" element={<FinalizarCadastro />} />
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
    </Suspense>
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
