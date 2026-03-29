# Stellar Integration Layer

Bridge between backend and Soroban vault contract.

## Structure

```
src/stellar/
├── client.ts      # RPC server + transaction submission
├── contract.ts    # Vault contract read/write calls
├── events.ts      # Contract event listener
├── wallet.ts      # Custodial wallet management
├── types.ts       # Shared Stellar types
└── index.ts       # Main exports
```

## Usage

```typescript
import {
  getOnChainBalance,
  triggerRebalance,
  startEventListener,
  createCustodialWallet
} from './stellar';
```

## Environment Variables

```bash
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_AGENT_SECRET_KEY=SXXX...
VAULT_CONTRACT_ID=CXXX...
WALLET_ENCRYPTION_KEY=<64_hex_chars>
```

## Key Functions

- `getOnChainBalance(address)` - Read user balance
- `triggerRebalance(protocol, apy)` - Execute rebalance
- `startEventListener()` - Monitor blockchain events
- `createCustodialWallet(userId)` - Generate user wallet
