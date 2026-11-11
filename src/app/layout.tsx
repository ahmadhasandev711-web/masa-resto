import type { Metadata, Viewport } from 'next';
import { Cairo } from 'next/font/google';
import './globals.css';
import { PwaRegister } from './pwa-register';
import { DemoBanner } from './demo-banner';
import { isDemoMode } from '../infrastructure/demo/demo-policy';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-cairo',
  display: 'swap',
  preload: false, // Bilingual site: avoid duplicate preload tags for both arabic & latin subsets
});

export const viewport: Viewport = {
  themeColor: '#18181b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: 'منظومة إدارة المطاعم | MASA Platform',
  description: 'منصة احترافية لإدارة المطاعم، الفروع، والمبيعات',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MASA OS',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full antialiased`}>
      <body className="min-h-full font-sans bg-zinc-50 text-zinc-900 antialiased flex flex-col">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
