'use client';

/**
 * The Sepolia payment leg.
 *
 * The principal's own wallet signs and sends; nothing here custodies funds or keys. The
 * authorization artifact from `consume_approval` travels in the transaction's data field,
 * so the payment carries on-chain proof of which CAVEAT decision permitted it — a link
 * anyone can check without the adjudication layer being involved in the payment at all.
 */

import { SETTLEMENT_RAILS } from '@/lib/config';
import { getInjectedProvider } from '@/lib/genlayer/client';

const SEPOLIA = SETTLEMENT_RAILS.sepolia;

const currentChainIdHex = async (): Promise<string> => {
  const provider = getInjectedProvider();
  if (!provider) throw new Error('No browser wallet found.');
  return (await provider.request({ method: 'eth_chainId' })) as string;
};

const switchChain = async (chainIdHex: string, add?: () => Promise<void>) => {
  const provider = getInjectedProvider();
  if (!provider) throw new Error('No browser wallet found.');
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
  } catch (error) {
    if (add) {
      await add();
      return;
    }
    throw error;
  }
};

export const payOnSepolia = async (
  from: string,
  payee: string,
  amountWei: string,
  authorization: string,
): Promise<{ txHash: string; previousChainIdHex: string }> => {
  const provider = getInjectedProvider();
  if (!provider) throw new Error('No browser wallet found.');

  const previousChainIdHex = await currentChainIdHex();
  if (previousChainIdHex.toLowerCase() !== SEPOLIA.chainIdHex) {
    await switchChain(SEPOLIA.chainIdHex, async () => {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: SEPOLIA.chainIdHex,
            chainName: SEPOLIA.chainName,
            rpcUrls: [SEPOLIA.rpcUrl],
            blockExplorerUrls: ['https://sepolia.etherscan.io'],
            nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
          },
        ],
      });
    });
  }

  const txHash = (await provider.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from,
        to: payee,
        value: '0x' + BigInt(amountWei).toString(16),
        // The authorization artifact, carried as calldata so the payment references the
        // decision that permitted it.
        data: authorization && authorization.startsWith('0x') ? authorization : undefined,
      },
    ],
  })) as string;

  return { txHash, previousChainIdHex };
};

export const returnToChain = async (chainIdHex: string) => {
  const current = await currentChainIdHex();
  if (current.toLowerCase() !== chainIdHex.toLowerCase()) {
    await switchChain(chainIdHex);
  }
};
