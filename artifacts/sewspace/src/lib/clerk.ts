import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';

export const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
export const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
export const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
export const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#000000',
    colorForeground: '#000000',
    colorMutedForeground: '#555555',
    colorDanger: '#c42a2a',
    colorBackground: '#ffffff',
    colorInput: '#ffffff',
    colorInputForeground: '#000000',
    colorNeutral: '#000000',
    fontFamily: 'Inter, system-ui, sans-serif',
    borderRadius: '1rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-white rounded-[32px] border border-line w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-ink font-display',
    headerSubtitle: 'text-subtle',
    socialButtonsBlockButton: '!rounded-full border border-ink bg-white min-h-[48px]',
    socialButtonsBlockButtonText: 'text-ink font-bold',
    formFieldLabel: 'text-ink',
    formFieldInput: '!rounded-2xl border border-ink bg-white text-ink focus:!ring-4 focus:!ring-yellow/60',
    formButtonPrimary: '!rounded-full bg-yellow text-ink hover:bg-ink hover:text-white min-h-[48px] font-bold',
    footerActionLink: 'text-blue-ink font-bold',
    footerActionText: 'text-subtle',
    dividerText: 'text-subtle',
    identityPreviewEditButton: 'text-blue-ink',
    formFieldSuccessText: 'text-blue-ink',
    alertText: 'text-red-ink',
    alert: 'bg-peach-soft',
    logoBox: 'justify-center',
    logoImage: 'max-h-12',
    footerAction: 'border-line',
    dividerLine: 'bg-line',
    otpCodeFieldInput: 'border-ink bg-white',
    formFieldRow: 'text-ink',
    main: 'bg-transparent',
  },
};
