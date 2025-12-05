#!/usr/bin/env npx tsx
/**
 * Set up chainToIcon mappings on IconRegistry
 * 
 * This script maps chain IDs to their corresponding icon slugs so users
 * can look up chain icons by chain ID instead of knowing the exact slug.
 * 
 * Usage:
 *   DRY_RUN=true npx tsx scripts/setup-chain-mappings.ts   # Preview only
 *   npx tsx scripts/setup-chain-mappings.ts                 # Deploy mappings
 */

import * as fs from 'fs';
import * as path from 'path';
import { createPublicClient, http, encodeFunctionData, formatGwei, keccak256, toHex } from 'viem';
import { mainnet } from 'viem/chains';
import { createTurnkeySigner } from './turnkey-signer';

const PROXY_ADDRESS = '0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc' as const;
const RPC_URL = process.env.RPC_URL || 'https://eth.drpc.org';
const DRY_RUN = process.env.DRY_RUN === 'true';
const BATCH_SIZE = 20; // mapChain calls per tx (uses mapChainBatch if available, else individual)

const ICON_REGISTRY_ABI = [
    {
        name: 'mapChain',
        type: 'function',
        inputs: [
            { name: 'chainId', type: 'uint256' },
            { name: 'slug', type: 'string' },
        ],
        outputs: [],
    },
    {
        name: 'chainToIcon',
        type: 'function',
        inputs: [{ name: 'chainId', type: 'uint256' }],
        outputs: [{ type: 'bytes32' }],
    },
    {
        name: 'icons',
        type: 'function',
        inputs: [{ name: 'slugHash', type: 'bytes32' }],
        outputs: [
            { name: 'pointer', type: 'address' },
            { name: 'size', type: 'uint32' },
            { name: 'width', type: 'uint32' },
            { name: 'height', type: 'uint32' },
        ],
    },
] as const;

// Chain ID to slug mappings (generated from DefiLlama chainlist)
const CHAIN_MAPPINGS: Array<{ chainId: number; slug: string }> = [
    { chainId: 1, slug: "chains/rszethereum" },
    { chainId: 10, slug: "chains/rszoptimism" },
    { chainId: 14, slug: "chains/rszflare" },
    { chainId: 19, slug: "chains/rszsongbird" },
    { chainId: 20, slug: "chains/rszelastos" },
    { chainId: 25, slug: "chains/rszcronos" },
    { chainId: 30, slug: "chains/rszrsk" },
    { chainId: 40, slug: "chains/rsztelos" },
    { chainId: 42, slug: "chains/rszlukso" },
    { chainId: 44, slug: "chains/rszcrab" },
    { chainId: 46, slug: "chains/rszdarwinia" },
    { chainId: 50, slug: "chains/rszxdc" },
    { chainId: 52, slug: "chains/rszcsc" },
    { chainId: 56, slug: "chains/rszbinance" },
    { chainId: 57, slug: "chains/rszsyscoin" },
    { chainId: 58, slug: "chains/rszontologyevm" },
    { chainId: 60, slug: "chains/rszgochain" },
    { chainId: 61, slug: "chains/rszethereumclassic" },
    { chainId: 66, slug: "chains/rszokexchain" },
    { chainId: 82, slug: "chains/rszmeter" },
    { chainId: 88, slug: "chains/rsztomochain" },
    { chainId: 100, slug: "chains/rszxdai" },
    { chainId: 106, slug: "chains/rszvelas" },
    { chainId: 108, slug: "chains/rszthundercore" },
    { chainId: 119, slug: "chains/rszenuls" },
    { chainId: 122, slug: "chains/rszfuse" },
    { chainId: 128, slug: "chains/rszheco" },
    { chainId: 130, slug: "chains/rszunichain" },
    { chainId: 137, slug: "chains/rszpolygon" },
    { chainId: 143, slug: "chains/rszmonad" },
    { chainId: 146, slug: "chains/rszsonic" },
    { chainId: 148, slug: "chains/rszshimmerevm" },
    { chainId: 169, slug: "chains/rszmanta" },
    { chainId: 173, slug: "chains/rszeni" },
    { chainId: 185, slug: "chains/rszmint" },
    { chainId: 199, slug: "chains/rszbittorrent" },
    { chainId: 204, slug: "chains/rszopbnb" },
    { chainId: 207, slug: "chains/rszvinuchain" },
    { chainId: 225, slug: "chains/rszlachain" },
    { chainId: 232, slug: "chains/rszlens" },
    { chainId: 246, slug: "chains/rszenergyweb" },
    { chainId: 248, slug: "chains/rszoasys" },
    { chainId: 250, slug: "chains/rszfantom" },
    { chainId: 252, slug: "chains/rszfraxtal" },
    { chainId: 254, slug: "chains/rszswan" },
    { chainId: 255, slug: "chains/rszkroma" },
    { chainId: 269, slug: "chains/rszhpb" },
    { chainId: 277, slug: "chains/rszprom" },
    { chainId: 288, slug: "chains/rszboba" },
    { chainId: 291, slug: "chains/rszorderly" },
    { chainId: 295, slug: "chains/rszhedera" },
    { chainId: 314, slug: "chains/rszfilecoin" },
    { chainId: 321, slug: "chains/rszkucoin" },
    { chainId: 336, slug: "chains/rszshiden" },
    { chainId: 360, slug: "chains/rszshape" },
    { chainId: 361, slug: "chains/rsztheta" },
    { chainId: 369, slug: "chains/rszpulse" },
    { chainId: 388, slug: "chains/rszcronoszkevm" },
    { chainId: 416, slug: "chains/rszsx" },
    { chainId: 478, slug: "chains/rszformnetwork" },
    { chainId: 570, slug: "chains/rszrollux" },
    { chainId: 592, slug: "chains/rszastar" },
    { chainId: 648, slug: "chains/rszendurance" },
    { chainId: 690, slug: "chains/rszredstone" },
    { chainId: 698, slug: "chains/rszmatchain" },
    { chainId: 747, slug: "chains/rszflow" },
    { chainId: 820, slug: "chains/rszcallisto" },
    { chainId: 841, slug: "chains/rsztara" },
    { chainId: 888, slug: "chains/rszwanchain" },
    { chainId: 957, slug: "chains/rszlyra" },
    { chainId: 996, slug: "chains/rszbifrost" },
    { chainId: 999, slug: "chains/rszhyperliquid" },
    { chainId: 1024, slug: "chains/rszclv" },
    { chainId: 1030, slug: "chains/rszconflux" },
    { chainId: 1088, slug: "chains/rszmetis" },
    { chainId: 1101, slug: "chains/rszpolygonzkevm" },
    { chainId: 1116, slug: "chains/rszcore" },
    { chainId: 1135, slug: "chains/rszlisk" },
    { chainId: 1230, slug: "chains/rszultron" },
    { chainId: 1284, slug: "chains/rszmoonbeam" },
    { chainId: 1285, slug: "chains/rszmoonriver" },
    { chainId: 1329, slug: "chains/rszsei" },
    { chainId: 1440, slug: "chains/rszliving assets mainnet" },
    { chainId: 1453, slug: "chains/rszmetachain" },
    { chainId: 1514, slug: "chains/rszstory" },
    { chainId: 1625, slug: "chains/rszgravity" },
    { chainId: 1750, slug: "chains/rszmetallayer2" },
    { chainId: 1890, slug: "chains/rszlightlink" },
    { chainId: 1996, slug: "chains/rszsanko" },
    { chainId: 2000, slug: "chains/rszdogechain" },
    { chainId: 2020, slug: "chains/rszronin" },
    { chainId: 2040, slug: "chains/rszvanar" },
    { chainId: 2221, slug: "chains/rszkavatest" },
    { chainId: 2222, slug: "chains/rszkava" },
    { chainId: 2358, slug: "chains/rszkroma" },
    { chainId: 2741, slug: "chains/rszabstract" },
    { chainId: 3338, slug: "chains/rszpeaq" },
    { chainId: 3776, slug: "chains/rszastarzkevmmainnet" },
    { chainId: 4200, slug: "chains/rszmerlin" },
    { chainId: 4337, slug: "chains/rszbeam" },
    { chainId: 4689, slug: "chains/rsziotex" },
    { chainId: 5000, slug: "chains/rszmantle" },
    { chainId: 5165, slug: "chains/rszbahamut" },
    { chainId: 5330, slug: "chains/rszjustscan" },
    { chainId: 6001, slug: "chains/rszbounsafe" },
    { chainId: 6969, slug: "chains/rsztomb" },
    { chainId: 7000, slug: "chains/rszzetachain" },
    { chainId: 7171, slug: "chains/rszbitrock" },
    { chainId: 7518, slug: "chains/rszmew" },
    { chainId: 7560, slug: "chains/rszcyber" },
    { chainId: 7700, slug: "chains/rszcanto" },
    { chainId: 7777, slug: "chains/rszrise" },
    { chainId: 7887, slug: "chains/rszkinto" },
    { chainId: 8008, slug: "chains/rszpolynomialfi" },
    { chainId: 8081, slug: "chains/rszshardeum" },
    { chainId: 8217, slug: "chains/rszklaytn" },
    { chainId: 8329, slug: "chains/rszlorenzo" },
    { chainId: 8333, slug: "chains/rszb3" },
    { chainId: 8428, slug: "chains/rszclique" },
    { chainId: 8453, slug: "chains/rszbase" },
    { chainId: 8822, slug: "chains/rsziota" },
    { chainId: 8899, slug: "chains/rszjibchain" },
    { chainId: 9001, slug: "chains/rszevmos" },
    { chainId: 9790, slug: "chains/rszcarboncopy" },
    { chainId: 10000, slug: "chains/rszsmartbch" },
    { chainId: 10143, slug: "chains/rszmonadtest" },
    { chainId: 10200, slug: "chains/rszhikochiaori" },
    { chainId: 10242, slug: "chains/rszarthera" },
    { chainId: 10849, slug: "chains/rszlamina1" },
    { chainId: 11011, slug: "chains/rszshape" },
    { chainId: 11235, slug: "chains/rszhaqqmainnet" },
    { chainId: 12020, slug: "chains/rszaternos" },
    { chainId: 12324, slug: "chains/rszl3x" },
    { chainId: 12553, slug: "chains/rszrss3" },
    { chainId: 13371, slug: "chains/rszimmutablezkevm" },
    { chainId: 13381, slug: "chains/rszphoenix" },
    { chainId: 15557, slug: "chains/rszeos" },
    { chainId: 17000, slug: "chains/rszholesky" },
    { chainId: 17777, slug: "chains/rszeos" },
    { chainId: 18071, slug: "chains/rszmxtc" },
    { chainId: 22222, slug: "chains/rszhypra" },
    { chainId: 22776, slug: "chains/rszmap" },
    { chainId: 23294, slug: "chains/rszoasissapphire" },
    { chainId: 23451, slug: "chains/rszdrivechains" },
    { chainId: 23888, slug: "chains/rszblastart" },
    { chainId: 25925, slug: "chains/rszbikontestnet" },
    { chainId: 32520, slug: "chains/rszbitgert" },
    { chainId: 32659, slug: "chains/rszfusion" },
    { chainId: 32769, slug: "chains/rszzilliqa" },
    { chainId: 33139, slug: "chains/rszapes" },
    { chainId: 33979, slug: "chains/rszfunki" },
    { chainId: 34443, slug: "chains/rszmode" },
    { chainId: 35011, slug: "chains/rszj2o" },
    { chainId: 39656, slug: "chains/rszprm" },
    { chainId: 39797, slug: "chains/rszenergimainnet" },
    { chainId: 41455, slug: "chains/rszaleph zero" },
    { chainId: 42161, slug: "chains/rszarbitrum" },
    { chainId: 42170, slug: "chains/rszarbitrumnova" },
    { chainId: 42220, slug: "chains/rszcelo" },
    { chainId: 42262, slug: "chains/rszoasisemerald" },
    { chainId: 42766, slug: "chains/rszzkfair" },
    { chainId: 43113, slug: "chains/rszfuji" },
    { chainId: 43114, slug: "chains/rszavalanche" },
    { chainId: 43288, slug: "chains/rszbobafuji" },
    { chainId: 44787, slug: "chains/rszceloalfajores" },
    { chainId: 45000, slug: "chains/rszautobahn" },
    { chainId: 47805, slug: "chains/rszrei" },
    { chainId: 48900, slug: "chains/rszzircuit" },
    { chainId: 52014, slug: "chains/rszelectroneum" },
    { chainId: 53457, slug: "chains/rszdodochaintest" },
    { chainId: 53935, slug: "chains/rszdfk" },
    { chainId: 55244, slug: "chains/rszsuperposition" },
    { chainId: 57073, slug: "chains/rszink" },
    { chainId: 59144, slug: "chains/rszlinea" },
    { chainId: 60808, slug: "chains/rszbob" },
    { chainId: 61166, slug: "chains/rszpalette" },
    { chainId: 62621, slug: "chains/rszmvx" },
    { chainId: 63000, slug: "chains/rszecredits" },
    { chainId: 71402, slug: "chains/rszgodwoken" },
    { chainId: 80002, slug: "chains/rszpolygonamoy" },
    { chainId: 80084, slug: "chains/rszberachaintest" },
    { chainId: 80094, slug: "chains/rszberachain" },
    { chainId: 81457, slug: "chains/rszblast" },
    { chainId: 88888, slug: "chains/rszchiliz" },
    { chainId: 98866, slug: "chains/rszplume" },
    { chainId: 100000, slug: "chains/rszquarkchain" },
    { chainId: 111188, slug: "chains/rszre.al" },
    { chainId: 128123, slug: "chains/rszetherlink" },
    { chainId: 131313, slug: "chains/rszodysseychain" },
    { chainId: 167000, slug: "chains/rsztaiko" },
    { chainId: 200901, slug: "chains/rszbitlayer" },
    { chainId: 210425, slug: "chains/rszplaton" },
    { chainId: 245022934, slug: "chains/rszneon" },
    { chainId: 333000333, slug: "chains/rszmeld" },
    { chainId: 534352, slug: "chains/rszscroll" },
    { chainId: 555666, slug: "chains/rszeclipse" },
    { chainId: 570999, slug: "chains/rsztest" },
    { chainId: 622277, slug: "chains/rszhypra" },
    { chainId: 660279, slug: "chains/rszxai" },
    { chainId: 713715, slug: "chains/rszseidevnet" },
    { chainId: 810180, slug: "chains/rszzklinknova" },
    { chainId: 7225878, slug: "chains/rszsaakuru" },
    { chainId: 7777777, slug: "chains/rszzora" },
    { chainId: 11155111, slug: "chains/rszsepolia" },
    { chainId: 11155420, slug: "chains/rszopsepolia" },
    { chainId: 245022926, slug: "chains/rszneondevnet" },
    { chainId: 666666666, slug: "chains/rszdegen" },
    { chainId: 728126428, slug: "chains/rsztron" },
    { chainId: 1313161554, slug: "chains/rszaurora" },
    { chainId: 1666600000, slug: "chains/rszharmony" },
];

async function main() {
    console.log('=== IconRegistry Chain Mapping Setup ===\n');
    console.log(`Dry run: ${DRY_RUN}`);
    console.log(`Total mappings: ${CHAIN_MAPPINGS.length}`);
    console.log(`RPC: ${RPC_URL}\n`);

    const publicClient = createPublicClient({
        chain: mainnet,
        transport: http(RPC_URL),
    });

    // Check which mappings already exist
    console.log('Checking existing mappings...');
    const toSet: typeof CHAIN_MAPPINGS = [];
    
    for (const mapping of CHAIN_MAPPINGS) {
        const existing = await publicClient.readContract({
            address: PROXY_ADDRESS,
            abi: ICON_REGISTRY_ABI,
            functionName: 'chainToIcon',
            args: [BigInt(mapping.chainId)],
        });
        
        const expectedHash = keccak256(toHex(mapping.slug));
        if (existing.toLowerCase() !== expectedHash.toLowerCase()) {
            toSet.push(mapping);
        }
    }

    console.log(`Already set: ${CHAIN_MAPPINGS.length - toSet.length}`);
    console.log(`Need to set: ${toSet.length}\n`);

    if (toSet.length === 0) {
        console.log('All chain mappings already set!');
        return;
    }

    if (DRY_RUN) {
        console.log('Dry run - would set these mappings:');
        toSet.slice(0, 20).forEach(m => console.log(`  ${m.chainId} => ${m.slug}`));
        if (toSet.length > 20) console.log(`  ... and ${toSet.length - 20} more`);
        return;
    }

    // Initialize Turnkey signer
    console.log('Initializing Turnkey signer...');
    const { client: walletClient, address } = await createTurnkeySigner({ rpcUrl: RPC_URL });
    console.log(`Signer: ${address}\n`);

    // Send transactions one by one (mapChain doesn't have batch version)
    let success = 0;
    let failed = 0;

    for (let i = 0; i < toSet.length; i++) {
        const mapping = toSet[i];
        
        try {
            const data = encodeFunctionData({
                abi: ICON_REGISTRY_ABI,
                functionName: 'mapChain',
                args: [BigInt(mapping.chainId), mapping.slug],
            });

            const gasEstimate = await publicClient.estimateGas({
                account: address,
                to: PROXY_ADDRESS,
                data,
            });

            const nonce = await publicClient.getTransactionCount({ address });
            const gasPrice = await publicClient.getGasPrice();

            const txHash = await walletClient.sendTransaction({
                to: PROXY_ADDRESS,
                data,
                gas: gasEstimate + (gasEstimate * 20n / 100n),
                gasPrice: gasPrice + (gasPrice * 10n / 100n),
                nonce,
            });

            await publicClient.waitForTransactionReceipt({
                hash: txHash,
                timeout: 60_000,
            });

            success++;
            console.log(`[${i + 1}/${toSet.length}] ✓ Chain ${mapping.chainId} => ${mapping.slug}`);
        } catch (err: any) {
            failed++;
            console.log(`[${i + 1}/${toSet.length}] ✗ Chain ${mapping.chainId} failed: ${err.message?.slice(0, 50)}`);
        }

        // Small delay between txs
        await new Promise(r => setTimeout(r, 300));
    }

    console.log('\n=== Complete ===');
    console.log(`Success: ${success}`);
    console.log(`Failed: ${failed}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
