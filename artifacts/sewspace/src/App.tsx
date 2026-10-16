import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  getGetDashboardQueryKey, getGetProfileQueryKey, getListFabricsQueryKey,
  getListMeasurementProfilesQueryKey, getListPatternsQueryKey, getListProjectsQueryKey,
  getListThreadsQueryKey, useAnalyzePatternPdf, useAskAssistant, useCreateFabric, useCreateMeasurementProfile,
  useCreatePattern, useCreateProject, useCreateThread, useCreateVisualization, useDeleteFabric,
  useDeleteMeasurementProfile, useDeletePattern, useDeleteProject, useDeleteThread, useGetDashboard,
  useGetProfile, useGetRecommendations, useListFabrics, useListMeasurementProfiles, useListPatterns,
  useListProjects, useListThreads, useUpdateFabric, useUpdateMeasurementProfile, useUpdatePattern,
  useUpdateProfile, useUpdateProject, useUpdateThread, useRequestUploadUrl,
} from '@workspace/api-client-react';
import { ClerkProvider, SignIn, SignUp, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ArrowRight, BookOpen, ChevronRight, CircleHelp, Clapperboard, Compass, Download, FileText, FolderKanban, HelpCircle, Home, ImagePlus, Loader2, Menu, MessageCircle, MoreHorizontal, Package, Palette, Pencil, Plus, Ruler, Search, Scissors, Settings, Sparkles, Trash2, UserRound, X } from 'lucide-react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
type AnyRecord = Record<string, any>;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#b24761',
    colorForeground: '#302621',
    colorMutedForeground: '#79675c',
    colorDanger: '#9d443f',
    colorBackground: '#f7efe2',
    colorInput: '#fbf6ed',
    colorInputForeground: '#302621',
    colorNeutral: '#d4c5b0',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '0.7rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#f7efe2] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#302621] font-display',
    headerSubtitle: 'text-[#79675c]',
    socialButtonsBlockButtonText: 'text-[#302621]',
    formFieldLabel: 'text-[#655549]',
    footerActionLink: 'text-[#b24761]',
    footerActionText: 'text-[#79675c]',
    dividerText: 'text-[#79675c]',
    identityPreviewEditButton: 'text-[#b24761]',
    formFieldSuccessText: 'text-[#2e5b51]',
    alertText: 'text-[#9d443f]',
    logoBox: 'justify-center',
    logoImage: 'max-h-12',
    socialButtonsBlockButton: 'border-[#d4c5b0] bg-[#fbf6ed]',
    formButtonPrimary: 'bg-[#b24761] hover:bg-[#9d3e56]',
    formFieldInput: 'border-[#d4c5b0] bg-[#fbf6ed] text-[#302621]',
    footerAction: 'border-[#d4c5b0]',
    dividerLine: 'bg-[#d4c5b0]',
    alert: 'bg-[#f3d9d5]',
    otpCodeFieldInput: 'border-[#d4c5b0] bg-[#fbf6ed]',
    formFieldRow: 'text-[#302621]',
    main: 'bg-transparent',
  },
};

const navGroups = [
  { label: 'Studio', items: [{ href: '/studio', label: 'Overview', icon: Home }] },
  { label: 'Keep', items: [
    { href: '/stash/fabrics', label: 'Fabric stash', icon: Palette },
    { href: '/stash/threads', label: 'Thread drawer', icon: Package },
    { href: '/patterns', label: 'Pattern library', icon: BookOpen },
    { href: '/measurements', label: 'Measurements', icon: Ruler },
  ] },
  { label: 'Make', items: [
    { href: '/projects', label: 'Projects', icon: FolderKanban },
    { href: '/ai-studio', label: 'AI studio', icon: Sparkles },
    { href: '/assistant', label: 'Sewing assistant', icon: MessageCircle },
  ] },
  { label: 'Explore', items: [{ href: '/marketplace', label: 'Marketplace', icon: Compass }] },
];

function Logo({ dark = false }: { dark?: boolean }) {
  return <Link href="/" data-testid="link-logo" className={`flex items-center gap-2 ${dark ? 'text-[#f3e8d6]' : 'text-[#302621]'}`}>
    <span className="relative grid h-9 w-9 place-items-center rounded-full border border-current/25"><Scissors size={17} className="rotate-45" /><i className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-[#b24761]" /></span>
    <span className="font-display text-[1.55rem] italic tracking-[-.04em]">sewspace</span>
  </Link>;
}

function Landing() {
  const { isSignedIn } = useAuth();
  const dashboard = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey(), enabled: Boolean(isSignedIn) } });
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (isSignedIn && dashboard.data) setLocation('/studio');
  }, [dashboard.data, isSignedIn, setLocation]);
  const tools = [
    ['Stash', 'Fabrics, threads, patterns — catalogued your way.', Palette, '/stash/fabrics'],
    ['Projects', 'A gentle record of what is on your machine.', FolderKanban, '/projects'],
    ['AI studio', 'Visualize the almost-possible.', Clapperboard, '/ai-studio'],
    ['Assistant', 'A second pair of knowledgeable hands.', CircleHelp, '/assistant'],
  ] as const;
  return <main className="min-h-[100dvh] overflow-hidden bg-[#eadfcb] text-[#302621]">
     <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-5 md:px-10"><Logo /><nav className="hidden gap-8 text-sm font-semibold md:flex"><a href="#why-sewspace" data-testid="link-why-sewspace">The studio</a><a href="#tools" data-testid="link-tools">Tools</a><a href="#ritual" data-testid="link-ritual">Our approach</a></nav><div className="flex gap-2"><a href={`${basePath || ''}/sign-in`} data-testid="link-sign-in" className="btn btn-line inline-flex whitespace-nowrap">Sign in</a><a href={`${basePath || ''}/sign-up`} data-testid="link-sign-up" className="btn btn-primary whitespace-nowrap"><span className="sm:hidden">Join</span><span className="hidden sm:inline">Open your studio</span> <ArrowRight size={15} /></a></div></header>
    <section className="mx-auto grid min-h-[720px] max-w-[1440px] items-center gap-8 px-5 pb-16 pt-32 md:grid-cols-[1.05fr_.95fr] md:px-14 md:pt-24"><div className="fade-up relative z-10 max-w-[650px]"><p className="eyebrow mb-7">A digital sewing room</p><h1 className="font-display text-[clamp(4.2rem,9vw,8.6rem)] leading-[.86] tracking-[-.075em]">Make room<br /><em className="text-[#aa3f59]">for making.</em></h1><p className="mt-8 max-w-[430px] text-[1.08rem] leading-7 text-[#66554a]">Sewspace keeps the beautiful mess of your practice in one calm, tactile place — from first sketch to final stitch.</p><div className="mt-9 flex flex-wrap gap-3"><Link href="/sign-up" data-testid="link-landing-start" className="btn btn-primary px-5 py-3.5">Start with a blank canvas <ArrowRight size={16} /></Link><a href="#why-sewspace" data-testid="link-landing-explore" className="btn btn-line px-5 py-3.5">Take a look around</a></div><div className="mt-12 flex items-center gap-4 text-xs text-[#79675c]"><span className="font-mono-custom uppercase tracking-[.16em]">For curious sewists</span><span className="h-px w-12 bg-[#b9a794]" /><span>Built for the slow work</span></div></div><div className="relative mt-10 min-h-[420px] md:mt-0"><div className="absolute right-[8%] top-[8%] h-[320px] w-[260px] rotate-[7deg] rounded-[48%_52%_44%_56%] bg-[#b44760] shadow-[18px_25px_0_rgba(73,47,37,.12)]" /><div className="absolute right-[17%] top-[18%] h-[320px] w-[260px] -rotate-[13deg] rounded-[46%_54%_51%_49%] border-[14px] border-[#d2b897] bg-[#d8c1a1] shadow-[12px_18px_0_rgba(73,47,37,.08)]"><div className="absolute inset-4 rounded-[45%] border border-dashed border-[#806650]/40" /><span className="absolute bottom-16 left-8 font-mono-custom text-[.6rem] uppercase tracking-[.22em] text-[#76614d]">linen / 02</span></div><div className="absolute bottom-[2%] right-[28%] h-[190px] w-[140px] rotate-[24deg] rounded-[16px] bg-[#2e5b51] shadow-[10px_16px_0_rgba(73,47,37,.11)]"><div className="absolute inset-4 border border-[#d5c9ac]/50" /></div><div className="absolute bottom-[12%] right-[2%] grid h-24 w-24 rotate-[-8deg] place-items-center rounded-full border border-[#9e866c] bg-[#eadfcb] font-display text-center text-sm italic text-[#695547]">the<br />stash</div><span className="absolute left-[3%] top-[4%] font-mono-custom text-[.62rem] uppercase tracking-[.2em] text-[#806d60]">01 / gather</span></div></section>
    <section id="why-sewspace" className="border-y border-[#cdbda8] bg-[#f0e7d7] px-5 py-24 md:px-14"><div className="mx-auto grid max-w-[1280px] gap-12 md:grid-cols-[.75fr_1.25fr]"><div><p className="eyebrow">A place for your practice</p><h2 className="mt-4 max-w-[370px] font-display text-5xl leading-[.95] tracking-[-.06em]">Your ideas deserve a home.</h2></div><div className="grid gap-8 border-l border-[#cdbda8] pl-7 md:grid-cols-3 md:pl-10">{[['01', 'Remember everything', 'Log the small details you will thank yourself for later: yardage, alterations, the exact thread that worked.'], ['02', 'See what is possible', 'Pair patterns with the fabrics already waiting in your stash. A little serendipity goes a long way.'], ['03', 'Keep the thread going', 'Projects in progress, next steps, notes from last time. Pick up exactly where you left off.']].map(([n, title, copy]) => <div key={n}><span className="font-mono-custom text-xs text-[#b24761]">{n}</span><h3 className="mt-5 font-display text-2xl">{title}</h3><p className="mt-3 text-sm leading-6 text-[#705f54]">{copy}</p></div>)}</div></div></section>
    <section id="tools" className="bg-[#2e5b51] px-5 py-24 text-[#f3e8d6] md:px-14"><div className="mx-auto max-w-[1280px]"><div className="flex flex-wrap items-end justify-between gap-8"><div><p className="eyebrow !text-[#e0ad75]">The workbench</p><h2 className="mt-4 font-display text-5xl leading-none tracking-[-.06em]">Everything within reach.</h2></div><p className="max-w-[300px] text-sm leading-6 text-[#c4d0c5]">Thoughtful tools for the practical bits, so you have more attention for the good bits.</p></div><div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-[#779087]/40 bg-[#779087]/30 md:grid-cols-4">{tools.map(([title, copy, Icon, href]) => <Link href={href} key={title} data-testid={`link-tool-${title}`} className="group bg-[#2e5b51] p-7 hover:bg-[#386b60]"><Icon size={20} strokeWidth={1.5} className="text-[#e0ad75]" /><h3 className="mt-16 font-display text-2xl">{title}</h3><p className="mt-2 text-sm leading-6 text-[#c4d0c5]">{copy}</p><ArrowRight size={16} className="mt-6 transition-transform group-hover:translate-x-1" /></Link>)}</div></div></section>
    <section id="ritual" className="bg-[#d8bfa0] px-5 py-24 md:px-14"><div className="mx-auto grid max-w-[1180px] items-center gap-12 md:grid-cols-[.7fr_1.3fr]"><div className="relative h-72"><div className="absolute left-10 top-5 h-56 w-56 rounded-full border-[12px] border-[#aa3f59] bg-[#e9d6bd]" /><div className="absolute left-24 top-20 h-32 w-32 rounded-full border border-dashed border-[#2e5b51] rotate-12" /><span className="absolute bottom-4 left-0 font-mono-custom text-xs uppercase tracking-[.2em] text-[#725844]">measure twice / make once</span></div><div><p className="eyebrow !text-[#2e5b51]">A softer system</p><h2 className="mt-4 font-display text-5xl leading-[.92] tracking-[-.06em]">The ritual is the point.</h2><p className="mt-6 max-w-lg text-lg leading-8 text-[#624e42]">Sewspace is designed to feel like opening your favorite drawer: familiar, useful, and full of possibility.</p><Link href="/sign-up" data-testid="link-ritual-cta" className="btn btn-primary mt-8">Make it yours <ArrowRight size={16} /></Link></div></div></section>
    <footer className="flex flex-wrap items-center justify-between gap-5 bg-[#eadfcb] px-5 py-7 text-xs text-[#79675c] md:px-14"><Logo /><span>Made for the hands that make.</span><span className="font-mono-custom uppercase tracking-[.12em]">sewspace / 2025</span></footer>
  </main>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const [mobile, setMobile] = useState(false); const [location] = useLocation();
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => { setMobile(false); }, [location]);
  if (!isLoaded) return <Loading />;
  if (!isSignedIn) return <Redirect to="/" />;
  return <div className="paper-grain min-h-[100dvh] bg-background"><aside className={`fixed inset-y-0 left-0 z-40 flex w-[280px] max-w-[85vw] flex-col border-r border-[#d4c5b0] bg-[#e6dac7] transition-transform md:translate-x-0 ${mobile ? 'translate-x-0' : '-translate-x-full'}`}><div className="flex flex-1 flex-col overflow-y-auto px-5 py-6 pb-6"><div className="flex items-center justify-between"><Logo /><button onClick={() => setMobile(false)} data-testid="button-close-menu" className="grid h-11 w-11 place-items-center md:hidden" aria-label="Close menu"><X size={20} /></button></div><div className="mt-10 space-y-7">{navGroups.map(group => <div key={group.label}><p className="eyebrow mb-2 px-3 !text-[#887566]">{group.label}</p><nav>{group.items.map(item => { const Icon = item.icon; const active = location === item.href; return <Link href={item.href} key={item.href} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`} className={`flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2.5 text-[.83rem] font-semibold ${active ? 'bg-[#b24761] text-[#f9eddd]' : 'text-[#655549] hover:bg-[#d9cbb7]'}`}><Icon size={16} /><span>{item.label}</span>{active && <ChevronRight size={14} className="ml-auto" />}</Link>; })}</nav></div>)}</div></div><div className="border-t border-[#ccbba5] bg-[#e6dac7] px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"><Link href="/measurements" data-testid="link-settings" className="flex min-h-[44px] items-center gap-3 px-3 py-2 text-xs font-semibold text-[#655549]"><Settings size={15} /> Profile & preferences</Link><Link href="/sign-in" data-testid="link-shell-sign-in" className="mt-1 flex min-h-[44px] items-center gap-3 px-3 py-2 text-xs text-[#887566]"><UserRound size={15} /> Sign in / switch maker</Link></div></aside>{mobile && <button aria-label="Close navigation" onClick={() => setMobile(false)} data-testid="button-nav-overlay" className="fixed inset-0 z-30 bg-[#2f241f]/30 md:hidden" />}<div className="md:pl-[280px]"><header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#ded0bd] bg-[#f0e7d7]/90 px-4 pl-3 backdrop-blur md:px-10"><button onClick={() => setMobile(true)} data-testid="button-open-menu" className="grid h-11 w-11 place-items-center md:hidden" aria-label="Open menu"><Menu size={21} /></button><div className="ml-2 text-sm font-semibold text-[#302621] md:ml-0 md:font-normal md:text-[#79675c]">{navGroups.flatMap(g => g.items).find(i => i.href === location)?.label || 'Sewspace'}</div><div className="ml-auto flex items-center gap-3"><Link href="/assistant" data-testid="link-header-assistant" className="hidden items-center gap-2 text-xs font-semibold text-[#655549] sm:flex"><MessageCircle size={16} /> Ask the studio</Link><span className="grid h-8 w-8 place-items-center rounded-full bg-[#2e5b51] font-display text-sm text-[#f3e8d6]">M</span></div></header><main className="mx-auto max-w-[1440px] px-4 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] md:px-10 md:py-10">{children}</main></div></div>;
}

function Loading() { return <div className="space-y-4" data-testid="state-loading"><div className="h-8 w-56 animate-pulse rounded bg-muted" /><div className="grid gap-4 md:grid-cols-3"><div className="h-32 animate-pulse rounded-lg bg-muted" /><div className="h-32 animate-pulse rounded-lg bg-muted" /><div className="h-32 animate-pulse rounded-lg bg-muted" /></div></div>; }
function ErrorState({ retry }: { retry: () => void }) { return <div className="studio-card rounded-xl px-5 py-20 text-center" data-testid="state-error"><HelpCircle className="mx-auto text-[#9d443f]" /><h2 className="mt-4 font-display text-2xl">The drawer is stuck</h2><p className="mt-2 text-sm text-muted-foreground">We could not reach your studio right now.</p><button onClick={retry} data-testid="button-retry" className="btn btn-primary mt-5 min-h-[44px]">Try again</button></div>; }
function Heading({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action?: React.ReactNode }) { return <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between md:gap-5"><div><p className="eyebrow">{eyebrow}</p><h1 className="mt-2 font-display text-4xl leading-[1.1] tracking-[-.06em] md:text-5xl md:leading-none">{title}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#79675c]">{copy}</p></div>{action && <div className="mt-2 md:mt-0">{action}</div>}</div>; }
function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#2f241f]/40 sm:items-center sm:p-4"><div className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-[#d4c5b0] bg-[#f7efe2] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-8px_40px_rgba(44,30,21,.12)] sm:rounded-xl sm:p-6 sm:shadow-[0_24px_80px_rgba(44,30,21,.22)]"><div className="mb-5 flex items-center justify-between sm:mb-6"><h2 className="font-display text-2xl sm:text-3xl">{title}</h2><button onClick={close} data-testid="button-close-dialog" className="grid h-11 w-11 place-items-center rounded-full hover:bg-[#e7d9c5]" aria-label="Close"><X size={20} /></button></div>{children}</div></div>; }
type Field = { key: string; label: string; type?: string; options?: string[]; accept?: string; fileNameKey?: string; attachedLabel?: string };
const REQUIRED_FIELD_KEYS = new Set(['name', 'type', 'color', 'brand', 'colorName', 'garmentType', 'difficulty']);

function Fields({ fields, value, change, upload, uploading, uploadStatus, activeUploadField }: { fields: Field[]; value: AnyRecord; change: (v: AnyRecord) => void; upload?: (file: File, key: string, fileNameKey?: string) => void; uploading?: boolean; uploadStatus?: string; activeUploadField?: string }) {
  return <div className="grid gap-4 sm:grid-cols-2">{fields.map(f => {
    const isRequired = REQUIRED_FIELD_KEYS.has(f.key);
    const inputProps = { 'aria-required': isRequired || undefined, 'data-testid': `input-${f.key}` };
    return <label key={f.key} className={f.type === 'textarea' || f.type === 'file' ? 'sm:col-span-2' : ''}>
      <span className="mb-1.5 block text-xs font-semibold text-[#655549]">
        {f.label}{isRequired && <span className="ml-1 text-[#9d443f]" aria-hidden="true">*</span>}
      </span>
      {f.type === 'file' ? <>
        <input type="file" accept={f.accept || 'image/*'} disabled={uploading} onChange={e => { const file = e.target.files?.[0]; if (file && upload) upload(file, f.key, f.fileNameKey); }} {...inputProps} className="field file:mr-3 file:rounded file:border-0 file:bg-[#e7d9c5] file:px-3 file:py-1.5 file:text-xs" />
        {uploading && activeUploadField === f.key && <span className="mt-1 flex items-center gap-1.5 text-xs text-[#b24761]"><Loader2 size={12} className="animate-spin" />{uploadStatus || 'Uploading to your private studio…'}</span>}
        {!uploading && uploadStatus && activeUploadField === f.key && <span className={`mt-1 block text-xs ${uploadStatus.startsWith('Could not') ? 'text-[#9d443f]' : 'text-[#2e5b51]'}`}>{uploadStatus}</span>}
        {value[f.key] && <span className="mt-1 block truncate text-xs text-[#2e5b51]">{f.attachedLabel || 'File attached'}{f.fileNameKey && value[f.fileNameKey] ? ` · ${value[f.fileNameKey]}` : ''}</span>}
      </> : f.type === 'textarea' ?
        <textarea rows={3} value={value[f.key] ?? ''} onChange={e => change({ ...value, [f.key]: e.target.value })} {...inputProps} className="field resize-none" /> :
        f.options ?
          <select value={value[f.key] ?? f.options[0]} onChange={e => change({ ...value, [f.key]: e.target.value })} {...inputProps} className="field">{f.options.map(o => <option value={o} key={o}>{o.replaceAll('_', ' ')}</option>)}</select> :
          <input type={f.type || 'text'} value={value[f.key] ?? ''} onChange={e => change({ ...value, [f.key]: e.target.value })} {...inputProps} className="field" />}
    </label>;
  })}</div>;
}

function Resource({ kind, useQuery, fields, title, meta, extra, create, update, remove, keyFor }: { kind: string; useQuery: (s: string) => any; fields: Field[]; title: (x: AnyRecord) => string; meta: (x: AnyRecord) => string; extra?: (x: AnyRecord) => React.ReactNode; create: any; update: any; remove: any; keyFor: (s: string) => readonly unknown[] }) {
  const [search, setSearch] = useState(''); const [edit, setEdit] = useState<AnyRecord | null>(null); const [open, setOpen] = useState(false); const [menuId, setMenuId] = useState<number | null>(null); const [form, setForm] = useState<AnyRecord>({}); const [uploadingFile, setUploadingFile] = useState(false); const [saveWhenReady, setSaveWhenReady] = useState(false); const [uploadStatus, setUploadStatus] = useState(''); const [activeUploadField, setActiveUploadField] = useState(''); const q = useQuery(search); const client = useQueryClient(); const key = keyFor(search); const upload = useRequestUploadUrl(); const analyzePdf = useAnalyzePatternPdf();
  const uploadFile = async (file: File, fieldKey: string, fileNameKey?: string) => {
    const isPdf = fieldKey === 'pdfUrl';
    if (isPdf && (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf'))) {
      setUploadStatus('Could not upload: choose a valid PDF file.');
      return;
    }
    setActiveUploadField(fieldKey);
    setUploadingFile(true);
    setUploadStatus('Uploading to your private studio…');
    try {
      const result = await upload.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type } });
      const uploaded = await fetch(result.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!uploaded.ok) throw new Error('The storage upload did not complete');
      const storedUrl = `/api/storage/objects/${result.objectPath.replace(/^\/objects\//, '')}`;
      setForm(current => ({ ...current, [fieldKey]: storedUrl, ...(fileNameKey ? { [fileNameKey]: file.name } : {}) }));

      if (isPdf) {
        setUploadStatus('PDF uploaded. AI is reading the pattern details…');
        try {
          const details = await analyzePdf.mutateAsync({ data: { pdfUrl: storedUrl } });
          setForm(current => {
            const prefilled = { ...current };
            Object.entries(details).forEach(([detailKey, detailValue]) => {
              if ((prefilled[detailKey] == null || prefilled[detailKey] === '') && detailValue != null && detailValue !== '') {
                prefilled[detailKey] = detailValue;
              }
            });
            return prefilled;
          });
          setUploadStatus('PDF uploaded and available details were filled in. Review them before saving.');
        } catch {
          setUploadStatus('PDF uploaded, but AI could not read its details. You can still complete and save the form.');
        }
      } else {
        setUploadStatus('Upload complete.');
      }
    } catch (error) {
      setUploadStatus(`Could not upload: ${error instanceof Error ? error.message : 'please try again.'}`);
    } finally {
      setUploadingFile(false);
    }
  };
  const persistForm = () => {
    const payload = { ...form };
    fields.forEach(field => {
      if (field.options && (payload[field.key] == null || payload[field.key] === '')) {
        payload[field.key] = field.options[0];
      }
    });
    const missingFields = fields.filter(field =>
      REQUIRED_FIELD_KEYS.has(field.key) &&
      (payload[field.key] == null || String(payload[field.key]).trim() === '')
    );
    if (missingFields.length) {
      const labels = missingFields.map(field => field.label);
      window.alert(`Please complete the required ${labels.length === 1 ? 'field' : 'fields'}:\n\n${labels.map(label => `• ${label}`).join('\n')}`);
      document.querySelector<HTMLElement>(`[data-testid="input-${missingFields[0].key}"]`)?.focus();
      return;
    }
    Object.keys(payload).forEach(k => {
      if (payload[k] === '') payload[k] = null;
      if (['width', 'quantity', 'yardage', 'progress'].includes(k) && payload[k] !== null) payload[k] = Number(payload[k]);
      if (k === 'measurements' && typeof payload[k] === 'string') {
        try { payload[k] = JSON.parse(payload[k]); } catch { payload[k] = {}; }
      }
    });
    const done = () => {
      client.invalidateQueries({ queryKey: key });
      setOpen(false);
    };
    const failed = (error: unknown) => {
      setActiveUploadField(current => current || fields.find(field => field.type === 'file')?.key || '');
      setUploadStatus(`Could not save entry: ${error instanceof Error ? error.message : 'please check the form and try again.'}`);
    };
    if (edit) update.mutate({ id: edit.id, data: payload }, { onSuccess: done, onError: failed });
    else create.mutate({ data: payload }, { onSuccess: done, onError: failed });
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadingFile) {
      setSaveWhenReady(true);
      setUploadStatus('Upload in progress. This entry will save automatically when ready.');
      return;
    }
    persistForm();
  };
  useEffect(() => {
    if (!uploadingFile && saveWhenReady) {
      setSaveWhenReady(false);
      persistForm();
    }
  }, [uploadingFile, saveWhenReady]);
  const del = (id: number) => { if (window.confirm('Remove this from your studio?')) remove.mutate({ id }, { onSuccess: () => client.invalidateQueries({ queryKey: key }) }); };
  const add = () => { setEdit(null); setForm({}); setSaveWhenReady(false); setUploadStatus(''); setOpen(true); };
  const downloadDetails = (item: AnyRecord) => {
    const omitted = new Set(['id', 'userId', 'isDemo', 'createdAt', 'updatedAt', 'imageUrl', 'coverImageUrl', 'pdfUrl']);
    const details = Object.entries(item).filter(([key, value]) => !omitted.has(key) && value != null && value !== '').map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase())}: ${typeof value === 'object' ? JSON.stringify(value) : value}`).join('\n');
    const url = URL.createObjectURL(new Blob([`${title(item)}\n${'='.repeat(title(item).length)}\n\n${details}\n`], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title(item).toLowerCase().replace(/[^a-z0-9]+/g, '-') || kind.toLowerCase().replace(/\s+/g, '-')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setMenuId(null);
  };
  const openEdit = (item: AnyRecord) => { setEdit(item); setForm(item); setOpen(true); setMenuId(null); };
  return <><Heading eyebrow={kind === 'Fabric stash' ? 'The stash' : 'The library'} title={kind} copy={`Keep the details close. Your ${kind.toLowerCase()} are always one search away.`} action={<button onClick={add} data-testid={`button-add-${kind}`} className="btn btn-primary min-h-[44px] w-full md:w-auto"><Plus size={16} /> Add entry</button>} /><div className="mb-6 flex items-center gap-3"><div className="relative w-full max-w-sm flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#907c6d]" /><input value={search} onChange={e => setSearch(e.target.value)} data-testid={`input-search-${kind}`} placeholder={`Search ${kind.toLowerCase()}…`} className="field pl-9 min-h-[44px]" /></div><span className="font-mono-custom text-xs text-[#887566] hidden sm:inline">{(q.data || []).length} found</span></div>{q.isLoading ? <Loading /> : q.isError ? <ErrorState retry={() => q.refetch()} /> : (q.data || []).length === 0 ? <div className="studio-card rounded-xl px-5 py-20 text-center" data-testid="state-empty"><Plus className="mx-auto text-[#b24761]" /><h2 className="mt-5 font-display text-2xl">A little room to fill</h2><p className="mt-2 text-sm text-muted-foreground">Your {kind.toLowerCase()} is waiting for its first entry.</p><button onClick={add} data-testid="button-empty-add" className="btn btn-primary mt-5 min-h-[44px]"><Plus size={15} /> Add entry</button></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{(q.data || []).map((item: AnyRecord, i: number) => <article key={item.id} data-testid={`card-${kind}-${item.id}`} className="studio-card group overflow-visible rounded-xl"><div className={`relative h-40 overflow-hidden rounded-t-xl ${kind === 'Fabric stash' ? 'bg-[#d7a36b]' : 'bg-[#d6c3a5]'}`}>{item.imageUrl || item.coverImageUrl ? <img src={item.imageUrl || item.coverImageUrl} alt={title(item)} className="h-full w-full object-cover" /> : item.pdfUrl ? <><iframe src={`${item.pdfUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`} title={`${title(item)} PDF preview`} loading="lazy" tabIndex={-1} className="pointer-events-none h-[220%] w-full -translate-y-2 border-0 bg-white" data-testid={`thumbnail-pattern-pdf-${item.id}`} /><span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-[#2e5b51]/90 px-2 py-1 font-mono-custom text-[.55rem] uppercase text-[#f3e8d6]"><FileText size={11} /> PDF preview</span></> : <div className={`h-full w-full opacity-70 ${i % 3 === 0 ? 'bg-[repeating-linear-gradient(45deg,#e7bd85_0_3px,transparent_3px_12px)]' : i % 3 === 1 ? 'bg-[radial-gradient(#2e5b51_1.5px,transparent 1.5px)] [background-size:14px_14px]' : 'bg-[repeating-linear-gradient(0deg,#aa3f59_0_2px,transparent_2px_9px)]'}`} />}<span className="absolute left-3 top-3 rounded-full bg-[#f7efe2]/90 px-2 py-1 font-mono-custom text-[.6rem] uppercase text-[#655549]">{item.isDemo ? 'Studio sample' : kind}</span></div><div className="p-4"><div className="flex justify-between gap-3"><div><h3 className="font-display text-[1.45rem] leading-tight">{title(item)}</h3><p className="mt-1 text-xs text-muted-foreground">{meta(item)}</p></div><div className="relative"><button onClick={() => setMenuId(current => current === item.id ? null : item.id)} data-testid={`button-card-menu-${item.id}`} aria-label={`More options for ${title(item)}`} aria-expanded={menuId === item.id} className="grid h-11 w-11 place-items-center rounded-full text-[#8b7565] hover:bg-[#e7dccb] md:h-8 md:w-8"><MoreHorizontal size={18} /></button>{menuId === item.id && <div className="absolute right-0 top-10 z-20 w-48 overflow-hidden rounded-lg border border-[#d4c5b0] bg-[#f7efe2] py-1 shadow-xl md:w-44 md:top-9"><button onClick={() => openEdit(item)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold hover:bg-[#e7dccb] md:gap-2 md:px-3 md:py-2 md:text-xs"><Pencil size={16} className="md:w-3.5 md:h-3.5" /> Edit entry</button>{item.imageUrl && <a href={item.imageUrl} download={`${title(item)}-photo`} onClick={() => setMenuId(null)} className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold hover:bg-[#e7dccb] md:gap-2 md:px-3 md:py-2 md:text-xs"><Download size={16} className="md:w-3.5 md:h-3.5" /> Download photo</a>}<button onClick={() => downloadDetails(item)} data-testid={`button-download-details-${item.id}`} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold hover:bg-[#e7dccb] md:gap-2 md:px-3 md:py-2 md:text-xs"><FileText size={16} className="md:w-3.5 md:h-3.5" /> Download details</button><button onClick={() => { setMenuId(null); del(item.id); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-[#9d443f] hover:bg-[#ead7cf] md:gap-2 md:px-3 md:py-2 md:text-xs"><Trash2 size={16} className="md:w-3.5 md:h-3.5" /> Delete entry</button></div>}</div></div>{extra?.(item)}</div></article>)}</div>}{open && <Modal title={edit ? `Edit ${kind.replace(/s$/, '').toLowerCase()}` : `Add to ${kind.toLowerCase()}`} close={() => setOpen(false)}><form onSubmit={save} className="flex flex-col h-full"><div className="flex-1"><Fields fields={fields} value={form} change={setForm} upload={uploadFile} uploading={uploadingFile} uploadStatus={uploadStatus} activeUploadField={activeUploadField} /></div><div className="sticky bottom-0 -mx-5 -mb-5 bg-[#f7efe2]/95 px-5 py-5 backdrop-blur sm:static sm:mx-0 sm:mb-0 sm:bg-transparent sm:px-0 sm:py-0 border-t border-[#d4c5b0] sm:border-none pt-4 sm:pt-6 mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end z-10"><button type="button" onClick={() => setOpen(false)} data-testid="button-cancel-form" className="btn btn-line min-h-[44px]">Cancel</button><button type="submit" data-testid="button-save-form" className="btn btn-primary min-h-[44px]" disabled={create.isPending || update.isPending}>{(create.isPending || update.isPending || uploadingFile) && <Loader2 size={15} className="animate-spin" />}{uploadingFile ? (saveWhenReady ? 'Saving when ready…' : 'Save when ready') : 'Save entry'}</button></div></form></Modal>}</>;

}

function FabricPage() { return <Resource kind="Fabric stash" useQuery={s => useListFabrics(s ? { search: s } : undefined)} create={useCreateFabric()} update={useUpdateFabric()} remove={useDeleteFabric()} keyFor={s => getListFabricsQueryKey(s ? { search: s } : undefined)} fields={[{ key: 'name', label: 'Name' }, { key: 'type', label: 'Type', options: ['linen', 'cotton', 'denim', 'silk', 'knit', 'wool', 'other'] }, { key: 'color', label: 'Color' }, { key: 'quantity', label: 'Quantity', type: 'number' }, { key: 'unit', label: 'Unit', options: ['yards', 'meters'] }, { key: 'composition', label: 'Composition' }, { key: 'stretch', label: 'Stretch' }, { key: 'weight', label: 'Weight' }, { key: 'imageUrl', label: 'Image file', type: 'file' }, { key: 'notes', label: 'Notes', type: 'textarea' }]} title={x => x.name} meta={x => `${x.type} · ${x.color} · ${x.quantity || '—'} ${x.unit || ''}`} extra={x => <p className="mt-4 text-xs text-muted-foreground">{x.composition || x.notes || 'A beautiful piece waiting in the stash.'}</p>} />; }
function ThreadPage() { return <Resource kind="Thread drawer" useQuery={s => useListThreads(s ? { search: s } : undefined)} create={useCreateThread()} update={useUpdateThread()} remove={useDeleteThread()} keyFor={s => getListThreadsQueryKey(s ? { search: s } : undefined)} fields={[{ key: 'brand', label: 'Brand' }, { key: 'colorName', label: 'Color name' }, { key: 'color', label: 'Color / hex' }, { key: 'type', label: 'Type', options: ['all-purpose', 'topstitch', 'embroidery', 'serger', 'other'] }, { key: 'weight', label: 'Weight' }, { key: 'quantity', label: 'Quantity', type: 'number' }, { key: 'imageUrl', label: 'Image URL' }, { key: 'notes', label: 'Notes', type: 'textarea' }]} title={x => x.colorName || x.color} meta={x => `${x.brand} · ${x.type} · ${x.quantity || '—'} on hand`} extra={x => <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><span className="h-3 w-3 rounded-full border" style={{ backgroundColor: x.color }} />{x.notes || 'Ready for the next seam.'}</div>} />; }
function PatternsPage() { return <Resource kind="Pattern library" useQuery={s => useListPatterns(s ? { search: s } : undefined)} create={useCreatePattern()} update={useUpdatePattern()} remove={useDeletePattern()} keyFor={s => getListPatternsQueryKey(s ? { search: s } : undefined)} fields={[{ key: 'name', label: 'Pattern name' }, { key: 'designer', label: 'Designer' }, { key: 'garmentType', label: 'Garment type' }, { key: 'difficulty', label: 'Difficulty', options: ['beginner', 'intermediate', 'advanced'] }, { key: 'sizes', label: 'Sizes' }, { key: 'yardage', label: 'Yardage', type: 'number' }, { key: 'status', label: 'Status', options: ['want_to_make', 'purchased', 'made', 'favorite'] }, { key: 'coverImageUrl', label: 'Cover image file', type: 'file', attachedLabel: 'Cover image attached' }, { key: 'pdfUrl', label: 'Digital pattern PDF', type: 'file', accept: 'application/pdf,.pdf', fileNameKey: 'pdfFileName', attachedLabel: 'Pattern PDF attached' }, { key: 'notes', label: 'Notes', type: 'textarea' }]} title={x => x.name} meta={x => `${x.designer || 'Independent'} · ${x.garmentType} · ${String(x.status || 'want_to_make').replaceAll('_', ' ')}`} extra={x => <div className="mt-4 flex flex-wrap items-center gap-2"><span className="inline-flex rounded-full bg-[#e8d4a7] px-2.5 py-1 font-mono-custom text-[.6rem] uppercase">{x.difficulty}</span>{x.pdfUrl && <a href={x.pdfUrl} download={x.pdfFileName || `${x.name}.pdf`} data-testid={`link-download-pattern-${x.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-[#cdbba5] px-2.5 py-1 text-xs font-semibold text-[#2e5b51] hover:bg-[#e7dccb]"><Download size={13} /> Download PDF</a>}</div>} />; }
const measurementFields = [
  ['bust', 'Bust'], ['neck', 'Neck'], ['rise', 'Rise'], ['waist', 'Waist'], ['wrist', 'Wrist'],
  ['height', 'Height'], ['inseam', 'Inseam'], ['fullHip', 'Full hip'], ['highHip', 'High hip'],
  ['upperArm', 'Upper arm'], ['armLength', 'Arm length'], ['underbust', 'Underbust'],
  ['backLength', 'Back length'], ['frontLength', 'Front length'], ['shoulderWidth', 'Shoulder width'],
] as const;

function MeasurementsPage() {
  const q = useListMeasurementProfiles();
  const profile = useGetProfile();
  const create = useCreateMeasurementProfile();
  const update = useUpdateMeasurementProfile();
  const remove = useDeleteMeasurementProfile();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AnyRecord | null>(null);
  const [form, setForm] = useState<AnyRecord>({ measurements: {} });
  const unit = profile.data?.units === 'imperial' ? 'in' : 'cm';

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', recordedAt: new Date().toISOString().slice(0, 10), notes: '', measurements: {} });
    setOpen(true);
  };
  const openEdit = (item: AnyRecord) => {
    setEditing(item);
    setForm({ ...item, measurements: { ...(item.measurements || {}) } });
    setOpen(true);
  };
  const refresh = () => {
    client.invalidateQueries({ queryKey: getListMeasurementProfilesQueryKey() });
    setOpen(false);
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = { name: form.name, recordedAt: form.recordedAt, notes: form.notes || null, measurements: form.measurements || {} };
    if (editing) update.mutate({ id: editing.id, data: payload }, { onSuccess: refresh });
    else create.mutate({ data: payload }, { onSuccess: refresh });
  };
  const deleteProfile = (id: number) => {
    if (window.confirm('Remove this measurement profile?')) {
      remove.mutate({ id }, { onSuccess: () => client.invalidateQueries({ queryKey: getListMeasurementProfilesQueryKey() }) });
    }
  };

  return <>
    <Heading eyebrow="Fit / body record" title="Measurements" copy={`Record each measurement separately in ${unit}. Clear labels make profiles easier to update and compare.`} action={<button onClick={openNew} className="btn btn-primary min-h-[44px] w-full md:w-auto" data-testid="button-add-measurements"><Plus size={16} /> Add profile</button>} />
    {q.isLoading ? <Loading /> : q.isError ? <ErrorState retry={() => q.refetch()} /> : !(q.data || []).length ? <div className="studio-card rounded-xl px-5 py-20 text-center"><Ruler className="mx-auto text-[#b24761]" /><h2 className="mt-5 font-display text-2xl">Start with your measurements</h2><p className="mt-2 text-sm text-muted-foreground">A structured profile makes fitting and pattern adjustments easier.</p><button onClick={openNew} className="btn btn-primary mt-5 min-h-[44px]">Add measurements</button></div> :
      <div className="grid gap-5 xl:grid-cols-2">{(q.data || []).map(item => <article key={item.id} className="studio-card rounded-xl p-5" data-testid={`card-measurements-${item.id}`}><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Recorded {item.recordedAt}</p><h2 className="mt-2 font-display text-2xl">{item.name}</h2></div><div className="flex gap-2"><button onClick={() => openEdit(item)} className="grid h-11 w-11 sm:h-8 sm:w-8 place-items-center rounded-full bg-[#e7dccb]" aria-label={`Edit ${item.name}`}><Pencil size={16} className="sm:w-3.5 sm:h-3.5" /></button><button onClick={() => deleteProfile(item.id)} className="grid h-11 w-11 sm:h-8 sm:w-8 place-items-center rounded-full bg-[#e7dccb] text-[#9d443f]" aria-label={`Delete ${item.name}`}><Trash2 size={16} className="sm:w-3.5 sm:h-3.5" /></button></div></div><dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">{measurementFields.map(([key, label]) => <div key={key} className="border-t border-[#dfd1be] pt-2"><dt className="text-[.68rem] font-semibold text-muted-foreground">{label}</dt><dd className="mt-1 font-mono-custom text-sm">{item.measurements[key] ?? '—'}{item.measurements[key] != null && <span className="ml-1 text-[.62rem] text-muted-foreground">{unit}</span>}</dd></div>)}</dl>{item.notes && <p className="mt-5 text-sm leading-6 text-muted-foreground">{item.notes}</p>}</article>)}</div>}
    {open && <Modal title={editing ? 'Update measurements' : 'Add measurements'} close={() => setOpen(false)}><form onSubmit={save}><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-semibold">Profile name</span><input required value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="field" data-testid="input-measurement-name" /></label><label><span className="mb-1.5 block text-xs font-semibold">Recorded on</span><input required type="date" value={form.recordedAt || ''} onChange={e => setForm({ ...form, recordedAt: e.target.value })} className="field" data-testid="input-measurement-date" /></label></div><div className="my-6 flex items-center gap-3"><span className="h-px flex-1 bg-[#dfd1be]" /><span className="font-mono-custom text-[.65rem] uppercase tracking-[.14em] text-muted-foreground">Body measurements · {unit}</span><span className="h-px flex-1 bg-[#dfd1be]" /></div><div className="grid gap-4 sm:grid-cols-2">{measurementFields.map(([key, label]) => <label key={key}><span className="mb-1.5 block text-xs font-semibold">{label}</span><div className="relative"><input type="number" min="0" step="0.1" value={form.measurements?.[key] ?? ''} onChange={e => setForm({ ...form, measurements: { ...(form.measurements || {}), [key]: e.target.value === '' ? undefined : Number(e.target.value) } })} className="field pr-10" data-testid={`input-measurement-${key}`} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span></div></label>)}</div><label className="mt-5 block"><span className="mb-1.5 block text-xs font-semibold">Notes</span><textarea rows={3} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} className="field resize-none" /></label><div className="sticky bottom-0 -mx-5 -mb-5 bg-[#f7efe2]/95 px-5 py-5 backdrop-blur sm:static sm:mx-0 sm:mb-0 sm:bg-transparent sm:px-0 sm:py-0 border-t border-[#d4c5b0] sm:border-none pt-4 sm:pt-6 mt-8 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 z-10"><button type="button" onClick={() => setOpen(false)} className="btn btn-line min-h-[44px]">Cancel</button><button type="submit" disabled={create.isPending || update.isPending} className="btn btn-primary min-h-[44px]">{(create.isPending || update.isPending) && <Loader2 size={15} className="animate-spin" />} Save measurements</button></div></form></Modal>}
  </>;
}

function Recent({ title, items, href }: { title: string; items: AnyRecord[]; href: string }) { return <section className="studio-card rounded-xl p-6"><div className="flex justify-between"><h2 className="font-display text-2xl">{title}</h2><Link href={href} data-testid={`link-see-${title}`} className="text-xs font-bold text-[#b24761]">See all <ArrowRight size={14} className="inline" /></Link></div>{items.length ? <div className="mt-5 space-y-3">{items.slice(0, 3).map(x => <div key={x.id} data-testid={`row-recent-${x.id}`} className="flex items-center gap-3 border-t border-[#dfd1be] pt-3"><div className="h-10 w-10 rounded-md bg-[#d7a36b]" /><div><p className="text-sm font-semibold">{x.name || x.colorName}</p><p className="text-xs text-muted-foreground">{x.type || x.garmentType}</p></div><ChevronRight size={15} className="ml-auto" /></div>)}</div> : <p className="mt-5 text-sm text-muted-foreground">Nothing new yet — your next favorite could go here.</p>}</section>; }
function Studio() { const q = useGetDashboard(); const dashboard = q.data as AnyRecord | undefined; const profile = useGetProfile(); const update = useUpdateProfile(); const [edit, setEdit] = useState(false); const client = useQueryClient(); if (q.isLoading) return <Loading />; if (q.isError) return <ErrorState retry={() => q.refetch()} />; const active = dashboard?.activeProject; const save = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const data = new FormData(e.currentTarget); update.mutate({ data: { name: String(data.get('name')), experience: String(data.get('experience')), favoriteGarments: String(data.get('favoriteGarments')).split(',').map(x => x.trim()), units: String(data.get('units')) as 'metric' | 'imperial' } }, { onSuccess: () => { client.invalidateQueries({ queryKey: getGetProfileQueryKey() }); setEdit(false); } }); }; return <><Heading eyebrow="The studio / overview" title={`Good morning, ${dashboard?.userName || 'maker'}.`} copy="A little progress is still progress. Here is what is waiting for you." action={<button onClick={() => setEdit(true)} data-testid="button-edit-profile" className="btn btn-line min-h-[44px] w-full md:w-auto"><Settings size={15} /> Tune your space</button>} /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['Fabric stash', dashboard?.fabricCount, '/stash/fabrics'], ['Threads', dashboard?.threadCount, '/stash/threads'], ['Patterns', dashboard?.patternCount, '/patterns'], ['Projects', dashboard?.projectCount, '/projects']].map(([label, count, href]) => <Link href={href as string} key={label as string} data-testid={`card-stat-${label}`} className="studio-card rounded-xl p-5 hover:-translate-y-0.5"><span className="eyebrow !text-[#887566]">{label}</span><div className="mt-6 font-display text-4xl">{count ?? '—'}</div><p className="mt-1 text-xs text-muted-foreground">in your studio</p></Link>)}</div><div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_.65fr]"><section className="studio-card overflow-hidden rounded-xl"><div className="border-b border-[#dfd1be] px-6 py-5"><p className="eyebrow">On the machine</p><h2 className="mt-1 font-display text-3xl">{active?.name || 'Start something lovely'}</h2></div>{active ? <div className="grid gap-6 p-6 md:grid-cols-[.6fr_1fr]"><div className="min-h-[190px] rounded-lg bg-[#d2a370] bg-[repeating-linear-gradient(45deg,#c08c5d_0_2px,transparent_2px_10px)]" /><div className="flex flex-col justify-center"><p className="text-sm leading-6 text-muted-foreground">{active.notes || 'Your notes and little discoveries will live here.'}</p><div className="mt-8"><div className="mb-2 flex justify-between text-xs"><span>Progress</span><span>{active.progress || 0}%</span></div><div className="h-2 rounded-full bg-[#e4d8c7]"><div className="h-full rounded-full bg-[#b24761]" style={{ width: `${active.progress || 0}%` }} /></div></div><Link href="/projects" data-testid="link-continue-project" className="btn btn-quiet mt-7 w-fit">Continue project <ArrowRight size={15} /></Link></div></div> : <div className="p-6 text-sm text-muted-foreground">No active project yet. Your next one starts with a name.</div>}</section><section className="rounded-xl bg-[#2e5b51] p-6 text-[#f3e8d6]"><p className="eyebrow !text-[#e0ad75]">A little magic</p><h2 className="mt-2 font-display text-3xl leading-none">See it before you sew it.</h2><p className="mt-4 text-sm leading-6 text-[#c4d0c5]">Pair a pattern with something from your stash and sketch the possibility.</p><Link href="/ai-studio" data-testid="link-studio-ai" className="btn mt-7 bg-[#e0ad75] text-[#2e5b51]">Open AI studio <Sparkles size={15} /></Link></section></div><div className="mt-5 grid gap-5 lg:grid-cols-2"><Recent title="Recently added fabrics" items={dashboard?.recentFabrics || []} href="/stash/fabrics" /><Recent title="Patterns on your mind" items={dashboard?.recentPatterns || []} href="/patterns" /></div>{edit && <Modal title="Tune your space" close={() => setEdit(false)}><form onSubmit={save} className="flex flex-col h-full"><div className="flex-1 space-y-4"><label className="block text-xs font-semibold">Your name<input name="name" defaultValue={profile.data?.name || dashboard?.userName || ''} className="field mt-1.5" data-testid="input-profile-name" /></label><label className="block text-xs font-semibold">Experience<input name="experience" defaultValue={profile.data?.experience || ''} className="field mt-1.5" data-testid="input-profile-experience" /></label><label className="block text-xs font-semibold">Favorite garments<input name="favoriteGarments" defaultValue={(profile.data?.favoriteGarments || []).join(', ')} className="field mt-1.5" data-testid="input-profile-garments" /></label><label className="block text-xs font-semibold">Units<select name="units" defaultValue={profile.data?.units || 'imperial'} className="field mt-1.5" data-testid="input-profile-units"><option value="imperial">Imperial</option><option value="metric">Metric</option></select></label></div><div className="sticky bottom-0 -mx-5 -mb-5 bg-[#f7efe2]/95 px-5 py-5 backdrop-blur sm:static sm:mx-0 sm:mb-0 sm:bg-transparent sm:px-0 sm:py-0 border-t border-[#d4c5b0] sm:border-none pt-4 sm:pt-6 mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end z-10"><button type="button" onClick={() => setEdit(false)} className="btn btn-line min-h-[44px] sm:w-auto">Cancel</button><button type="submit" data-testid="button-save-profile" className="btn btn-primary min-h-[44px] sm:w-auto">Save preferences</button></div></form></Modal>}</>; }

function AIStudio() {
  const fabrics = useListFabrics();
  const patterns = useListPatterns();
  const create = useCreateVisualization();
  const rec = useGetRecommendations();
  const [pattern, setPattern] = useState('');
  const [fabric, setFabric] = useState('');
  const [result, setResult] = useState<AnyRecord | null>(null);
  const [error, setError] = useState('');
  const [recommend, setRecommend] = useState(false);
  const selectedPattern = (patterns.data || []).find((item: AnyRecord) => String(item.id) === pattern);
  const selectedFabric = (fabrics.data || []).find((item: AnyRecord) => String(item.id) === fabric);

  const visualize = () => {
    if (!pattern || !fabric) return;
    setError('');
    setResult(null);
    create.mutate(
      { data: { patternId: Number(pattern), fabricId: Number(fabric) } },
      {
        onSuccess: value => setResult(value),
        onError: err => setError(err instanceof Error ? err.message.replace(/^HTTP \d+ [^:]+:\s*/, '') : 'The outfit preview could not be generated. Please try again.'),
      },
    );
  };

  return <>
    <Heading eyebrow="The workbench / AI" title="AI studio" copy="Turn a pattern and fabric from your studio into an AI-generated outfit concept before you cut." />
    <div className="mb-7 flex flex-col sm:flex-row gap-1 rounded-lg bg-[#e2d5c2] p-1 sm:w-fit">
      <button onClick={() => setRecommend(false)} data-testid="button-ai-visualize-tab" className={`btn min-h-[44px] flex-1 sm:flex-none ${!recommend ? 'bg-[#f7efe2]' : ''}`}><Clapperboard size={15} /> Visualize a make</button>
      <button onClick={() => setRecommend(true)} data-testid="button-ai-recommend-tab" className={`btn min-h-[44px] flex-1 sm:flex-none ${recommend ? 'bg-[#f7efe2]' : ''}`}><Compass size={15} /> Find a pairing</button>
    </div>
    {recommend ? <section className="studio-card rounded-xl p-6">
      <p className="eyebrow">From the shelves</p>
      <h2 className="mt-2 font-display text-3xl">Pairings worth a second look.</h2>
      {rec.isLoading ? <Loading /> : rec.isError ? <ErrorState retry={() => rec.refetch()} /> : <div className="mt-7 grid gap-4 md:grid-cols-2">{(rec.data || []).map((r: AnyRecord, i: number) => <div key={i} data-testid={`card-recommendation-${i}`} className="rounded-lg border border-[#dfd1be] p-4"><p className="font-display text-xl">{r.pattern?.name}</p><p className="text-xs text-muted-foreground">with {r.fabric?.name}</p><p className="mt-4 text-sm leading-6 text-muted-foreground">{r.reason}</p></div>)}</div>}
    </section> : <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <section className="studio-card rounded-xl p-6">
        <p className="eyebrow">01 / choose your ingredients</p>
        <h2 className="mt-2 font-display text-3xl">Build the outfit concept.</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">The AI uses your saved garment, construction, color, fabric type, weight, and drape details.</p>
        <label className="mt-5 block text-xs font-semibold">Pattern
          <select value={pattern} onChange={event => { setPattern(event.target.value); setResult(null); setError(''); }} data-testid="select-ai-pattern" className="field mt-1.5">
            <option value="">Choose a pattern…</option>
            {(patterns.data || []).map((item: AnyRecord) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
        {selectedPattern && <div className="mt-3 rounded-lg border border-[#dfd1be] bg-[#efe4d3] p-3 text-xs leading-5" data-testid="summary-ai-pattern"><strong>{selectedPattern.garmentType}</strong> · {selectedPattern.difficulty}<br /><span className="text-muted-foreground">{selectedPattern.instructions || selectedPattern.notes || 'No construction notes added yet.'}</span></div>}
        <label className="mt-4 block text-xs font-semibold">Fabric
          <select value={fabric} onChange={event => { setFabric(event.target.value); setResult(null); setError(''); }} data-testid="select-ai-fabric" className="field mt-1.5">
            <option value="">Choose from your stash…</option>
            {(fabrics.data || []).map((item: AnyRecord) => <option value={item.id} key={item.id}>{item.name} · {item.color}</option>)}
          </select>
        </label>
        {selectedFabric && <div className="mt-3 flex items-center gap-3 rounded-lg border border-[#dfd1be] bg-[#efe4d3] p-3 text-xs" data-testid="summary-ai-fabric"><span className="h-8 w-8 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: selectedFabric.color }} /><div><strong>{selectedFabric.type}</strong> · {selectedFabric.color}<br /><span className="text-muted-foreground">{selectedFabric.composition || selectedFabric.weight || 'No fabric details added yet.'}</span></div></div>}
        <button onClick={visualize} disabled={!pattern || !fabric || create.isPending} data-testid="button-create-visualization" className="btn btn-primary mt-6 min-h-[44px] w-full">
          {create.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {create.isPending ? 'Imagining your outfit…' : 'Generate outfit concept'}
        </button>
        <p className="mt-3 text-center text-[.68rem] leading-5 text-muted-foreground">Generation can take up to a minute and uses Replit AI credits.</p>
        {error && <div role="alert" data-testid="error-ai-visualization" className="mt-4 rounded-lg border border-[#c9877e] bg-[#f2dfd8] p-3 text-xs leading-5 text-[#853c38]">{error}</div>}
      </section>
      <section className="relative grid min-h-[520px] place-items-center overflow-hidden rounded-xl bg-[#d0b28f] p-5 text-center">
        {create.isPending ? <div data-testid="state-ai-generating"><Loader2 size={34} className="mx-auto animate-spin text-[#775f49]" /><h2 className="mt-5 font-display text-3xl text-[#5e493a]">Draping the idea.</h2><p className="mt-3 text-sm text-[#775f49]">AI is translating your pattern and fabric into a finished look.</p></div> :
          result ? <div className="w-full"><img src={result.imageUrl} alt={`${selectedPattern?.name || 'Pattern'} made in ${selectedFabric?.name || 'selected fabric'}`} className="mx-auto max-h-[560px] w-full rounded-lg object-contain shadow-xl" data-testid="image-ai-visualization" /><div className="mt-4 flex flex-wrap items-center justify-center gap-2"><span className="rounded-full bg-[#2e5b51] px-3 py-1 font-mono-custom text-[.6rem] uppercase text-[#f3e8d6]">AI concept</span><span className="text-xs font-semibold text-[#5e493a]">{selectedPattern?.name} × {selectedFabric?.name}</span></div><p className="mx-auto mt-3 max-w-lg text-xs leading-5 text-[#655549]">{result.disclaimer}</p></div> :
            <div><ImagePlus size={32} className="mx-auto text-[#775f49]" /><h2 className="mt-5 font-display text-3xl text-[#5e493a]">Your imagined garment<br />will appear here.</h2><p className="mt-3 text-sm text-[#775f49]">Select a pattern and fabric to begin.</p></div>}
      </section>
    </div>}
  </>;
}

function Assistant() { const ask = useAskAssistant(); const projects = useListProjects(); const [text, setText] = useState(''); const [project, setProject] = useState(''); const [messages, setMessages] = useState<AnyRecord[]>([]); const send = (e: React.FormEvent) => { e.preventDefault(); if (!text.trim()) return; const message = text.trim(); setText(''); setMessages(m => [...m, { role: 'maker', text: message }]); ask.mutate({ data: { message, projectId: project ? Number(project) : null } }, { onSuccess: x => setMessages(m => [...m, { role: 'assistant', text: x.answer, mode: x.mode }]), onError: () => setMessages(m => [...m, { role: 'assistant', text: 'The assistant could not answer just now. Please try again.', mode: 'offline' }]) }); }; return <><Heading eyebrow="The workbench / conversation" title="Sewing assistant" copy="OpenAI-powered help for technique questions, fitting puzzles, fabric choices, and project-specific next steps." /><div className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-[#d4c5b0] bg-[#f7efe2] flex flex-col h-[calc(100dvh-200px)] min-h-[500px]"><div className="flex items-center gap-3 border-b border-[#dfd1be] bg-[#e8ddcc] px-5 py-4 shrink-0"><div className="grid h-9 w-9 place-items-center rounded-full bg-[#2e5b51] text-[#f3e8d6]"><MessageCircle size={17} /></div><div><p className="text-sm font-bold">The studio voice</p><p className="font-mono-custom text-[.6rem] uppercase text-[#887566]">OpenAI-powered · project-aware</p></div></div><div className="flex-1 overflow-y-auto space-y-4 p-5 sm:p-8">{messages.length === 0 && <div className="flex h-full flex-col items-center justify-center text-center"><Scissors /><h2 className="mt-4 font-display text-2xl">What are you working on?</h2><p className="mt-2 text-sm text-muted-foreground">Select a project for context, then ask about construction, fitting, or troubleshooting.</p></div>}{messages.map((m, i) => <div key={i} data-testid={`message-${i}`} className={`flex ${m.role === 'maker' ? 'justify-end' : ''}`}><div className={`max-w-[85%] sm:max-w-[82%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm leading-6 ${m.role === 'maker' ? 'bg-[#b24761] text-[#f9eddd]' : 'bg-[#e7dccb]'}`}>{m.text}{m.mode && <div className="mt-2 font-mono-custom text-[.58rem] uppercase opacity-60">{m.mode === 'live' ? 'OpenAI response' : `${m.mode} response`}</div>}</div></div>)}{ask.isPending && <div className="flex items-center gap-2 text-xs text-[#b24761]"><Loader2 className="animate-spin" size={16} /> Thinking through your sewing question…</div>}</div><div className="border-t border-[#dfd1be] p-4 shrink-0 bg-[#f7efe2]"><div className="mb-3 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold">Project context</span><select value={project} onChange={e => setProject(e.target.value)} data-testid="select-assistant-project" className="rounded border border-[#d4c5b0] bg-transparent px-3 min-h-[44px] text-xs flex-1 sm:flex-none"><option value="">General sewing question</option>{(projects.data || []).map((p: AnyRecord) => <option value={p.id} key={p.id}>{p.name}</option>)}</select></div><form onSubmit={send} className="flex gap-2"><input value={text} onChange={e => setText(e.target.value)} data-testid="input-assistant-message" placeholder="Ask about fit, fabric, technique..." className="field" /><button disabled={ask.isPending || !text.trim()} type="submit" data-testid="button-send-assistant" className="btn btn-primary px-4"><ArrowRight size={17} /></button></form></div></div></>; }

function Marketplace() { return <div className="min-h-[70vh] rounded-2xl bg-[#2e5b51] px-6 py-20 text-center text-[#f3e8d6]"><p className="eyebrow !text-[#e0ad75]">Coming soon / the exchange</p><h1 className="mx-auto mt-5 max-w-2xl font-display text-6xl leading-[.9]">Good things are worth waiting for.</h1><p className="mx-auto mt-7 max-w-md text-sm leading-7 text-[#c4d0c5]">A thoughtful marketplace for independent patterns, beautiful cloth, and the makers behind both.</p></div>; }
function Auth({ mode }: { mode: 'sign-in' | 'sign-up' }) { return <main className="grid min-h-[100dvh] bg-[#eadfcb] md:grid-cols-[.9fr_1.1fr]"><section className="hidden bg-[#2e5b51] p-10 text-[#f3e8d6] md:block"><Logo dark /><div className="mt-[42vh]"><p className="eyebrow !text-[#e0ad75]">Your digital sewing room</p><h1 className="mt-4 font-display text-6xl leading-[.9]">Make space<br />for the work.</h1></div></section><section className="flex items-center justify-center px-5 py-12"><div className="w-full max-w-[430px]"><div className="mb-10 md:hidden"><Logo /></div><p className="eyebrow">{mode === 'sign-in' ? 'Welcome back, maker' : 'Begin your practice'}</p><h1 className="mt-3 font-display text-5xl leading-none">{mode === 'sign-in' ? 'Back to the machine.' : 'Your studio awaits.'}</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">A calm place for every idea, scrap, and almost-finished thing.</p><form onSubmit={e => { e.preventDefault(); window.location.href = '/studio'; }} className="mt-9 space-y-4"><label className="block text-xs font-semibold">Email address<input type="email" required data-testid="input-auth-email" className="field mt-1.5" /></label><label className="block text-xs font-semibold">Password<input type="password" required data-testid="input-auth-password" className="field mt-1.5" /></label><button type="submit" data-testid="button-auth-submit" className="btn btn-primary w-full">{mode === 'sign-in' ? 'Enter the studio' : 'Create my studio'} <ArrowRight size={15} /></button></form><button onClick={() => window.location.href = '/studio'} data-testid="button-auth-demo" className="btn btn-line mt-5 w-full">Continue in demo mode</button><p className="mt-7 text-center text-xs text-muted-foreground">{mode === 'sign-in' ? 'New here? ' : 'Already have a studio? '}<Link href={mode === 'sign-in' ? '/sign-up' : '/sign-in'} data-testid="link-auth-switch" className="font-bold text-[#b24761]">{mode === 'sign-in' ? 'Create an account' : 'Sign in instead'}</Link></p><p className="mt-10 text-center font-mono-custom text-[.58rem] uppercase text-[#9b8979]">Demo mode · Clerk-ready branded entry</p></div></section></main>; }

function ClerkAuth({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  return <main className="grid min-h-[100dvh] place-items-center bg-[#eadfcb] px-4 py-8">
    {mode === 'sign-in'
      ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />}
  </main>;
}

import { ProjectsList, ProjectDetail } from '@/components/projects';

function Router() { return <Switch><Route path="/" component={Landing} /><Route path="/studio">{() => <Shell><Studio /></Shell>}</Route><Route path="/stash/fabrics">{() => <Shell><FabricPage /></Shell>}</Route><Route path="/stash/threads">{() => <Shell><ThreadPage /></Shell>}</Route><Route path="/patterns">{() => <Shell><PatternsPage /></Shell>}</Route><Route path="/projects">{() => <Shell><ProjectsList /></Shell>}</Route><Route path="/projects/:id">{() => <Shell><ProjectDetail /></Shell>}</Route><Route path="/measurements">{() => <Shell><MeasurementsPage /></Shell>}</Route><Route path="/ai-studio">{() => <Shell><AIStudio /></Shell>}</Route><Route path="/assistant">{() => <Shell><Assistant /></Shell>}</Route><Route path="/marketplace">{() => <Shell><Marketplace /></Shell>}</Route><Route path="/sign-in/*?" component={() => <ClerkAuth mode="sign-in" />} /><Route path="/sign-up/*?" component={() => <ClerkAuth mode="sign-up" />} /><Route component={NotFound} /></Switch>; }

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  const stripBase = (path: string) => basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{ signIn: { start: { title: 'Welcome back, maker', subtitle: 'Sign in to return to your studio' } }, signUp: { start: { title: 'Create your studio', subtitle: 'A calmer place for your sewing practice' } } }} routerPush={to => setLocation(stripBase(to))} routerReplace={to => setLocation(stripBase(to), { replace: true })}><Router /></ClerkProvider>;
}

function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><ErrorBoundary><ClerkRoutes /></ErrorBoundary></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>; }
export default App;
