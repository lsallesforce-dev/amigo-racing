import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import EventDetails from "./pages/EventDetails";
import Dashboard from "./pages/Dashboard";
import OrganizerPanel from "./pages/OrganizerPanel";
import Registrations from "./pages/Registrations";
import BecomeOrganizer from "./pages/BecomeOrganizer";
import AdminOrganizerRequests from "./pages/AdminOrganizerRequests";
import StartOrderConfig from "./pages/StartOrderConfig";
import OrganizerFinance from "./pages/OrganizerFinance";
import AdminPanel from "./pages/AdminPanel";
import Login from "./pages/Login";
import CheckIn from "./pages/CheckIn";
import StartOrderManager from "./pages/StartOrderManager";
import OrganizerStore from "./pages/OrganizerStore";
import { SorteoPage } from "./pages/SorteoPage";
import Championships from "./pages/Championships";
import ChampionshipDetails from "./pages/ChampionshipDetails";
import Secretariat from "./pages/Secretariat";
import Passport from "./pages/Passport";
import ChampionshipShowcase from "./pages/ChampionshipShowcase";
import ResetPassword from "./pages/ResetPassword";
import UpdatePassword from "./pages/UpdatePassword";

function Router() {
  return (
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
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
