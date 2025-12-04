/**
 * Turnkey Setup Script
 * 
 * This script helps you set up Turnkey for the IconRegistry deployment.
 * It will:
 * 1. Create an API key for GitHub Actions (auto-approve for setIconsBatch)
 * 2. Create a policy that requires 2FA for sensitive operations
 * 
 * Prerequisites:
 * - Create a Turnkey account at https://app.turnkey.com
 * - Create an organization
 * - Create a wallet with an Ethereum address
 * - Create an API key and set the environment variables below
 * 
 * Usage:
 *   TURNKEY_API_PUBLIC_KEY=... TURNKEY_API_PRIVATE_KEY=... TURNKEY_ORGANIZATION_ID=... tsx scripts/turnkey-setup.ts
 */

import { Turnkey } from '@turnkey/sdk-server';

const ICON_REGISTRY_PROXY = '0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc';

async function main() {
    console.log('=== Turnkey Setup for IconRegistry ===\n');

    // Validate environment
    const requiredEnvVars = [
        'TURNKEY_API_PUBLIC_KEY',
        'TURNKEY_API_PRIVATE_KEY', 
        'TURNKEY_ORGANIZATION_ID'
    ];

    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            console.error(`Missing required environment variable: ${envVar}`);
            console.error('\nTo set up Turnkey:');
            console.error('1. Go to https://app.turnkey.com');
            console.error('2. Create an organization (if you haven\'t)');
            console.error('3. Go to Settings > API Keys');
            console.error('4. Create a new API key');
            console.error('5. Set the environment variables and run this script again');
            process.exit(1);
        }
    }

    const turnkey = new Turnkey({
        apiBaseUrl: 'https://api.turnkey.com',
        apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY!,
        apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY!,
        defaultOrganizationId: process.env.TURNKEY_ORGANIZATION_ID!,
    });

    const client = turnkey.apiClient();

    // Get organization info
    console.log('Fetching organization info...');
    const whoami = await client.getWhoami({
        organizationId: process.env.TURNKEY_ORGANIZATION_ID!,
    });
    console.log(`Organization: ${whoami.organizationName}`);
    console.log(`User: ${whoami.userId}\n`);

    // List wallets
    console.log('Fetching wallets...');
    const walletsResponse = await client.getWallets({
        organizationId: process.env.TURNKEY_ORGANIZATION_ID!,
    });

    if (walletsResponse.wallets.length === 0) {
        console.log('\nNo wallets found. Please create a wallet in the Turnkey dashboard:');
        console.log('1. Go to https://app.turnkey.com');
        console.log('2. Navigate to Wallets');
        console.log('3. Create a new wallet with an Ethereum address');
        console.log('4. Fund the address and transfer IconRegistry ownership to it');
        process.exit(1);
    }

    console.log('\nAvailable wallets:');
    for (const wallet of walletsResponse.wallets) {
        console.log(`  - ${wallet.walletName} (${wallet.walletId})`);
        
        // Get accounts for this wallet
        const accountsResponse = await client.getWalletAccounts({
            organizationId: process.env.TURNKEY_ORGANIZATION_ID!,
            walletId: wallet.walletId,
        });
        
        for (const account of accountsResponse.accounts) {
            console.log(`    └─ ${account.address} (${account.addressFormat})`);
        }
    }

    console.log('\n=== Setup Instructions ===\n');
    
    console.log('1. WALLET ADDRESS');
    console.log('   Use one of the Ethereum addresses above as your signing address.');
    console.log(`   Set TURNKEY_SIGN_WITH=<address> in your environment.\n`);

    console.log('2. TRANSFER OWNERSHIP');
    console.log('   Transfer IconRegistry ownership to your Turnkey address:');
    console.log(`   cast send ${ICON_REGISTRY_PROXY} "transferOwnership(address)" <turnkey-address> --private-key <current-owner-key> --rpc-url https://eth.drpc.org\n`);

    console.log('3. CREATE POLICIES (in Turnkey Dashboard)');
    console.log('   Go to Settings > Policies and create:\n');
    
    console.log('   Policy 1: "IconRegistry Auto-Approve" (for GitHub Actions)');
    console.log('   - Effect: ALLOW');
    console.log('   - Consensus: None required');
    console.log('   - Condition:');
    console.log(`     eth.tx.to == "${ICON_REGISTRY_PROXY.toLowerCase()}" &&`);
    console.log('     eth.tx.data.startsWith("0x5e1e2be5")  // setIconsBatch selector\n');

    console.log('   Policy 2: "Require 2FA for Sensitive Ops"');
    console.log('   - Effect: ALLOW');
    console.log('   - Consensus: Require approval');
    console.log('   - Condition:');
    console.log(`     eth.tx.to == "${ICON_REGISTRY_PROXY.toLowerCase()}" &&`);
    console.log('     (eth.tx.data.startsWith("0x3659cfe6") ||  // upgradeTo');
    console.log('      eth.tx.data.startsWith("0x4f1ef286") ||  // upgradeToAndCall');
    console.log('      eth.tx.data.startsWith("0xf2fde38b"))    // transferOwnership\n');

    console.log('4. GITHUB SECRETS');
    console.log('   Add these secrets to your GitHub repository:');
    console.log('   - TURNKEY_API_PUBLIC_KEY');
    console.log('   - TURNKEY_API_PRIVATE_KEY');
    console.log('   - TURNKEY_ORGANIZATION_ID');
    console.log('   - TURNKEY_SIGN_WITH (your Ethereum address)\n');

    console.log('5. FUNCTION SELECTORS REFERENCE');
    console.log('   setIconsBatch:      0x5e1e2be5');
    console.log('   setIcon:            0x9d819e1a');
    console.log('   upgradeTo:          0x3659cfe6');
    console.log('   upgradeToAndCall:   0x4f1ef286');
    console.log('   transferOwnership:  0xf2fde38b');
    console.log('   removeIcon:         0x4cc82215\n');

    console.log('=== Configuration File ===\n');
    
    const configExample = {
        apiBaseUrl: 'https://api.turnkey.com',
        organizationId: process.env.TURNKEY_ORGANIZATION_ID,
        signWith: '<your-ethereum-address>',
    };
    
    console.log('Save this to .turnkey.json (git-ignored):');
    console.log(JSON.stringify(configExample, null, 2));
}

main().catch(console.error);
