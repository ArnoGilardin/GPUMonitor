import { useState } from "react";
import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AuthProvider, useAuth } from "./lib/auth";
import { RealtimeProvider } from "@/hooks/use-realtime";
import { LayoutContext } from "@/components/layout/layout-context";
import Dashboard from "@/pages/dashboard";
import Servers from "@/pages/servers";
import ServerDetails from "@/pages/server-details";
import Alerts from "@/pages/alerts";
import Settings from "@/pages/settings";
import Login from "@/pages/login";
import NotFound from "@/pages/not-found";
import Sidebar from "@/components/layout/sidebar";

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <LayoutContext.Provider value={{ openMobileNav: () => setMobileNavOpen(true) }}>
      <RealtimeProvider>
        <div className="h-screen flex bg-background">
          <aside className="hidden md:block shrink-0">
            <Sidebar />
          </aside>
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetContent side="left" className="p-0 w-64 border-0">
              <Sidebar onNavigate={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>
          <main className="flex-1 min-w-0 overflow-auto">{children}</main>
        </div>
      </RealtimeProvider>
    </LayoutContext.Provider>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/servers" component={Servers} />
      <Route path="/servers/:id" component={ServerDetails} />
      <Route path="/alerts" component={Alerts} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <ProtectedLayout>
            <Router />
          </ProtectedLayout>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
