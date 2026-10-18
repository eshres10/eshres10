import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider } from '@clerk/react';
import { Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { ClerkAuth } from '@/app/auth-pages';
import { AdaptiveLayout, Shell } from '@/components/shell/Shell';
import { basePath, clerkAppearance, clerkProxyUrl, clerkPubKey } from '@/lib/clerk';
import { AIStudio } from '@/pages/ai-studio';
import { Assistant } from '@/pages/assistant';
import { Landing } from '@/pages/landing';
import { Marketplace } from '@/pages/marketplace';
import { MeasurementsPage } from '@/pages/measurements';
import { FabricPage, PatternsPage, ThreadPage } from '@/pages/stash';
import { EditStashPage, NewStashPage } from '@/pages/stash-flow';
import { Studio } from '@/pages/studio';
import { ProjectsList, ProjectDetail } from '@/components/projects';
import { QuickStart } from '@/components/projects/QuickStart';
import { SignInPromptProvider } from '@/components/auth/SignInPrompt';
import { PublicMakePage } from '@/pages/public-make';
import { EditPostPage, NewPostPage } from '@/pages/post-flow';
import { TagPage } from '@/pages/tag';
import { SavedPage } from '@/pages/saved';
import { NotificationsPage } from '@/components/notifications/Notifications';
import { CatalogPage } from '@/pages/catalog';
import { ChallengesPage } from '@/pages/challenges';
import { ForumPage } from '@/pages/forum';
import { ForumTopicPage } from '@/pages/forum-topic';
import { NewTopicPage } from '@/pages/forum-flow';
import { ChallengePage } from '@/pages/challenge';
import { CatalogEntryPage } from '@/pages/catalog-entry';
import { AdminReportsPage } from '@/pages/admin-reports';
import { ExploreBrowsePage } from '@/components/explore/ExploreBrowse';
import { SearchPage } from '@/pages/search';
import { FeedPage } from '@/pages/feed';
import { PostPage } from '@/pages/post';
import { PublicProfilePage } from '@/pages/public-profile';
import { SettingsPage } from '@/pages/settings';
import { QuestionRoute, WelcomeRoute } from '@/pages/onboarding';
import { JoinPage } from '@/pages/join';
import { ReadyRoute, SettingUpRoute } from '@/pages/onboarding-finish';

const queryClient = new QueryClient();

// Signed-in pages, wrapped once at module level so navigation doesn't remount them.
const studio = (Page: React.ComponentType) => () => <Shell><Page /></Shell>;
const InShellStudio = studio(Studio);
const InShellFeedPage = studio(FeedPage);
const InShellNewPostPage = studio(NewPostPage);
const InShellSavedPage = studio(SavedPage);
const InShellNotificationsPage = studio(NotificationsPage);
const InShellAdminReports = studio(AdminReportsPage);
const InShellFabricPage = studio(FabricPage);
const InShellThreadPage = studio(ThreadPage);
const InShellPatternsPage = studio(PatternsPage);
const InShellNewStashPage = studio(NewStashPage);
const InShellProjectsList = studio(ProjectsList);
const InShellProjectDetail = studio(ProjectDetail);
const InShellQuickStart = studio(QuickStart);
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
    <Route path="/stash/new" component={InShellNewStashPage} />
    <Route path="/stash/:kind/:id/edit">{(params: { kind: string; id: string }) => <Shell><EditStashPage kind={params.kind} id={Number(params.id)} /></Shell>}</Route>
    <Route path="/patterns" component={InShellPatternsPage} />
    <Route path="/projects" component={InShellProjectsList} />
    <Route path="/projects/new" component={InShellQuickStart} />
    <Route path="/projects/:id" component={InShellProjectDetail} />
    <Route path="/measurements" component={InShellMeasurementsPage} />
    <Route path="/ai-studio" component={InShellAIStudio} />
    <Route path="/assistant" component={InShellAssistant} />
    <Route path="/marketplace" component={InShellMarketplace} />
    <Route path="/settings" component={InShellSettingsPage} />
    <Route path="/feed" component={InShellFeedPage} />
    <Route path="/new" component={InShellNewPostPage} />
    <Route path="/saved" component={InShellSavedPage} />
    <Route path="/notifications" component={InShellNotificationsPage} />
    <Route path="/admin/reports" component={InShellAdminReports} />
    <Route path="/forum">{() => <AdaptiveLayout><ForumPage /></AdaptiveLayout>}</Route>
    <Route path="/forum/new">{() => <Shell><NewTopicPage /></Shell>}</Route>
    <Route path="/forum/topics/:id">{(params: { id: string }) => <AdaptiveLayout><ForumTopicPage id={Number(params.id)} /></AdaptiveLayout>}</Route>
    <Route path="/challenges">{() => <AdaptiveLayout><ChallengesPage /></AdaptiveLayout>}</Route>
    <Route path="/challenges/:slug">{(params: { slug: string }) => <AdaptiveLayout><ChallengePage slug={params.slug} /></AdaptiveLayout>}</Route>
    <Route path="/catalog">{() => <AdaptiveLayout><CatalogPage /></AdaptiveLayout>}</Route>
    <Route path="/catalog/:kind/:slug">{(params: { kind: string; slug: string }) => <AdaptiveLayout><CatalogEntryPage kind={params.kind} slug={params.slug} /></AdaptiveLayout>}</Route>
    <Route path="/explore">{() => <AdaptiveLayout><ExploreBrowsePage /></AdaptiveLayout>}</Route>
    <Route path="/search">{() => <AdaptiveLayout><SearchPage /></AdaptiveLayout>}</Route>
    <Route path="/posts/:id/edit">{(params: { id: string }) => <Shell><EditPostPage id={Number(params.id)} /></Shell>}</Route>
    <Route path="/tags/:tag">{(params: { tag: string }) => <AdaptiveLayout><TagPage tag={decodeURIComponent(params.tag)} /></AdaptiveLayout>}</Route>
    <Route path="/posts/:id">{(params: { id: string }) => <AdaptiveLayout><PostPage id={Number(params.id)} /></AdaptiveLayout>}</Route>
    <Route path="/welcome" component={WelcomeRoute} />
    <Route path="/welcome/setup" component={SettingUpRoute} />
    <Route path="/welcome/ready" component={ReadyRoute} />
    <Route path="/welcome/:step">{(params: { step: string }) => <QuestionRoute step={Number(params.step)} />}</Route>
    <Route path="/makes/:id">{(params: { id: string }) => <PublicMakePage id={Number(params.id)} />}</Route>
    <Route path="/sign-in/*?" component={() => <ClerkAuth mode="sign-in" />} />
    <Route path="/join/*?" component={JoinPage} />
    {/* Old sign-up links (and Clerk sub-steps under /sign-up) now live at /join. */}
    <Route path="/sign-up/*?">{(params: { "*"?: string }) => <Redirect to={`/join${params["*"] ? `/${params["*"]}` : ""}${window.location.search}`} replace />}</Route>
    <Route path="/:segment" component={HandleRoute} />
    <Route>{() => <NotFound />}</Route>
  </Switch>;
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  const stripBase = (path: string) => basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/join`} localization={{ signIn: { start: { title: 'Welcome back, maker', subtitle: 'Sign in to return to your studio' } }, signUp: { start: { title: 'Create your studio', subtitle: 'A calmer place for your sewing practice' }, emailLink: { title: 'Check your inbox', subtitle: 'We sent you a link. Open it to carry on.', formTitle: 'Check your inbox', formSubtitle: 'Open the link we sent to {{identifier}} to carry on.' }, emailCode: { title: 'Check your inbox', subtitle: 'We sent a code to {{identifier}}. Enter it to carry on.' } }, unstable__errors: { form_param_format_invalid__email_address: 'Enter an email like name@example.com.' } }} routerPush={to => setLocation(stripBase(to))} routerReplace={to => setLocation(stripBase(to), { replace: true })}><SignInPromptProvider><Router /></SignInPromptProvider></ClerkProvider>;
}

function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><ErrorBoundary><ClerkRoutes /></ErrorBoundary></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>; }
export default App;
