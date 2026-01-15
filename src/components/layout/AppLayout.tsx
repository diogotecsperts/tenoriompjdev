import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigationGuardContext } from "@/contexts/NavigationGuardContext";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  FilePlus,
  History,
  FileDown,
  Scale,
  DollarSign,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ImportarAutosDialog } from "@/components/tools/ImportarAutosDialog";

interface AppLayoutProps {
  children: React.ReactNode;
}

const mainMenuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: FilePlus, label: "Nova Perícia", path: "/laudo/new" },
  { icon: History, label: "Histórico", path: "/historico" },
  
  { icon: DollarSign, label: "Financeiro", path: "/financeiro", badge: "Em breve" },
];

const toolMenuItems = [
  { icon: FileDown, label: "Importar Autos (PDF)", action: "import" },
  { icon: Scale, label: "Responder Impugnação", path: "/impugnacao" },
];

export function AppLayout({ children }: AppLayoutProps) {
  const { user, profile, logout } = useAuth();
  const { isGuarded, requestNavigation } = useNavigationGuardContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);

  useEffect(() => {
    const checkDevRole = async () => {
      if (user) {
        const { data } = await supabase.rpc("is_developer");
        setIsDeveloper(data === true);
      }
    };
    checkDevRole();
  }, [user]);

  const handleSignOut = async () => {
    await logout();
  };

  const handleToolAction = (action: string) => {
    if (action === "import") {
      setImportDialogOpen(true);
    }
    setMobileOpen(false);
  };

  const userInitials = profile?.nome
    ? profile.nome
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase()
    : "U";

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2">
          {!collapsed && (
            <span className="text-xl font-bold text-primary">Tenório MPJ</span>
          )}
          {collapsed && (
            <span className="text-xl font-bold text-primary">T</span>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="hidden lg:flex h-8 w-8"
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform",
              collapsed && "rotate-180"
            )}
          />
        </Button>
      </div>

      <Separator />

      {/* Main Menu */}
      <nav className="flex-1 p-3 space-y-1">
        <div className={cn("mb-2", !collapsed && "px-2")}>
          {!collapsed && (
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Menu
            </span>
          )}
        </div>
        {mainMenuItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path === "/laudo/new" && location.pathname.startsWith("/laudo/"));
          
          const handleClick = (e: React.MouseEvent) => {
            if (isGuarded && location.pathname.startsWith("/laudo/")) {
              e.preventDefault();
              if (!requestNavigation(item.path)) {
                // Navigation blocked, dialog will be shown by LaudoEditor
                return;
              }
            }
            setMobileOpen(false);
          };
          
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={handleClick}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && (
                <div className="flex items-center gap-2 flex-1">
                  <span>{item.label}</span>
                  {item.badge && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 leading-none font-normal text-muted-foreground border-muted-foreground/30 ml-auto">
                      {item.badge}
                    </Badge>
                  )}
                </div>
              )}
            </Link>
          );
        })}

        <Separator className="my-4" />

        {/* Tools Menu */}
        <div className={cn("mb-2", !collapsed && "px-2")}>
          {!collapsed && (
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Ferramentas
            </span>
          )}
        </div>
        {toolMenuItems.map((item) => {
          const isActive = item.path && location.pathname === item.path;
          if (item.path) {
            const handleClick = (e: React.MouseEvent) => {
              if (isGuarded && location.pathname.startsWith("/laudo/")) {
                e.preventDefault();
                if (!requestNavigation(item.path)) {
                  return;
                }
              }
              setMobileOpen(false);
            };
            
            return (
              <Link
                key={item.label}
                to={item.path}
                onClick={handleClick}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          }
          return (
            <button
              key={item.label}
              onClick={() => handleToolAction(item.action!)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full text-left",
                "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <div
          className={cn(
            "flex items-center gap-3 p-2 rounded-lg",
            !collapsed && "mb-2"
          )}
        >
          <Avatar className="h-9 w-9 flex-shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {profile?.nome || "Usuário"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {profile?.crm ? `CRM ${profile.crm}` : user?.email}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <Link
            to="/configuracoes"
            onClick={(e) => {
              if (isGuarded && location.pathname.startsWith("/laudo/")) {
                e.preventDefault();
                if (!requestNavigation("/configuracoes")) {
                  return;
                }
              }
              setMobileOpen(false);
            }}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              location.pathname === "/configuracoes"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Settings className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span>Configurações</span>}
          </Link>
          {isDeveloper && (
            <Link
              to="/dev-panel"
              onClick={(e) => {
                if (isGuarded && location.pathname.startsWith("/laudo/")) {
                  e.preventDefault();
                  if (!requestNavigation("/dev-panel")) {
                    return;
                  }
                }
                setMobileOpen(false);
              }}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Terminal className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span>DevPanel</span>}
            </Link>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full text-left text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="min-h-screen flex w-full bg-background">
        {/* Desktop Sidebar */}
        <aside
          className={cn(
            "hidden lg:flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
            collapsed ? "w-[70px]" : "w-[260px]"
          )}
        >
          <SidebarContent />
        </aside>

        {/* Mobile Header & Sidebar */}
        <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 border-b border-border bg-card flex items-center px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-[280px]">
              <SidebarContent />
            </SheetContent>
          </Sheet>
          <span className="ml-3 text-lg font-bold text-primary">Tenório MPJ</span>
        </div>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-h-screen lg:min-h-0">
          <div className="lg:hidden h-14" /> {/* Spacer for mobile header */}
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Dialogs */}
      <ImportarAutosDialog 
        open={importDialogOpen} 
        onOpenChange={setImportDialogOpen} 
      />
    </>
  );
}
