import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider } from '@clerk/react';
import { Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { ClerkAuth } from '@/app/auth-pages';
import { Shell } from '@/components/shell/Shell';
import { basePath, clerkAppearance, clerkProxyUrl, clerkPubKey } from '@/lib/clerk';
import { AIStudio } from '@/pages/ai-studio';
import { Assistant } from '@/pages/assistant';
import { Landing } from '@/pages/landing';
import { Marketplace } from '@/pages/marketplace';
import { MeasurementsPage } from '@/pages/measurements';
import { FabricPage, PatternsPage, ThreadPage } from '@/pages/stash';
import { Studio } from '@/pages/studio';
import { ProjectsList, ProjectDetail } from '@/components/projects';
import { SignInPromptProvider } from '@/components/auth/SignInPrompt';
import { PublicProfilePage } from '@/pages/public-profile';
import { SettingsPage } from '@/pages/settings';
import { WelcomePage } from '@/pages/welcome';

const queryClient = new QueryClient();

// Signed-in pages, wrapped once at module level so navigation doesn't remount them.
const studio = (Page: React.ComponentType) => () => <Shell><Page /></Shell>;
const InShellStudio = studio(Studio);
const InShellFabricPage = studio(FabricPage);
const InShellThreadPage = studio(ThreadPage);
const InShellPatternsPage = studio(PatternsPage);
const InShellProjectsList = studio(ProjectsList);
const InShellProjectDetail = studio(ProjectDetail);
const InShellMeasurementsPage = studio(MeasurementsPage);
const InShellAIStudio = studio(AIStudio);
const InShellAssistant = studio(Assistant);
const InShellMarketplace = studio(Marketplace);
const InShellSettingsPage = studio(SettingsPage);

// Profile pages live at /@handle. wouter has no literal "@" segments, so match
// one segment and check the prefix.
function HandleRoute({ params }: { params: { segment: string } }) {
  const segment = decodeURIComponent(params.segment);
  if (!segment.startsWith('@') || segment.length < 2) return <NotFound />;
  return <PublicProfilePage handle={segment.slice(1)} />;
}

function Router() {
  return <Switch>
    <Route path="/" component={Landing} />
    <Route path="/studio" component={InShellStudio} />
    <Route path="/stash/fabrics" component={InShellFabricPage} />
    <Route path="/stash/threads" component={InShellThreadPage} />
    <Route path="/patterns" component={InShellPatternsPage} />
    <Route path="/projects" component={InShellProjectsList} />
    <Route path="/projects/:id" component={InShellProjectDetail} />
    <Route path="/measurements" component={InShellMeasurementsPage} />
    <Route path="/ai-studio" component={InShellAIStudio} />
    <Route path="/assistant" component={InShellAssistant} />
    <Route path="/marketplace" component={InShellMarketplace} />
    <Route path="/settings" component={InShellSettingsPage} />
    <Route path="/welcome" component={WelcomePage} />
    <Route path="/sign-in/*?" component={() => <ClerkAuth mode="sign-in" />} />
    <Route path="/sign-up/*?" component={() => <ClerkAuth mode="sign-up" />} />
    <Route path="/:segment" component={HandleRoute} />
    <Route component={NotFound} />
  </Switch>;
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  const stripBase = (path: string) => basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{ signIn: { start: { title: 'Welcome back, maker', subtitle: 'Sign in to return to your studio' } }, signUp: { start: { title: 'Create your studio', subtitle: 'A calmer place for your sewing practice' } } }} routerPush={to => setLocation(stripBase(to))} routerReplace={to => setLocation(stripBase(to), { replace: true })}><SignInPromptProvider><Router /></SignInPromptProvider></ClerkProvider>;
}

function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><ErrorBoundary><ClerkRoutes /></ErrorBoundary></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>; }
export default App;
