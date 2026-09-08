'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CHAIN_ID, CONTRACT_ADDRESS, NETWORK_LABEL, explorerAddress, isConfigured } from '@/lib/config';
import { useWallet } from '@/lib/wallet/useWallet';
import { Badge, Button } from './primitives';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/mandates/new', label: 'New mandate' },
  { href: '/demo', label: 'Demo' },
];

export const TopBar = () => {
  const pathname = usePathname();
  const wallet = useWallet();

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-x-8 gap-y-3 px-6 py-3">
        <Link href="/" className="flex items-baseline gap-2.5">
          <span className="datum text-[15px] tracking-[0.28em] text-ink">CAVEAT</span>
          <span className="label hidden sm:inline">Execution checkpoint</span>
        </Link>

        <nav className="flex items-center gap-5">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`datum text-[11px] tracking-[0.1em] uppercase transition-colors ${
                  active ? 'text-ink' : 'text-ink-faint hover:text-ink-dim'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {isConfigured() ? (
            <a
              href={explorerAddress(CONTRACT_ADDRESS)}
              target="_blank"
              rel="noreferrer"
              className="hidden md:block"
            >
              <Badge tone="signal">
                {NETWORK_LABEL} · {CHAIN_ID}
              </Badge>
            </a>
          ) : (
            <Badge tone="block">Contract address not set</Badge>
          )}
          <WalletControl wallet={wallet} />
        </div>
      </div>
    </header>
  );
};

const WalletControl = ({ wallet }: { wallet: ReturnType<typeof useWallet> }) => {
  if (wallet.status === 'unavailable') {
    return (
      <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">
        <Badge tone="reconfirm">No wallet detected</Badge>
      </a>
    );
  }
  if (wallet.status === 'wrong-network') {
    return (
      <Button tone="reconfirm" onClick={() => void wallet.switchNetwork()}>
        Switch to chain {CHAIN_ID}
      </Button>
    );
  }
  if (wallet.status === 'ready' && wallet.address) {
    return (
      <Badge tone="execute">
        <span className="h-1.5 w-1.5 rounded-full bg-execute" />
        {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
      </Badge>
    );
  }
  return (
    <Button tone="primary" disabled={wallet.status === 'connecting'} onClick={() => void wallet.connect()}>
      {wallet.status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
    </Button>
  );
};
