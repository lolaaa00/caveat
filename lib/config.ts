/**
 * Network configuration. Studio Next / Studio-dev, chain 61997.
 *
 * StudioNet 61999 is a different deployment: never substitute its configuration or
 * treat its transactions as evidence for this one.
 */
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID ?? 61997);

export const RPC_URL =
  process.env.NEXT_PUBLIC_GENLAYER_RPC_URL ?? 'https://studio-dev.genlayer.com/api';

export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_GENLAYER_EXPLORER_URL ?? 'https://explorer-studio-dev.genlayer.com';

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CAVEAT_CONTRACT_ADDRESS ?? '').trim();

export const NETWORK_LABEL = 'GenLayer Studio Next';

export const isConfigured = () => CONTRACT_ADDRESS.startsWith('0x') && CONTRACT_ADDRESS.length === 42;

export const explorerTx = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const explorerAddress = (address: string) => `${EXPLORER_URL}/address/${address}`;

/** Settlement rails the contract will verify. Testnets only. */
export const SETTLEMENT_RAILS = {
  sepolia: {
    label: 'Sepolia',
    chainIdHex: '0xaa36a7',
    decimals: 18,
    symbol: 'SepoliaETH',
    explorerTx: (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`,
  },
  'solana-devnet': {
    label: 'Solana devnet',
    chainIdHex: null,
    decimals: 9,
    symbol: 'devnet SOL',
    explorerTx: (hash: string) => `https://explorer.solana.com/tx/${hash}?cluster=devnet`,
  },
} as const;

export type SettlementRail = keyof typeof SETTLEMENT_RAILS;
