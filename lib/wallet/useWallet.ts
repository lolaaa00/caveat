'use client';

import { useCallback, useEffect, useState } from 'react';
import { CHAIN_ID, EXPLORER_URL, NETWORK_LABEL, RPC_URL } from '@/lib/config';
import { getInjectedProvider } from '@/lib/genlayer/client';

const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;

export type WalletStatus = 'unavailable' | 'disconnected' | 'connecting' | 'wrong-network' | 'ready';

export interface WalletState {
  status: WalletStatus;
  address: string | null;
  chainId: number | null;
  error: string | null;
  connect: () => Promise<void>;
  switchNetwork: () => Promise<void>;
}

export const useWallet = (): WalletState => {
  const [status, setStatus] = useState<WalletStatus>('disconnected');
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const syncChain = useCallback(async () => {
    const provider = getInjectedProvider();
    if (!provider) return null;
    const raw = (await provider.request({ method: 'eth_chainId' })) as string;
    const id = Number.parseInt(raw, 16);
    setChainId(id);
    return id;
  }, []);

  useEffect(() => {
    const provider = getInjectedProvider();
    if (!provider) {
      setStatus('unavailable');
      return;
    }

    let cancelled = false;
    const bootstrap = async () => {
      try {
        const accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
        const id = await syncChain();
        if (cancelled) return;
        if (accounts.length > 0) {
          setAddress(accounts[0]);
          setStatus(id === CHAIN_ID ? 'ready' : 'wrong-network');
        } else {
          setStatus('disconnected');
        }
      } catch {
        if (!cancelled) setStatus('disconnected');
      }
    };
    void bootstrap();

    const onAccounts = (...args: unknown[]) => {
      const accounts = (args[0] as string[]) ?? [];
      setAddress(accounts[0] ?? null);
      setStatus(accounts.length === 0 ? 'disconnected' : 'ready');
      void syncChain().then((id) => {
        if (accounts.length > 0 && id !== CHAIN_ID) setStatus('wrong-network');
      });
    };
    const onChain = (...args: unknown[]) => {
      const id = Number.parseInt(args[0] as string, 16);
      setChainId(id);
      setStatus((current) =>
        current === 'disconnected' || current === 'unavailable'
          ? current
          : id === CHAIN_ID
            ? 'ready'
            : 'wrong-network',
      );
    };

    provider.on?.('accountsChanged', onAccounts);
    provider.on?.('chainChanged', onChain);
    return () => {
      cancelled = true;
      provider.removeListener?.('accountsChanged', onAccounts);
      provider.removeListener?.('chainChanged', onChain);
    };
  }, [syncChain]);

  const switchNetwork = useCallback(async () => {
    const provider = getInjectedProvider();
    if (!provider) return;
    setError(null);
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CHAIN_ID_HEX }],
      });
    } catch {
      // The wallet does not know Studio Next yet; offer to add it.
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: CHAIN_ID_HEX,
              chainName: NETWORK_LABEL,
              rpcUrls: [RPC_URL],
              blockExplorerUrls: [EXPLORER_URL],
              nativeCurrency: { name: 'GEN Token', symbol: 'GEN', decimals: 18 },
            },
          ],
        });
      } catch (addError) {
        setError(addError instanceof Error ? addError.message : 'Could not switch network.');
      }
    }
    await syncChain();
  }, [syncChain]);

  const connect = useCallback(async () => {
    const provider = getInjectedProvider();
    if (!provider) {
      setStatus('unavailable');
      return;
    }
    setStatus('connecting');
    setError(null);
    try {
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
      setAddress(accounts[0] ?? null);
      const id = await syncChain();
      setStatus(id === CHAIN_ID ? 'ready' : 'wrong-network');
    } catch (connectError) {
      setStatus('disconnected');
      setError(
        connectError instanceof Error ? connectError.message : 'Wallet connection was rejected.',
      );
    }
  }, [syncChain]);

  return { status, address, chainId, error, connect, switchNetwork };
};
