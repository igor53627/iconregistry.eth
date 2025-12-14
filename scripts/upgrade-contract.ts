#!/usr/bin/env npx tsx
/**
 * Upgrade IconRegistry to a new implementation
 * 
 * This script deploys a new implementation contract and calls upgradeTo on the proxy.
 * Uses Turnkey for secure signing.
 * 
 * Usage:
 *   DRY_RUN=true npx tsx scripts/upgrade-contract.ts   # Preview only
 *   npx tsx scripts/upgrade-contract.ts                 # Deploy upgrade
 * 
 * Environment:
 *   TURNKEY_API_PUBLIC_KEY, TURNKEY_API_PRIVATE_KEY, TURNKEY_ORGANIZATION_ID, TURNKEY_SIGN_WITH
 *   RPC_URL (optional, defaults to public RPC)
 *   MAX_GAS_PRICE_GWEI (optional, defaults to 0.1)
 */

import * as fs from 'fs';
import * as path from 'path';
import { createPublicClient, http, encodeFunctionData, formatGwei, parseGwei, keccak256 } from 'viem';
import { mainnet } from 'viem/chains';
import { createTurnkeySigner } from './turnkey-signer';
import { execSync } from 'child_process';

const PROXY_ADDRESS = '0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc' as const;
const RPC_URL = process.env.RPC_URL || 'https://ethereum-rpc.publicnode.com';
const FALLBACK_RPC_URL = 'https://eth.drpc.org';
const DRY_RUN = process.env.DRY_RUN === 'true';
const MAX_GAS_PRICE_GWEI = parseFloat(process.env.MAX_GAS_PRICE_GWEI || '0.1');

const UUPS_ABI = [
    {
        name: 'upgradeToAndCall',
        type: 'function',
        inputs: [
            { name: 'newImplementation', type: 'address' },
            { name: 'data', type: 'bytes' },
        ],
        outputs: [],
    },
    {
        name: 'owner',
        type: 'function',
        inputs: [],
        outputs: [{ type: 'address' }],
    },
] as const;

// ERC1967 implementation slot
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function createRpcClient(primary: string, fallback: string) {
    const { fallback: viemFallback } = await import('viem');
    return createPublicClient({
        chain: mainnet,
        transport: viemFallback([http(primary), http(fallback)]),
    });
}

async function getCurrentImplementation(client: ReturnType<typeof createPublicClient>): Promise<string> {
    const storage = await client.getStorageAt({
        address: PROXY_ADDRESS,
        slot: IMPLEMENTATION_SLOT as `0x${string}`,
    });
    // Storage is 32 bytes, address is last 20 bytes
    return '0x' + storage!.slice(-40);
}

async function deployNewImplementation(signerAddress: string): Promise<string> {
    console.log('Compiling contracts...');
    execSync('forge build', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    
    // Read compiled bytecode
    const artifactPath = path.join(__dirname, '..', 'out', 'IconRegistry.sol', 'IconRegistry.json');
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Artifact not found: ${artifactPath}. Run 'forge build' first.`);
    }
    
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
    const bytecode = artifact.bytecode.object as `0x${string}`;
    
    console.log(`Bytecode size: ${(bytecode.length - 2) / 2} bytes`);
    
    return bytecode;
}

async function main() {
    console.log('=== IconRegistry Contract Upgrade ===\n');
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE UPGRADE'}`);
    console.log(`Proxy: ${PROXY_ADDRESS}`);
    console.log(`Max gas: ${MAX_GAS_PRICE_GWEI} gwei`);
    console.log(`RPC: ${RPC_URL}\n`);

    const publicClient = await createRpcClient(RPC_URL, FALLBACK_RPC_URL);

    // Get current implementation
    const currentImpl = await getCurrentImplementation(publicClient);
    console.log(`Current implementation: ${currentImpl}`);

    // Get owner
    const owner = await publicClient.readContract({
        address: PROXY_ADDRESS,
        abi: UUPS_ABI,
        functionName: 'owner',
    });
    console.log(`Owner: ${owner}\n`);

    // Compile and get new bytecode
    console.log('Building new implementation...');
    execSync('forge build', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    
    const artifactPath = path.join(__dirname, '..', 'out', 'IconRegistry.sol', 'IconRegistry.json');
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
    const bytecode = artifact.bytecode.object as `0x${string}`;
    const newBytecodeHash = keccak256(bytecode);
    
    console.log(`New bytecode size: ${(bytecode.length - 2) / 2} bytes`);
    console.log(`New bytecode hash: ${newBytecodeHash}\n`);

    if (DRY_RUN) {
        console.log('=== DRY RUN ===');
        console.log('Would deploy new implementation and upgrade proxy.');
        console.log('Run without DRY_RUN=true to execute.');
        return;
    }

    // Initialize Turnkey signer
    console.log('Initializing Turnkey signer...');
    const { client: walletClient, address } = await createTurnkeySigner({ rpcUrl: RPC_URL });
    console.log(`Signer: ${address}`);

    if (address.toLowerCase() !== owner.toLowerCase()) {
        throw new Error(`Signer ${address} is not the owner ${owner}`);
    }

    // Wait for acceptable gas price
    const maxGasWei = parseGwei(MAX_GAS_PRICE_GWEI.toString());
    let gasPrice: bigint;

    console.log('\nWaiting for acceptable gas price...');
    while (true) {
        gasPrice = await publicClient.getGasPrice();
        if (gasPrice <= maxGasWei) break;
        process.stdout.write(`\rGas: ${formatGwei(gasPrice)} gwei > ${MAX_GAS_PRICE_GWEI} gwei - waiting...    `);
        await sleep(6000);
    }
    console.log(`Gas: ${formatGwei(gasPrice)} gwei [OK]`);

    // Step 1: Deploy new implementation
    console.log('\n[1/2] Deploying new implementation...');
    
    const deployGasEstimate = await publicClient.estimateGas({
        account: address,
        data: bytecode,
    });
    console.log(`Estimated gas: ${deployGasEstimate.toLocaleString()}`);

    const nonce = await publicClient.getTransactionCount({ address });
    const bufferedGasPrice = gasPrice + (gasPrice * 10n / 100n);

    const deployTxHash = await walletClient.sendTransaction({
        data: bytecode,
        gas: deployGasEstimate + (deployGasEstimate * 20n / 100n),
        gasPrice: bufferedGasPrice,
        nonce,
    });
    console.log(`Deploy tx: ${deployTxHash}`);

    const deployReceipt = await publicClient.waitForTransactionReceipt({
        hash: deployTxHash,
        timeout: 300_000,
    });

    if (deployReceipt.status !== 'success') {
        throw new Error('Implementation deployment failed');
    }

    const newImplementation = deployReceipt.contractAddress!;
    console.log(`New implementation: ${newImplementation}`);
    console.log(`Gas used: ${deployReceipt.gasUsed.toLocaleString()}`);

    // Step 2: Upgrade proxy
    console.log('\n[2/2] Upgrading proxy...');

    const upgradeData = encodeFunctionData({
        abi: UUPS_ABI,
        functionName: 'upgradeToAndCall',
        args: [newImplementation, '0x'],
    });

    const upgradeGasEstimate = await publicClient.estimateGas({
        account: address,
        to: PROXY_ADDRESS,
        data: upgradeData,
    });

    const upgradeNonce = await publicClient.getTransactionCount({ address });
    
    const upgradeTxHash = await walletClient.sendTransaction({
        to: PROXY_ADDRESS,
        data: upgradeData,
        gas: upgradeGasEstimate + (upgradeGasEstimate * 20n / 100n),
        gasPrice: bufferedGasPrice,
        nonce: upgradeNonce,
    });
    console.log(`Upgrade tx: ${upgradeTxHash}`);

    const upgradeReceipt = await publicClient.waitForTransactionReceipt({
        hash: upgradeTxHash,
        timeout: 300_000,
    });

    if (upgradeReceipt.status !== 'success') {
        throw new Error('Proxy upgrade failed');
    }
    console.log(`Gas used: ${upgradeReceipt.gasUsed.toLocaleString()}`);

    // Verify upgrade
    const verifiedImpl = await getCurrentImplementation(publicClient);
    if (verifiedImpl.toLowerCase() !== newImplementation.toLowerCase()) {
        throw new Error(`Verification failed: expected ${newImplementation}, got ${verifiedImpl}`);
    }

    console.log('\n=== Upgrade Complete ===');
    console.log(`Old implementation: ${currentImpl}`);
    console.log(`New implementation: ${newImplementation}`);
    console.log(`Deploy tx: https://etherscan.io/tx/${deployTxHash}`);
    console.log(`Upgrade tx: https://etherscan.io/tx/${upgradeTxHash}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
