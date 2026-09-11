'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CHAIN_ID, explorerAddress, CONTRACT_ADDRESS, isConfigured } from '@/lib/config';
import { useWallet } from '@/lib/wallet/useWallet';

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/mandates/new', label: 'Mandates' },
  { href: '/demo', label: 'Demo' },
];

export const TopBar = () => {
  const pathname = usePathname();
  const wallet = useWallet();

  return (
    <nav className="nav">
      <div className="nav-l">
        <Link href="/" className="wordmark">
          <div className="wm-mark" />
          CAVEAT
        </Link>
        <ul className="nav-links">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={pathname === item.href ? 'on' : ''}>
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            {isConfigured() ? (
              <a href={explorerAddress(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">
                Contract
              </a>
            ) : (
              <span>Contract</span>
            )}
          </li>
        </ul>
      </div>
      <WalletControl wallet={wallet} />
    </nav>
  );
};

const WalletControl = ({ wallet }: { wallet: ReturnType<typeof useWallet> }) => {
  if (wallet.status === 'unavailable') {
    return (
      <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="chip-wallet warn">
        <span className="wc-dot" />
        No wallet detected
      </a>
    );
  }
  if (wallet.status === 'wrong-network') {
    return (
      <button className="chip-wallet warn" onClick={() => void wallet.switchNetwork()}>
        <span className="wc-dot" />
        Switch to chain {CHAIN_ID}
      </button>
    );
  }
  if (wallet.status === 'ready' && wallet.address) {
    return (
      <span className="chip-wallet ok">
        <span className="wc-dot" />
        {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
      </span>
    );
  }
  return (
    <button
      className="chip-wallet warn"
      disabled={wallet.status === 'connecting'}
      onClick={() => void wallet.connect()}
      style={{ opacity: wallet.status === 'connecting' ? 0.6 : 1 }}
    >
      <span className="wc-dot" />
      {wallet.status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
    </button>
  );
};
