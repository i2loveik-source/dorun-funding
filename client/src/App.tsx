import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";

// Lazy-loaded pages
const Login = lazy(() => import("@/pages/Login"));
const FundingList = lazy(() => import("@/pages/FundingList"));
const FundingDetail = lazy(() => import("@/pages/FundingDetail"));
const FundingNew = lazy(() => import("@/pages/FundingNew"));
const FundingMy = lazy(() => import("@/pages/FundingMy"));
const FundingAdmin = lazy(() => import("@/pages/FundingAdmin"));
const ExchangePage = lazy(() => import("@/pages/ExchangePage"));
const CoinLaunchPage = lazy(() => import("@/pages/CoinLaunchPage"));
const TransparencyReport = lazy(() => import("@/pages/TransparencyReport"));
const NotFound = lazy(() => import("@/pages/not-found"));

const PageLoader = () => (
  <div className="flex items-center justify-center h-full py-20">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

function ProtectedRoute({ component: Component, ...rest }: { component: React.ComponentType<any>; [key: string]: any }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // 로그인 안 된 경우 메인 앱으로 리디렉션
    window.location.href = "https://dorunhub.com/login?redirect=funding";
    return null;
  }

  return <Component {...rest} />;
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/login" component={Login} />

        <Route path="/">
          <ProtectedRoute component={FundingList} />
        </Route>
        <Route path="/funding">
          <ProtectedRoute component={FundingList} />
        </Route>
        <Route path="/funding/new">
          <ProtectedRoute component={FundingNew} />
        </Route>
        <Route path="/funding/my">
          <ProtectedRoute component={FundingMy} />
        </Route>
        <Route path="/funding/admin">
          <ProtectedRoute component={FundingAdmin} />
        </Route>
        <Route path="/funding/:id">
          {(params) => <ProtectedRoute component={FundingDetail} id={params.id} />}
        </Route>

        <Route path="/exchange">
          <ProtectedRoute component={ExchangePage} />
        </Route>
        <Route path="/coin-launch">
          <ProtectedRoute component={CoinLaunchPage} />
        </Route>
        <Route path="/transparency">
          <ProtectedRoute component={TransparencyReport} />
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
