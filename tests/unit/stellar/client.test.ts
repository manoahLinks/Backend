/**
 * Unit tests for src/stellar/client.ts
 *
 * All Stellar SDK interactions are mocked — no real blockchain calls.
 */

// ─── Mock Stellar SDK ────────────────────────────────────────────────────────

const mockSendTransaction = jest.fn();
const mockGetTransaction = jest.fn();
const mockRpcServerInstance = {
  sendTransaction: mockSendTransaction,
  getTransaction: mockGetTransaction,
};

jest.mock('@stellar/stellar-sdk', () => ({
  rpc: {
    Server: jest.fn().mockImplementation(() => mockRpcServerInstance),
  },
  Keypair: {
    fromSecret: jest.fn().mockReturnValue({
      publicKey: () => 'GMOCK_PUBLIC_KEY',
    }),
    fromPublicKey: jest.fn(),
  },
  Networks: {
    PUBLIC: 'Public Global Stellar Network ; September 2015',
    TESTNET: 'Test SDF Network ; September 2015',
    FUTURENET: 'Test SDF Future Network ; October 2022',
  },
  Transaction: jest.fn(),
  TransactionBuilder: jest.fn(),
}));

import { rpc, Keypair } from '@stellar/stellar-sdk';
import {
  getRpcServer,
  getNetworkPassphrase,
  getAgentKeypair,
  submitTransaction,
  waitForConfirmation,
  resolveNetworkPassphrase,
} from '../../../src/stellar/client';

describe('Stellar Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore sendTransaction default
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'mock-hash' });
    mockGetTransaction.mockResolvedValue({ status: 'NOT_FOUND' });
  });

  // ── getRpcServer ──────────────────────────────────────────────────────────

  describe('getRpcServer()', () => {
    it('returns an rpc.Server instance', () => {
      const server = getRpcServer();
      expect(server).toBeDefined();
    });

    it('returns the same cached instance on repeated calls', () => {
      const s1 = getRpcServer();
      const s2 = getRpcServer();
      expect(s1).toBe(s2);
    });
  });

  // ── getNetworkPassphrase ──────────────────────────────────────────────────

  describe('getNetworkPassphrase()', () => {
    it('returns a non-empty string', () => {
      const passphrase = getNetworkPassphrase();
      expect(typeof passphrase).toBe('string');
      expect(passphrase.length).toBeGreaterThan(0);
    });
  });

  // ── resolveNetworkPassphrase ───────────────────────────────────────────────

  describe('resolveNetworkPassphrase()', () => {
    it('returns PUBLIC passphrase for mainnet', () => {
      expect(resolveNetworkPassphrase('mainnet')).toBe(
        'Public Global Stellar Network ; September 2015',
      );
    });

    it('returns TESTNET passphrase for testnet', () => {
      expect(resolveNetworkPassphrase('testnet')).toBe(
        'Test SDF Network ; September 2015',
      );
    });

    it('returns FUTURENET passphrase for futurenet', () => {
      expect(resolveNetworkPassphrase('futurenet')).toBe(
        'Test SDF Future Network ; October 2022',
      );
    });

    it('throws for unknown network value', () => {
      expect(() => resolveNetworkPassphrase('badnet')).toThrow(
        'Unknown STELLAR_NETWORK: "badnet"',
      );
    });

    it('throws for undefined network value', () => {
      expect(() => resolveNetworkPassphrase(undefined)).toThrow(
        'Unknown STELLAR_NETWORK',
      );
    });
  });

  // ── getAgentKeypair ───────────────────────────────────────────────────────

  describe('getAgentKeypair()', () => {
    it('returns a keypair when STELLAR_AGENT_SECRET_KEY is configured', () => {
      process.env.STELLAR_AGENT_SECRET_KEY = 'SMOCK_SECRET_KEY_FOR_TESTS_ONLY';
      expect(() => getAgentKeypair()).not.toThrow();
    });

    it('the returned keypair exposes publicKey()', () => {
      process.env.STELLAR_AGENT_SECRET_KEY = 'SMOCK_SECRET_KEY_FOR_TESTS_ONLY';
      const keypair = getAgentKeypair();
      expect(typeof keypair.publicKey()).toBe('string');
    });
  });

  // ── submitTransaction ─────────────────────────────────────────────────────

  describe('submitTransaction()', () => {
    it('resolves with transaction hash on success', async () => {
      mockSendTransaction.mockResolvedValue({
        status: 'PENDING',
        hash: 'abc123hash',
      });
      const tx = {} as any; // real Transaction not needed — SDK is mocked
      const hash = await submitTransaction(tx);
      expect(hash).toBe('abc123hash');
    });

    it('throws when server returns ERROR status', async () => {
      mockSendTransaction.mockResolvedValue({
        status: 'ERROR',
        errorResult: { toXDR: () => 'AAAAAAA=' },
      });
      await expect(submitTransaction({} as any)).rejects.toThrow(
        'Transaction failed',
      );
    });

    it('throws when server.sendTransaction rejects', async () => {
      mockSendTransaction.mockRejectedValue(new Error('network unreachable'));
      await expect(submitTransaction({} as any)).rejects.toThrow(
        'Failed to submit transaction',
      );
    });

    it('calls server.sendTransaction with the provided transaction', async () => {
      mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'x' });
      const tx = { fake: true } as any;
      await submitTransaction(tx);
      expect(mockSendTransaction).toHaveBeenCalledWith(tx);
    });
  });

  // ── waitForConfirmation ───────────────────────────────────────────────────

  describe('waitForConfirmation()', () => {
    it('resolves with success status when transaction succeeds', async () => {
      mockGetTransaction.mockResolvedValue({ status: 'SUCCESS', ledger: 999 });
      const result = await waitForConfirmation('abc123', 5_000);
      expect(result.status).toBe('success');
      expect(result.hash).toBe('abc123');
      expect(result.ledger).toBe(999);
    });

    it('resolves with failed status when transaction fails', async () => {
      mockGetTransaction.mockResolvedValue({ status: 'FAILED' });
      const result = await waitForConfirmation('failhash', 5_000);
      expect(result.status).toBe('failed');
    });

    it('throws on timeout when transaction never confirms', async () => {
      // Always return NOT_FOUND so the loop runs until timeout
      mockGetTransaction.mockResolvedValue({ status: 'NOT_FOUND' });
      await expect(
        waitForConfirmation('timedouthash', 100),
      ).rejects.toThrow(/timeout/i);
    });

    it('throws when getTransaction rejects', async () => {
      mockGetTransaction.mockRejectedValue(new Error('RPC down'));
      await expect(
        waitForConfirmation('errhash', 5_000),
      ).rejects.toThrow('Error polling transaction');
    });

    it('polls until a definitive status is received', async () => {
      mockGetTransaction
        .mockResolvedValueOnce({ status: 'NOT_FOUND' })
        .mockResolvedValueOnce({ status: 'NOT_FOUND' })
        .mockResolvedValueOnce({ status: 'SUCCESS', ledger: 42 });
      const result = await waitForConfirmation('polledhash', 10_000);
      expect(result.status).toBe('success');
      expect(mockGetTransaction).toHaveBeenCalledTimes(3);
    });
  });
});
