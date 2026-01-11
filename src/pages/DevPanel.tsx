import { useState } from "react";
import { 
  LayoutDashboard, 
  Users, 
  Cpu, 
  FileText, 
  Settings, 
  LogOut,
  ChevronLeft,
  ChevronRight,
  Terminal
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DevDashboard } from "@/components/dev-panel/DevDashboard";
import { DevUsersList } from "@/components/dev-panel/DevUsersList";
import { DevAIConfig } from "@/components/dev-panel/DevAIConfig";
import { DevLogs } from "@/components/dev-panel/DevLogs";
import { DevSystemConfig } from "@/components/dev-panel/DevSystemConfig";

type DevTab = "dashboard" | "users" | "ai" | "logs" | "system";

interface NavItem {
  id: DevTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "users", label: "Usuários", icon: Users },
  { id: "ai", label: "IA & Modelos", icon: Cpu },
  { id: "logs", label: "Logs & Métricas", icon: FileText },
  { id: "system", label: "Sistema", icon: Settings },
];

export default function DevPanel() {
  const [activeTab, setActiveTab] = useState<DevTab>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { logout, profile } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <DevDashboard />;
      case "users":
        return <DevUsersList />;
      case "ai":
        return <DevAIConfig />;
      case "logs":
        return <DevLogs />;
      case "system":
        return <DevSystemConfig />;
      default:
        return <DevDashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-card transition-all duration-300",
          sidebarCollapsed ? "w-16" : "w-64"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <Terminal className="h-6 w-6 text-primary" />
              <span className="font-bold text-foreground">DevPanel</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="h-8 w-8"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => (
            <Button
              key={item.id}
              variant={activeTab === item.id ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start gap-3",
                sidebarCollapsed && "justify-center px-2"
              )}
              onClick={() => setActiveTab(item.id)}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </Button>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border space-y-2">
          {!sidebarCollapsed && profile && (
            <div className="text-sm text-muted-foreground truncate mb-2">
              {profile.nome}
            </div>
          )}
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10",
              sidebarCollapsed && "justify-center px-2"
            )}
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {!sidebarCollapsed && <span>Sair</span>}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
