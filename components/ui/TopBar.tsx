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
 * A real GEN transfer, one click away — /api/faucet signs and submits it server-side
 * from a dedicated wallet. The single biggest piece of friction between a first-time
 * visitor and actually trying the live checkpoint is having no testnet GEN; this removes
 * it without sending anyone off to hunt for a faucet link. Rate-limited to one claim per
 * address per cooldown window, enforced server-side (Redis), not by anything in the
 * browser a visitor could just clear.
 */
const FaucetButton = ({ address }: { address: string }) => {
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const [amount, setAmount] = useState(1);
  const [message, setMessage] = useState('');

  const fund = async () => {
    setState('pending');
    try {
      const { hash, amountGen } = await fundFromFaucet(address);
      setAmount(amountGen);
      setMessage(hash);
      setState('done');
    } catch (err) {
      console.error('Faucet error:', err);
      setMessage(err instanceof Error ? err.message : 'Faucet request failed.');
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <span
        className="chip-wallet ok"
        style={{ cursor: 'default' }}
        title={`A real transfer of ${amount} GEN was sent to your wallet on chain 61997 (Studio Next). Tx: ${message}`}
      >
        <span className="wc-dot" />
        +{amount} GEN funded
      </span>
    );
  }

  return (
    <button
      className="chip-wallet warn"
      disabled={state === 'pending'}
      onClick={() => void fund()}
      title={
        state === 'error'
          ? message
          : 'Get a real, one-time GEN transfer from the CAVEAT faucet wallet on Studio Next'
      }
    >
      <span className="wc-dot" />
      {state === 'pending'
        ? 'Funding…'
        : state === 'error'
          ? message || 'Faucet unavailable — retry'
          : 'Get testnet GEN'}
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
