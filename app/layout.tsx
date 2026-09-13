import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Ambient } from '@/components/ui/Ambient';
import { TopBar } from '@/components/ui/TopBar';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains',
  display: 'swap',
});

const TITLE = 'CAVEAT — Autonomous Execution Checkpoint';
const DESCRIPTION =
  'Permission can stay valid. Intent can change. CAVEAT checks whether an agent’s proposed action still faithfully represents the authority it was given — the final semantic checkpoint before consequential autonomous execution, on GenLayer.';

export const metadata: Metadata = {
  metadataBase: new URL('https://caveat-xi.vercel.app'),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    siteName: 'CAVEAT',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>
        <Ambient />
        <TopBar />
        {children}
      </body>
    </html>
  );
}
