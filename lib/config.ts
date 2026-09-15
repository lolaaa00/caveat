/**
 * Network configuration. Studio Next / Studio-dev, chain 61997.
 *
 * StudioNet 61999 is a different deployment: never substitute its configuration or
 * treat its transactions as evidence for this one.
 */
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID ?? 61997);

export const RPC_URL =
  process.env.NEXT_PUBLIC_GENLAYER_RPC_URL ?? 'https://studio-next.genlayer.com/api';

export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_GENLAYER_EXPLORER_URL ?? 'https://explorer-studio-dev.genlayer.com';

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CAVEAT_CONTRACT_ADDRESS ?? '').trim();

export const NETWORK_LABEL = 'GenLayer Studio Next';

export const isConfigured = () => CONTRACT_ADDRESS.startsWith('0x') && CONTRACT_ADDRESS.length === 42;

export const explorerTx = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const explorerAddress = (address: string) => `${EXPLORER_URL}/address/${address}`;

/**
 * Settlement rails. Testnets only, keyless public RPCs only.
 *
 * These are read and verified client-side. The Intelligent Contract knows nothing about
 * them: it is a decision layer and does not move or verify value.
 */
export const SETTLEMENT_RAILS = {
  sepolia: {
    label: 'Sepolia',
    chainIdHex: '0xaa36a7',
    chainName: 'Sepolia',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    decimals: 18,
    symbol: 'SepoliaETH',
    faucet: 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia',
    walletPayable: true,
    explorerTx: (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`,
  },
  'solana-devnet': {
    label: 'Solana devnet',
    chainIdHex: null,
    chainName: 'Solana devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    decimals: 9,
    symbol: 'devnet SOL',
    faucet: 'https://faucet.solana.com/',
    walletPayable: false,
    explorerTx: (hash: string) => `https://explorer.solana.com/tx/${hash}?cluster=devnet`,
  },
} as const;

export type SettlementRail = keyof typeof SETTLEMENT_RAILS;
