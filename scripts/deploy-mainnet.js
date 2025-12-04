const { execSync } = require('child_process');
const https = require('https');
const http = require('http');

// MEV-protected RPCs (no sandwich attacks)
const MEV_RPCS = [
    'https://rpc.mevblocker.io',
    'https://eth.llamarpc.com',
    'https://eth.merkle.io'
];

const MAX_GAS_PRICE_GWEI = parseFloat(process.env.MAX_GAS_PRICE_GWEI) || 1.0;
const VAULT_ADDR = process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
const VAULT_TOKEN = process.env.VAULT_TOKEN;
const VAULT_PATH = process.env.VAULT_PATH || 'secret/data/iconregistry';

// Get private key from Vault or environment
async function getPrivateKey() {
    // First try environment variable
    if (process.env.PRIVATE_KEY) {
        console.log('Using PRIVATE_KEY from environment');
        return process.env.PRIVATE_KEY;
    }
    
    // Try Vault
    if (!VAULT_TOKEN) {
        console.error('No PRIVATE_KEY in environment and no VAULT_TOKEN for Vault access');
        console.error('\nOption 1: Set PRIVATE_KEY environment variable');
        console.error('Option 2: Use Vault:');
        console.error('  1. Start Vault: vault server -dev -dev-root-token-id=iconregistry');
        console.error('  2. Store key: VAULT_ADDR=http://127.0.0.1:8200 vault kv put secret/iconregistry private_key=0x...');
        console.error('  3. Run: VAULT_TOKEN=iconregistry node scripts/deploy-mainnet.js');
        process.exit(1);
    }
    
    console.log('Fetching private key from Vault...');
    
    return new Promise((resolve, reject) => {
        const url = new URL(`${VAULT_ADDR}/v1/${VAULT_PATH}`);
        const client = url.protocol === 'https:' ? https : http;
        
        const req = client.get(url, {
            headers: { 'X-Vault-Token': VAULT_TOKEN }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.errors) {
                        reject(new Error(`Vault error: ${json.errors.join(', ')}`));
                        return;
                    }
                    const key = json.data?.data?.private_key || json.data?.private_key;
                    if (!key) {
                        reject(new Error('private_key not found in Vault response'));
                        return;
                    }
                    console.log('Private key retrieved from Vault');
                    resolve(key);
                } catch (e) {
                    reject(new Error(`Failed to parse Vault response: ${e.message}`));
                }
            });
        });
        req.on('error', reject);
    });
}

async function getGasPrice(rpc) {
    const cmd = `cast gas-price --rpc-url ${rpc}`;
    const result = execSync(cmd).toString().trim();
    return BigInt(result);
}

async function checkRpcHealth(rpc) {
    try {
        const cmd = `cast block-number --rpc-url ${rpc}`;
        execSync(cmd, { timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

async function selectRpc() {
    for (const rpc of MEV_RPCS) {
        console.log(`Checking ${rpc}...`);
        if (await checkRpcHealth(rpc)) {
            console.log(`Using: ${rpc}`);
            return rpc;
        }
    }
    throw new Error('No healthy RPC available');
}

async function waitForGasPrice(rpc, maxGwei) {
    const maxWei = BigInt(Math.floor(maxGwei * 1e9));
    console.log(`Waiting for gas price <= ${maxGwei} gwei...`);
    
    while (true) {
        const gasPrice = await getGasPrice(rpc);
        const gasPriceGwei = Number(gasPrice) / 1e9;
        
        if (gasPrice <= maxWei) {
            console.log(`Gas price: ${gasPriceGwei.toFixed(4)} gwei - GOOD`);
            return gasPrice;
        }
        
        console.log(`Gas price: ${gasPriceGwei.toFixed(4)} gwei - waiting...`);
        await new Promise(r => setTimeout(r, 12000)); // Wait 1 block
    }
}

async function deployAtomic(rpc, gasPrice, privateKey) {
    console.log('\n=== Deploying IconRegistry (Atomic) ===\n');
    
    // Get deployer address
    const deployer = execSync(`cast wallet address --private-key ${privateKey}`).toString().trim();
    console.log('Deployer:', deployer);
    
    // Check balance
    const balance = execSync(`cast balance ${deployer} --rpc-url ${rpc}`).toString().trim();
    const balanceEth = (Number(balance) / 1e18).toFixed(6);
    console.log('Balance:', balanceEth, 'ETH');
    
    // Deploy using forge script with atomic deployer
    const gasPriceGwei = Number(gasPrice) / 1e9;
    console.log(`\nDeploying with gas price: ${gasPriceGwei.toFixed(4)} gwei`);
    
    const cmd = [
        'forge script scripts/Deploy.s.sol:DeployAtomic',
        `--rpc-url ${rpc}`,
        '--broadcast',
        `--gas-price ${gasPrice}`,
        '--slow', // Wait for each tx to confirm
        '-vvv'
    ].join(' ');
    
    console.log('\nRunning: forge script scripts/Deploy.s.sol:DeployAtomic --broadcast ...');
    
    try {
        execSync(cmd, { 
            stdio: 'inherit',
            env: { ...process.env, PRIVATE_KEY: privateKey }
        });
        console.log('\nDeployment successful!');
        return { deployer };
    } catch (err) {
        console.error('\nDeployment failed:', err.message);
        process.exit(1);
    }
}

async function getDeployedAddresses() {
    // Parse broadcast file for deployed addresses
    const broadcastDir = 'broadcast/Deploy.s.sol/1';
    const fs = require('fs');
    const path = require('path');
    
    try {
        const files = fs.readdirSync(broadcastDir).filter(f => f.endsWith('.json') && f.startsWith('run-'));
        if (files.length === 0) return null;
        
        // Get latest broadcast
        const latest = files.sort().pop();
        const data = JSON.parse(fs.readFileSync(path.join(broadcastDir, latest)));
        
        const addresses = {};
        for (const tx of data.transactions || []) {
            if (tx.contractName === 'IconRegistryDeployer') {
                addresses.factory = tx.contractAddress;
            } else if (tx.contractName === 'IconRegistry') {
                addresses.implementation = tx.contractAddress;
            } else if (tx.contractName === 'ERC1967Proxy') {
                addresses.proxy = tx.contractAddress;
            }
        }
        
        // Also check receipts for CREATE events from factory
        for (const receipt of data.receipts || []) {
            // Factory deploy creates impl + proxy internally
            if (receipt.logs) {
                for (const log of receipt.logs) {
                    if (log.topics[0] === '0x' + 'Deployed'.padEnd(64, '0')) {
                        // Parse Deployed event
                    }
                }
            }
        }
        
        return addresses;
    } catch (err) {
        console.error('Could not parse broadcast:', err.message);
        return null;
    }
}

async function verifySourcify(addresses) {
    console.log('\n=== Verifying on Sourcify ===\n');
    
    if (!addresses || !addresses.implementation) {
        console.log('No addresses found. Manual verification required.');
        console.log('\nTo verify manually:');
        console.log('forge verify-contract <IMPLEMENTATION_ADDRESS> contracts/IconRegistry.sol:IconRegistry --verifier sourcify --chain 1');
        return;
    }
    
    // Verify implementation contract
    console.log('Verifying IconRegistry implementation...');
    try {
        const cmd = [
            'forge verify-contract',
            addresses.implementation,
            'contracts/IconRegistry.sol:IconRegistry',
            '--verifier sourcify',
            '--chain 1'
        ].join(' ');
        
        execSync(cmd, { stdio: 'inherit' });
        console.log('Implementation verified on Sourcify!');
    } catch (err) {
        console.error('Sourcify verification failed:', err.message);
        console.log('\nManual verification:');
        console.log(`forge verify-contract ${addresses.implementation} contracts/IconRegistry.sol:IconRegistry --verifier sourcify --chain 1`);
    }
    
    // Verify factory if deployed
    if (addresses.factory) {
        console.log('\nVerifying IconRegistryDeployer...');
        try {
            const cmd = [
                'forge verify-contract',
                addresses.factory,
                'scripts/Deploy.s.sol:IconRegistryDeployer',
                '--verifier sourcify',
                '--chain 1'
            ].join(' ');
            
            execSync(cmd, { stdio: 'inherit' });
            console.log('Factory verified on Sourcify!');
        } catch (err) {
            console.log('Factory verification skipped (optional)');
        }
    }
    
    console.log('\nView on Sourcify:');
    console.log(`https://sourcify.dev/#/lookup/${addresses.implementation}`);
    if (addresses.proxy) {
        console.log(`https://sourcify.dev/#/lookup/${addresses.proxy}`);
    }
}

async function main() {
    console.log('=== IconRegistry Mainnet Deployment ===\n');
    console.log('Max gas price:', MAX_GAS_PRICE_GWEI, 'gwei');
    
    // Get private key from Vault or environment
    const privateKey = await getPrivateKey();
    
    const rpc = await selectRpc();
    const gasPrice = await waitForGasPrice(rpc, MAX_GAS_PRICE_GWEI);
    await deployAtomic(rpc, gasPrice, privateKey);
    
    // Get deployed addresses and verify on Sourcify
    const addresses = await getDeployedAddresses();
    if (addresses) {
        console.log('\nDeployed addresses:');
        console.log('  Factory:', addresses.factory || 'N/A');
        console.log('  Implementation:', addresses.implementation || 'N/A');
        console.log('  Proxy:', addresses.proxy || 'N/A');
    }
    
    await verifySourcify(addresses);
    
    console.log('\n=== Next Steps ===');
    console.log('1. Monitor Fusaka: node scripts/monitor-fusaka.js');
    console.log('2. After Fusaka, upload icons:');
    console.log(`   PROXY_ADDRESS=${addresses?.proxy || '<PROXY>'} MAX_GAS_PRICE_GWEI=0.05 node scripts/upload-icons-mainnet.js`);
}

main().catch(console.error);
