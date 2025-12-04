/**
 * Turnkey Signer Module
 * 
 * Provides a viem-compatible signer using Turnkey for secure key management.
 * Used by the deployment scripts to sign transactions without exposing private keys.
 */

import { Turnkey } from '@turnkey/sdk-server';
import { createAccount } from '@turnkey/viem';
import { createWalletClient, http, type WalletClient, type Chain, type Account } from 'viem';
import { mainnet } from 'viem/chains';

export interface TurnkeySignerConfig {
    apiPublicKey?: string;
    apiPrivateKey?: string;
    organizationId?: string;
    signWith?: string;
    rpcUrl?: string;
}

export async function createTurnkeySigner(config: TurnkeySignerConfig = {}): Promise<{
    client: WalletClient;
    account: Account;
    address: `0x${string}`;
}> {
    // Load from environment if not provided
    const apiPublicKey = config.apiPublicKey || process.env.TURNKEY_API_PUBLIC_KEY;
    const apiPrivateKey = config.apiPrivateKey || process.env.TURNKEY_API_PRIVATE_KEY;
    const organizationId = config.organizationId || process.env.TURNKEY_ORGANIZATION_ID;
    const signWith = config.signWith || process.env.TURNKEY_SIGN_WITH;
    const rpcUrl = config.rpcUrl || process.env.RPC_URL || 'https://eth.drpc.org';

    // Validate required config
    if (!apiPublicKey || !apiPrivateKey || !organizationId || !signWith) {
        throw new Error(
            'Missing Turnkey configuration. Required: TURNKEY_API_PUBLIC_KEY, TURNKEY_API_PRIVATE_KEY, TURNKEY_ORGANIZATION_ID, TURNKEY_SIGN_WITH'
        );
    }

    // Initialize Turnkey client
    const turnkey = new Turnkey({
        apiBaseUrl: 'https://api.turnkey.com',
        apiPublicKey,
        apiPrivateKey,
        defaultOrganizationId: organizationId,
    });

    // Create Turnkey account for viem
    const account = await createAccount({
        client: turnkey.apiClient(),
        organizationId,
        signWith,
    });

    // Create wallet client
    const client = createWalletClient({
        account,
        chain: mainnet,
        transport: http(rpcUrl),
    });

    return {
        client,
        account,
        address: account.address,
    };
}

/**
 * Sign a transaction and return the serialized signed transaction
 * Compatible with `cast publish`
 */
export async function signTransaction(
    client: WalletClient,
    tx: {
        to: `0x${string}`;
        data: `0x${string}`;
        value?: bigint;
        gas?: bigint;
        gasPrice?: bigint;
        maxFeePerGas?: bigint;
        maxPriorityFeePerGas?: bigint;
        nonce?: number;
    }
): Promise<`0x${string}`> {
    const account = client.account;
    if (!account) throw new Error('No account attached to client');

    const signedTx = await client.signTransaction({
        account,
        chain: mainnet,
        ...tx,
    });

    return signedTx;
}

// CLI usage
if (require.main === module) {
    (async () => {
        try {
            const { address } = await createTurnkeySigner();
            console.log(`Turnkey signer ready: ${address}`);
        } catch (err) {
            console.error('Failed to initialize Turnkey signer:', err);
            process.exit(1);
        }
    })();
}
