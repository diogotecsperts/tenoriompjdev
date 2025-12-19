import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { LaudoProvider } from "@/contexts/LaudoContext";
import { NavigationGuardProvider } from "@/contexts/NavigationGuardContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Historico from "./pages/Historico";
import Modelos from "./pages/Modelos";
import LaudoEditor from "./pages/LaudoEditor";
import Configuracoes from "./pages/Configuracoes";
import Impugnacao from "./pages/Impugnacao";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

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
        path="/modelos"
        element={
          <ProtectedWithLayout>
            <Modelos />
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
        path="/admin"
        element={
          <ProtectedWithLayout>
            <Admin />
          </ProtectedWithLayout>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <LaudoProvider>
              <NavigationGuardProvider>
                <AppRoutes />
              </NavigationGuardProvider>
            </LaudoProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
