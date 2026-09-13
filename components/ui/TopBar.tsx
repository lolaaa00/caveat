'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { CHAIN_ID, explorerAddress, CONTRACT_ADDRESS, isConfigured } from '@/lib/config';
import { fundFromFaucet } from '@/lib/genlayer/faucet';
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
        {wallet.status === 'ready' && wallet.address ? <FaucetButton address={wallet.address} /> : null}
        <WalletControl wallet={wallet} />
      </div>
    </nav>
  );
};

/**
 * Studio Next's own faucet, one click away. The single biggest piece of friction
 * between a first-time visitor and actually trying the live checkpoint is having no
 * testnet GEN — this removes it without sending anyone off to hunt for a faucet link.
 */
const FaucetButton = ({ address }: { address: string }) => {
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');

  const fund = async () => {
    setState('pending');
    try {
      await fundFromFaucet(address);
      setState('done');
    } catch {
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <span className="chip-wallet ok" style={{ cursor: 'default' }}>
        <span className="wc-dot" />
        Funded
      </span>
    );
  }

  return (
    <button
      className="chip-wallet warn"
      disabled={state === 'pending'}
      onClick={() => void fund()}
      title="Fund this wallet with testnet GEN from the Studio Next faucet"
    >
      <span className="wc-dot" />
      {state === 'pending' ? 'Funding…' : state === 'error' ? 'Faucet failed, retry' : 'Get testnet GEN'}
    </button>
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
