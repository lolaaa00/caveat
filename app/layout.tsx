import type { Metadata } from 'next';
import './globals.css';
import { TopBar } from '@/components/ui/TopBar';

export const metadata: Metadata = {
  title: 'CAVEAT — Execution Checkpoint',
  description:
    'A context-aware execution checkpoint for autonomous agents. Authorization proves an agent may act; CAVEAT verifies whether acting still means what you meant.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-void text-ink">
        <TopBar />
        <main className="mx-auto w-full max-w-[1180px] px-6 py-8">{children}</main>
        <footer className="mx-auto w-full max-w-[1180px] px-6 pb-10">
          <p className="label">
            Every verdict on this console is read from the Intelligent Contract. The frontend
            computes none of them.
          </p>
        </footer>
      </body>
    </html>
  );
}
