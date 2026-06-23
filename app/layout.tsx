import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import LandscapeBlocker from "@/components/LandscapeBlocker";
import { AuthProvider } from "@/contexts/AuthProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MotionProvider from "@/components/MotionProvider";
import ErrorReporter from "@/components/ErrorReporter";
import AIMobileTeaser from "@/components/ai/AIMobileTeaser";
import { AI_ENABLED } from "@/lib/featureFlags";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PlanR",
  description: "Goal-oriented planning with integrated progress tracking",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PlanR",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // `interactive-widget` is an Android-Chrome-only viewport key; iOS Safari logs
  // "not recognized and ignored". Omitted since this is an iOS-first PWA.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${nunito.variable} h-full antialiased`} suppressHydrationWarning>
      {/* Inline theme script runs synchronously before first paint — eliminates dark-mode flash */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
var apply=function(dark){document.documentElement.classList.toggle('dark',dark);document.documentElement.style.colorScheme=dark?'dark':'light';};
var t=localStorage.getItem('theme');
apply(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches));
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',function(e){if(!localStorage.getItem('theme'))apply(e.matches);});
try{
  var nav=navigator;
  var ua=nav.userAgent||'';
  // iOS Safari/PWA can't expose deviceMemory and reports >2 cores, so the
  // generic low-end checks never fire there. iOS handles backdrop-filter over
  // scrolling content poorly, so treat all iPhones/iPads as "reduce blur".
  var isIOS=/iPad|iPhone|iPod/.test(ua)||(nav.platform==='MacIntel'&&nav.maxTouchPoints>1);
  var lowEnd=isIOS||(nav.hardwareConcurrency!=null&&nav.hardwareConcurrency<=2)||(nav.deviceMemory!=null&&nav.deviceMemory<=2)||((nav.connection||{}).saveData===true)||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(lowEnd)document.documentElement.classList.add('reduce-blur');
}catch(e2){}
}catch(e){}})();`,
          }}
        />
      </head>
      {/* Body owns the top safe-area inset once (so the desktop/iPad layout,
          which has no fixed mobile header, still clears the status bar). The
          fixed mobile header adds the inset to its own height, and the mobile
          scroll content offsets by just the header's base height (64px) — the
          body padding supplies the inset, so it is NOT added again there. */}
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-white font-sans" style={{ paddingTop: "env(safe-area-inset-top)", paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}>
        <LandscapeBlocker />
        <ErrorReporter />
        <ServiceWorkerRegistration />
        <PWAInstallPrompt />
        {/* AI teaser sits above everything — mobile only, dismissable (hidden while AI is disabled) */}
        {AI_ENABLED && <AIMobileTeaser />}
        <AuthProvider>
          <ErrorBoundary>
            <MotionProvider>
              {children}
            </MotionProvider>
          </ErrorBoundary>
        </AuthProvider>
      </body>
    </html>
  );
}
