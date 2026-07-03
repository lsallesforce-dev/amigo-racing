import { lazy, Suspense } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Route, Switch } from "wouter";
import { Loader2 } from "lucide-react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import ZequinhaChat from "./components/ZequinhaChat";

// Code-splitting por rota: antes tudo (jsPDF, html2canvas, recharts, dnd-kit,
// html5-qrcode etc) ia num bundle único de 2.18MB carregado até pra abrir a
// tela de login. Cada página agora só baixa o que ela realmente usa.
const NotFound = lazy(() => import("@/pages/NotFound"));
const Home = lazy(() => import("./pages/Home"));
const EventDetails = lazy(() => import("./pages/EventDetails"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const OrganizerPanel = lazy(() => import("./pages/OrganizerPanel"));
const Registrations = lazy(() => import("./pages/Registrations"));
const BecomeOrganizer = lazy(() => import("./pages/BecomeOrganizer"));
const AdminOrganizerRequests = lazy(() => import("./pages/AdminOrganizerRequests"));
const StartOrderConfig = lazy(() => import("./pages/StartOrderConfig"));
const OrganizerFinance = lazy(() => import("./pages/OrganizerFinance"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const Login = lazy(() => import("./pages/Login"));
const CheckIn = lazy(() => import("./pages/CheckIn"));
const StartOrderManager = lazy(() => import("./pages/StartOrderManager"));
const OrganizerStore = lazy(() => import("./pages/OrganizerStore"));
const SorteoPage = lazy(() => import("./pages/SorteoPage").then(m => ({ default: m.SorteoPage })));
const Championships = lazy(() => import("./pages/Championships"));
const ChampionshipDetails = lazy(() => import("./pages/ChampionshipDetails"));
const Secretariat = lazy(() => import("./pages/Secretariat"));
const Passport = lazy(() => import("./pages/Passport"));
const ChampionshipShowcase = lazy(() => import("./pages/ChampionshipShowcase"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const UpdatePassword = lazy(() => import("./pages/UpdatePassword"));

function RouteLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/events/:id" component={EventDetails} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/organizer" component={OrganizerPanel} />
        <Route path="/organizer/finance" component={OrganizerFinance} />
        <Route path="/organizer/store" component={OrganizerStore} />
        <Route path="/organizer/events/:id/store" component={OrganizerStore} />
        <Route path="/organizer/championships" component={Championships} />
        <Route path="/organizer/championships/:id" component={ChampionshipDetails} />
        <Route path="/registrations" component={Registrations} />
        <Route path="/become-organizer" component={BecomeOrganizer} />
        <Route path="/admin" component={AdminPanel} />
        <Route path="/admin/organizer-requests" component={AdminOrganizerRequests} />
        <Route path="/check-in" component={CheckIn} />
        <Route path="/organizer/events/:id/start-order" component={StartOrderConfig} />
        <Route path="/organizer/events/:id/manage-start-order" component={StartOrderManager} />
        <Route path="/organizer/events/:id/sorteio" component={SorteoPage} />
        <Route path="/organizer/events/:id/secretariat" component={Secretariat} />
        <Route path="/passport/:accessHash" component={Passport} />
        <Route path="/championship/:id" component={ChampionshipShowcase} />
        <Route path="/login" component={Login} />
        <Route path="/auth/reset-password" component={ResetPassword} />
        <Route path="/auth/update-password" component={UpdatePassword} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider>
        <Toaster />
        <Router />
        <ZequinhaChat />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
