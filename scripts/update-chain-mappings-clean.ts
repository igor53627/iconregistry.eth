#!/usr/bin/env npx tsx
/**
 * Update Chain Mappings to Clean Slugs
 * 
 * After migrating icons to clean slugs, this script updates the chainToIcon
 * mappings to point to the new clean slugs instead of rsz-prefixed slugs.
 * 
 * Usage:
 *   DRY_RUN=true npx tsx scripts/update-chain-mappings-clean.ts   # Preview
 *   npx tsx scripts/update-chain-mappings-clean.ts                 # Deploy
 */

import { createPublicClient, http, encodeFunctionData, parseGwei, formatGwei, keccak256, toHex } from 'viem';
import { mainnet } from 'viem/chains';
import { createTurnkeySigner } from './turnkey-signer';

const PROXY_ADDRESS = '0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc' as const;
const RPC_URL = process.env.RPC_URL || 'https://ethereum-rpc.publicnode.com';
const FALLBACK_RPC_URL = 'https://eth.drpc.org';
const DRY_RUN = process.env.DRY_RUN === 'true';
const MAX_GAS_PRICE_GWEI = parseFloat(process.env.MAX_GAS_PRICE_GWEI || '0.05');

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
            { name: 'width', type: 'uint32' },
            { name: 'height', type: 'uint32' },
            { name: 'version', type: 'uint32' },
        ],
    },
] as const;

function cleanSlug(slug: string): string {
    const parts = slug.split('/');
    if (parts.length !== 2) return slug;
    
    const [category, name] = parts;
    const cleanName = name
        .replace(/^rsz_?/i, '')
        .replace(/^rsz/i, '')
        .toLowerCase();
    
    return `${category}/${cleanName}`;
}

// Updated chain mappings with clean slugs
const CHAIN_MAPPINGS: Array<{ chainId: number; oldSlug: string; newSlug: string; name: string }> = [
    { chainId: 1, oldSlug: "chains/rszethereum", newSlug: "chains/ethereum", name: "Ethereum" },
    { chainId: 10, oldSlug: "chains/rszoptimism", newSlug: "chains/optimism", name: "Optimism" },
    { chainId: 14, oldSlug: "chains/rszflare", newSlug: "chains/flare", name: "Flare" },
    { chainId: 19, oldSlug: "chains/rszsongbird", newSlug: "chains/songbird", name: "Songbird" },
    { chainId: 20, oldSlug: "chains/rszelastos", newSlug: "chains/elastos", name: "Elastos" },
    { chainId: 25, oldSlug: "chains/rszcronos", newSlug: "chains/cronos", name: "Cronos" },
    { chainId: 30, oldSlug: "chains/rszrsk", newSlug: "chains/rsk", name: "RSK" },
    { chainId: 40, oldSlug: "chains/rsztelos", newSlug: "chains/telos", name: "Telos" },
    { chainId: 42, oldSlug: "chains/rszlukso", newSlug: "chains/lukso", name: "LUKSO" },
    { chainId: 44, oldSlug: "chains/rszcrab", newSlug: "chains/crab", name: "Crab" },
    { chainId: 46, oldSlug: "chains/rszdarwinia", newSlug: "chains/darwinia", name: "Darwinia" },
    { chainId: 50, oldSlug: "chains/rszxdc", newSlug: "chains/xdc", name: "XDC" },
    { chainId: 52, oldSlug: "chains/rszcsc", newSlug: "chains/csc", name: "CSC" },
    { chainId: 56, oldSlug: "chains/rszbinance", newSlug: "chains/binance", name: "BNB Chain" },
    { chainId: 57, oldSlug: "chains/rszsyscoin", newSlug: "chains/syscoin", name: "Syscoin" },
    { chainId: 58, oldSlug: "chains/rszontologyevm", newSlug: "chains/ontologyevm", name: "Ontology EVM" },
    { chainId: 60, oldSlug: "chains/rszgochain", newSlug: "chains/gochain", name: "GoChain" },
    { chainId: 61, oldSlug: "chains/rszethereumclassic", newSlug: "chains/ethereumclassic", name: "Ethereum Classic" },
    { chainId: 66, oldSlug: "chains/rszokexchain", newSlug: "chains/okexchain", name: "OKX Chain" },
    { chainId: 82, oldSlug: "chains/rszmeter", newSlug: "chains/meter", name: "Meter" },
    { chainId: 88, oldSlug: "chains/rsztomochain", newSlug: "chains/tomochain", name: "TomoChain" },
    { chainId: 100, oldSlug: "chains/rszxdai", newSlug: "chains/xdai", name: "Gnosis" },
    { chainId: 106, oldSlug: "chains/rszvelas", newSlug: "chains/velas", name: "Velas" },
    { chainId: 108, oldSlug: "chains/rszthundercore", newSlug: "chains/thundercore", name: "ThunderCore" },
    { chainId: 119, oldSlug: "chains/rszenuls", newSlug: "chains/enuls", name: "ENULS" },
    { chainId: 122, oldSlug: "chains/rszfuse", newSlug: "chains/fuse", name: "Fuse" },
    { chainId: 128, oldSlug: "chains/rszheco", newSlug: "chains/heco", name: "HECO" },
    { chainId: 130, oldSlug: "chains/rszunichain", newSlug: "chains/unichain", name: "Unichain" },
    { chainId: 137, oldSlug: "chains/rszpolygon", newSlug: "chains/polygon", name: "Polygon" },
    { chainId: 143, oldSlug: "chains/rszmonad", newSlug: "chains/monad", name: "Monad" },
    { chainId: 146, oldSlug: "chains/rszsonic", newSlug: "chains/sonic", name: "Sonic" },
    { chainId: 148, oldSlug: "chains/rszshimmerevm", newSlug: "chains/shimmerevm", name: "Shimmer EVM" },
    { chainId: 169, oldSlug: "chains/rszmanta", newSlug: "chains/manta", name: "Manta" },
    { chainId: 173, oldSlug: "chains/rszeni", newSlug: "chains/eni", name: "ENI" },
    { chainId: 185, oldSlug: "chains/rszmint", newSlug: "chains/mint", name: "Mint" },
    { chainId: 199, oldSlug: "chains/rszbittorrent", newSlug: "chains/bittorrent", name: "BitTorrent" },
    { chainId: 204, oldSlug: "chains/rszopbnb", newSlug: "chains/opbnb", name: "opBNB" },
    { chainId: 207, oldSlug: "chains/rszvinuchain", newSlug: "chains/vinuchain", name: "VinuChain" },
    { chainId: 225, oldSlug: "chains/rszlachain", newSlug: "chains/lachain", name: "LaChain" },
    { chainId: 232, oldSlug: "chains/rszlens", newSlug: "chains/lens", name: "Lens" },
    { chainId: 246, oldSlug: "chains/rszenergyweb", newSlug: "chains/energyweb", name: "Energy Web" },
    { chainId: 248, oldSlug: "chains/rszoasys", newSlug: "chains/oasys", name: "Oasys" },
    { chainId: 250, oldSlug: "chains/rszfantom", newSlug: "chains/fantom", name: "Fantom" },
    { chainId: 252, oldSlug: "chains/rszfraxtal", newSlug: "chains/fraxtal", name: "Fraxtal" },
    { chainId: 254, oldSlug: "chains/rszswan", newSlug: "chains/swan", name: "Swan" },
    { chainId: 255, oldSlug: "chains/rszkroma", newSlug: "chains/kroma", name: "Kroma" },
    { chainId: 269, oldSlug: "chains/rszhpb", newSlug: "chains/hpb", name: "HPB" },
    { chainId: 277, oldSlug: "chains/rszprom", newSlug: "chains/prom", name: "Prom" },
    { chainId: 288, oldSlug: "chains/rszboba", newSlug: "chains/boba", name: "Boba" },
    { chainId: 291, oldSlug: "chains/rszorderly", newSlug: "chains/orderly", name: "Orderly" },
    { chainId: 295, oldSlug: "chains/rszhedera", newSlug: "chains/hedera", name: "Hedera" },
    { chainId: 314, oldSlug: "chains/rszfilecoin", newSlug: "chains/filecoin", name: "Filecoin" },
    { chainId: 321, oldSlug: "chains/rszkucoin", newSlug: "chains/kucoin", name: "KuCoin" },
    { chainId: 336, oldSlug: "chains/rszshiden", newSlug: "chains/shiden", name: "Shiden" },
    { chainId: 360, oldSlug: "chains/rszshape", newSlug: "chains/shape", name: "Shape" },
    { chainId: 361, oldSlug: "chains/rsztheta", newSlug: "chains/theta", name: "Theta" },
    { chainId: 369, oldSlug: "chains/rszpulse", newSlug: "chains/pulse", name: "PulseChain" },
    { chainId: 388, oldSlug: "chains/rszcronoszkevm", newSlug: "chains/cronos-zkevm", name: "Cronos zkEVM" },
    { chainId: 416, oldSlug: "chains/rszsx", newSlug: "chains/sx-network", name: "SX Network" },
    { chainId: 478, oldSlug: "chains/rszformnetwork", newSlug: "chains/formnetwork", name: "Form Network" },
    { chainId: 570, oldSlug: "chains/rszrollux", newSlug: "chains/rollux", name: "Rollux" },
    { chainId: 592, oldSlug: "chains/rszastar", newSlug: "chains/astar", name: "Astar" },
    { chainId: 648, oldSlug: "chains/rszendurance", newSlug: "chains/endurance", name: "Endurance" },
    { chainId: 690, oldSlug: "chains/rszredstone", newSlug: "chains/redstone", name: "Redstone" },
    { chainId: 698, oldSlug: "chains/rszmatchain", newSlug: "chains/matchain", name: "Matchain" },
    { chainId: 747, oldSlug: "chains/rszflow", newSlug: "chains/flow", name: "Flow" },
    { chainId: 820, oldSlug: "chains/rszcallisto", newSlug: "chains/callisto", name: "Callisto" },
    { chainId: 841, oldSlug: "chains/rsztaraxa", newSlug: "chains/taraxa", name: "Taraxa" },
    { chainId: 888, oldSlug: "chains/rszwanchain", newSlug: "chains/wanchain", name: "Wanchain" },
    { chainId: 957, oldSlug: "chains/rszlyra-chain", newSlug: "chains/lyra-chain", name: "Lyra Chain" },
    { chainId: 996, oldSlug: "chains/rszbifrost", newSlug: "chains/bifrost", name: "Bifrost" },
    { chainId: 999, oldSlug: "chains/rszhyperliquid", newSlug: "chains/hyperliquid", name: "Hyperliquid" },
    { chainId: 1024, oldSlug: "chains/rszclv", newSlug: "chains/clv", name: "CLV" },
    { chainId: 1030, oldSlug: "chains/rszconflux", newSlug: "chains/conflux", name: "Conflux" },
    { chainId: 1088, oldSlug: "chains/rszmetis", newSlug: "chains/metis", name: "Metis" },
    { chainId: 1101, oldSlug: "chains/rszpolygonzkevm", newSlug: "chains/polygon-zkevm", name: "Polygon zkEVM" },
    { chainId: 1116, oldSlug: "chains/rszcore", newSlug: "chains/core", name: "Core" },
    { chainId: 1135, oldSlug: "chains/rszlisk", newSlug: "chains/lisk", name: "Lisk" },
    { chainId: 1230, oldSlug: "chains/rszultron", newSlug: "chains/ultron", name: "Ultron" },
    { chainId: 1284, oldSlug: "chains/rszmoonbeam", newSlug: "chains/moonbeam", name: "Moonbeam" },
    { chainId: 1285, oldSlug: "chains/rszmoonriver", newSlug: "chains/moonriver", name: "Moonriver" },
    { chainId: 1329, oldSlug: "chains/rszsei", newSlug: "chains/sei", name: "Sei" },
    { chainId: 1453, oldSlug: "chains/rszmeta", newSlug: "chains/meta", name: "Meta" },
    { chainId: 1514, oldSlug: "chains/rszstory", newSlug: "chains/story", name: "Story" },
    { chainId: 1625, oldSlug: "chains/rszgravity-bridge", newSlug: "chains/gravity-bridge", name: "Gravity Bridge" },
    { chainId: 1750, oldSlug: "chains/rszmetal", newSlug: "chains/metal", name: "Metal" },
    { chainId: 1890, oldSlug: "chains/rszlightlink", newSlug: "chains/lightlink", name: "LightLink" },
    { chainId: 1996, oldSlug: "chains/rszsanko", newSlug: "chains/sanko", name: "Sanko" },
    { chainId: 2000, oldSlug: "chains/rszdogechain", newSlug: "chains/dogechain", name: "Dogechain" },
    { chainId: 2020, oldSlug: "chains/rszronin", newSlug: "chains/ronin", name: "Ronin" },
    { chainId: 2040, oldSlug: "chains/rszvana", newSlug: "chains/vana", name: "Vana" },
    { chainId: 2221, oldSlug: "chains/rszkava", newSlug: "chains/kava", name: "Kava Testnet" },
    { chainId: 2222, oldSlug: "chains/rszkava", newSlug: "chains/kava", name: "Kava" },
    { chainId: 2358, oldSlug: "chains/rszkroma", newSlug: "chains/kroma", name: "Kroma" },
    { chainId: 2741, oldSlug: "chains/rszabstract", newSlug: "chains/abstract", name: "Abstract" },
    { chainId: 3338, oldSlug: "chains/rszpeaq", newSlug: "chains/peaq", name: "Peaq" },
    { chainId: 3776, oldSlug: "chains/rszastar-zkevm", newSlug: "chains/astar-zkevm", name: "Astar zkEVM" },
    { chainId: 4200, oldSlug: "chains/rszmerlin", newSlug: "chains/merlin", name: "Merlin" },
    { chainId: 4337, oldSlug: "chains/rszbeam", newSlug: "chains/beam", name: "Beam" },
    { chainId: 4689, oldSlug: "chains/rsziotex", newSlug: "chains/iotex", name: "IoTeX" },
    { chainId: 5000, oldSlug: "chains/rszmantle", newSlug: "chains/mantle", name: "Mantle" },
    { chainId: 5165, oldSlug: "chains/rszbahamut", newSlug: "chains/bahamut", name: "Bahamut" },
    { chainId: 6969, oldSlug: "chains/rsztombchain", newSlug: "chains/tombchain", name: "Tombchain" },
    { chainId: 7000, oldSlug: "chains/rszzetachain", newSlug: "chains/zetachain", name: "ZetaChain" },
    { chainId: 7171, oldSlug: "chains/rszbitrock", newSlug: "chains/bitrock", name: "Bitrock" },
    { chainId: 7560, oldSlug: "chains/rszcyber", newSlug: "chains/cyber", name: "Cyber" },
    { chainId: 7700, oldSlug: "chains/rszcanto", newSlug: "chains/canto", name: "Canto" },
    { chainId: 7887, oldSlug: "chains/rszkinto", newSlug: "chains/kinto", name: "Kinto" },
    { chainId: 8008, oldSlug: "chains/rszpolynomial", newSlug: "chains/polynomial", name: "Polynomial" },
    { chainId: 8217, oldSlug: "chains/rszklaytn", newSlug: "chains/klayton", name: "Klaytn" },
    { chainId: 8329, oldSlug: "chains/rszlorenzo", newSlug: "chains/lorenzo", name: "Lorenzo" },
    { chainId: 8333, oldSlug: "chains/rszb3", newSlug: "chains/b3", name: "B3" },
    { chainId: 8428, oldSlug: "chains/rszclique", newSlug: "chains/clique", name: "Clique" },
    { chainId: 8453, oldSlug: "chains/rszbase", newSlug: "chains/base", name: "Base" },
    { chainId: 8822, oldSlug: "chains/rsziota", newSlug: "chains/iota", name: "IOTA" },
    { chainId: 9001, oldSlug: "chains/rszevmos", newSlug: "chains/evmos", name: "Evmos" },
    { chainId: 9790, oldSlug: "chains/rszcarbon", newSlug: "chains/carbon", name: "Carbon" },
    { chainId: 10000, oldSlug: "chains/rszsmartbch", newSlug: "chains/smartbch", name: "SmartBCH" },
    { chainId: 10143, oldSlug: "chains/rszmonad", newSlug: "chains/monad", name: "Monad Testnet" },
    { chainId: 11011, oldSlug: "chains/rszshape", newSlug: "chains/shape", name: "Shape" },
    { chainId: 11235, oldSlug: "chains/rszhaqq", newSlug: "chains/haqq", name: "Haqq" },
    { chainId: 12324, oldSlug: "chains/rszl3x-network", newSlug: "chains/l3x-network", name: "L3X Network" },
    { chainId: 12553, oldSlug: "chains/rszrss3", newSlug: "chains/rss3", name: "RSS3" },
    { chainId: 13371, oldSlug: "chains/rszimmutablezkevm", newSlug: "chains/immutable-zkevm", name: "Immutable zkEVM" },
    { chainId: 15557, oldSlug: "chains/rszeos", newSlug: "chains/eos", name: "EOS" },
    { chainId: 17000, oldSlug: "chains/rszethereum", newSlug: "chains/ethereum", name: "Holesky" },
    { chainId: 17777, oldSlug: "chains/rszeos", newSlug: "chains/eos", name: "EOS" },
    { chainId: 22222, oldSlug: "chains/rszhypr", newSlug: "chains/hypr", name: "Hypr" },
    { chainId: 22776, oldSlug: "chains/rszmap-protocol", newSlug: "chains/map-protocol", name: "MAP Protocol" },
    { chainId: 23294, oldSlug: "chains/rszoasissapphire", newSlug: "chains/sapphire", name: "Oasis Sapphire" },
    { chainId: 23888, oldSlug: "chains/rszblast", newSlug: "chains/blast", name: "Blast Testnet" },
    { chainId: 32520, oldSlug: "chains/rszbitgert", newSlug: "chains/bitgert", name: "Bitgert" },
    { chainId: 32659, oldSlug: "chains/rszfusion", newSlug: "chains/fusion", name: "Fusion" },
    { chainId: 32769, oldSlug: "chains/rszzilliqa", newSlug: "chains/zilliqa", name: "Zilliqa" },
    { chainId: 33979, oldSlug: "chains/rszfunkichain", newSlug: "chains/funkichain", name: "Funkichain" },
    { chainId: 34443, oldSlug: "chains/rszmode", newSlug: "chains/mode", name: "Mode" },
    { chainId: 39797, oldSlug: "chains/rszenergi", newSlug: "chains/energi", name: "Energi" },
    { chainId: 41455, oldSlug: "chains/rszaleph-zero-evm", newSlug: "chains/aleph-zero-evm", name: "Aleph Zero EVM" },
    { chainId: 42161, oldSlug: "chains/rszarbitrum", newSlug: "chains/arbitrum", name: "Arbitrum" },
    { chainId: 42170, oldSlug: "chains/rszarbitrumnova", newSlug: "chains/arbitrumnova", name: "Arbitrum Nova" },
    { chainId: 42220, oldSlug: "chains/rszcelo", newSlug: "chains/celo", name: "Celo" },
    { chainId: 42262, oldSlug: "chains/rszoasis-emerald", newSlug: "chains/oasis-emerald", name: "Oasis Emerald" },
    { chainId: 42766, oldSlug: "chains/rszzkfair", newSlug: "chains/zkfair", name: "ZKFair" },
    { chainId: 43113, oldSlug: "chains/rszavalanche", newSlug: "chains/avalanche", name: "Avalanche Fuji" },
    { chainId: 43114, oldSlug: "chains/rszavalanche", newSlug: "chains/avalanche", name: "Avalanche" },
    { chainId: 43288, oldSlug: "chains/rszboba", newSlug: "chains/boba", name: "Boba Fuji" },
    { chainId: 44787, oldSlug: "chains/rszcelo", newSlug: "chains/celo", name: "Celo Alfajores" },
    { chainId: 47805, oldSlug: "chains/rszrei", newSlug: "chains/rei", name: "REI" },
    { chainId: 48900, oldSlug: "chains/rszzircuit", newSlug: "chains/zircuit", name: "Zircuit" },
    { chainId: 52014, oldSlug: "chains/rszelectroneum", newSlug: "chains/electroneum", name: "Electroneum" },
    { chainId: 53935, oldSlug: "chains/rszdfk", newSlug: "chains/dfk", name: "DFK" },
    { chainId: 55244, oldSlug: "chains/rszsuperposition", newSlug: "chains/superposition", name: "Superposition" },
    { chainId: 57073, oldSlug: "chains/rszink", newSlug: "chains/ink", name: "Ink" },
    { chainId: 59144, oldSlug: "chains/rszlinea", newSlug: "chains/linea", name: "Linea" },
    { chainId: 60808, oldSlug: "chains/rszbob", newSlug: "chains/bob", name: "BOB" },
    { chainId: 71402, oldSlug: "chains/rszgodwoken", newSlug: "chains/godwoken", name: "Godwoken" },
    { chainId: 80002, oldSlug: "chains/rszpolygon", newSlug: "chains/polygon", name: "Polygon Amoy" },
    { chainId: 80084, oldSlug: "chains/rszberachain", newSlug: "chains/berachain", name: "Berachain Testnet" },
    { chainId: 80094, oldSlug: "chains/rszberachain", newSlug: "chains/berachain", name: "Berachain" },
    { chainId: 81457, oldSlug: "chains/rszblast", newSlug: "chains/blast", name: "Blast" },
    { chainId: 88888, oldSlug: "chains/rszchiliz", newSlug: "chains/chiliz", name: "Chiliz" },
    { chainId: 98866, oldSlug: "chains/rszplume", newSlug: "chains/plume", name: "Plume" },
    { chainId: 100000, oldSlug: "chains/rszq", newSlug: "chains/q-protocol", name: "Q" },
    { chainId: 128123, oldSlug: "chains/rszetherlink", newSlug: "chains/etherlink", name: "Etherlink" },
    { chainId: 131313, oldSlug: "chains/rszodyssey", newSlug: "chains/odyssey", name: "Odyssey" },
    { chainId: 167000, oldSlug: "chains/rsztaiko", newSlug: "chains/taiko", name: "Taiko" },
    { chainId: 200901, oldSlug: "chains/rszbitlayer", newSlug: "chains/bitlayer", name: "Bitlayer" },
    { chainId: 210425, oldSlug: "chains/rszplaton", newSlug: "chains/platon", name: "PlatON" },
    { chainId: 245022934, oldSlug: "chains/rszneon", newSlug: "chains/neon", name: "Neon" },
    { chainId: 534352, oldSlug: "chains/rszscroll", newSlug: "chains/scroll", name: "Scroll" },
    { chainId: 555666, oldSlug: "chains/rszeclipse", newSlug: "chains/eclipse", name: "Eclipse" },
    { chainId: 622277, oldSlug: "chains/rszhypr", newSlug: "chains/hypr", name: "Hypr" },
    { chainId: 660279, oldSlug: "chains/rszxai", newSlug: "chains/xai", name: "Xai" },
    { chainId: 713715, oldSlug: "chains/rszsei", newSlug: "chains/sei", name: "Sei Devnet" },
    { chainId: 810180, oldSlug: "chains/rszzklink-nova", newSlug: "chains/zklink-nova", name: "zkLink Nova" },
    { chainId: 7225878, oldSlug: "chains/rszsaakuru", newSlug: "chains/saakuru", name: "Saakuru" },
    { chainId: 7777777, oldSlug: "chains/rszzora", newSlug: "chains/zora", name: "Zora" },
    { chainId: 11155111, oldSlug: "chains/rszethereum", newSlug: "chains/ethereum", name: "Sepolia" },
    { chainId: 11155420, oldSlug: "chains/rszoptimism", newSlug: "chains/optimism", name: "OP Sepolia" },
    { chainId: 245022926, oldSlug: "chains/rszneon", newSlug: "chains/neon", name: "Neon Devnet" },
    { chainId: 666666666, oldSlug: "chains/rszdegen", newSlug: "chains/degen", name: "Degen" },
    { chainId: 728126428, oldSlug: "chains/rsztron", newSlug: "chains/tron", name: "Tron" },
    { chainId: 1313161554, oldSlug: "chains/rszaurora", newSlug: "chains/aurora", name: "Aurora" },
    { chainId: 1666600000, oldSlug: "chains/rszharmony", newSlug: "chains/harmony", name: "Harmony" },
];

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

async function main() {
    console.log('=== Update Chain Mappings to Clean Slugs ===\n');
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Total mappings: ${CHAIN_MAPPINGS.length}`);
    console.log(`RPC: ${RPC_URL} (fallback: ${FALLBACK_RPC_URL})\n`);

    const publicClient = await createRpcClient(RPC_URL, FALLBACK_RPC_URL);

    // Check which clean slugs exist and need remapping
    console.log('Checking which clean slugs are available...');
    const toUpdate: typeof CHAIN_MAPPINGS = [];

    for (const mapping of CHAIN_MAPPINGS) {
        // Check if new clean slug exists on-chain
        const newHash = keccak256(toHex(mapping.newSlug));
        const iconData = await publicClient.readContract({
            address: PROXY_ADDRESS,
            abi: ICON_REGISTRY_ABI,
            functionName: 'icons',
            args: [newHash],
        });

        if (iconData[0] === '0x0000000000000000000000000000000000000000') {
            console.log(`  ⚠ Clean slug not found: ${mapping.newSlug} (chain ${mapping.chainId})`);
            continue;
        }

        // Check current mapping
        const currentMapping = await publicClient.readContract({
            address: PROXY_ADDRESS,
            abi: ICON_REGISTRY_ABI,
            functionName: 'chainToIcon',
            args: [BigInt(mapping.chainId)],
        });

        if (currentMapping.toLowerCase() !== newHash.toLowerCase()) {
            toUpdate.push(mapping);
        }
    }

    console.log(`\nNeed to update: ${toUpdate.length} mappings`);

    if (toUpdate.length === 0) {
        console.log('All chain mappings already point to clean slugs!');
        return;
    }

    // Show what will be updated
    console.log('\nMappings to update:');
    toUpdate.slice(0, 20).forEach(m => {
        console.log(`  ${m.chainId} (${m.name}): ${m.oldSlug} → ${m.newSlug}`);
    });
    if (toUpdate.length > 20) {
        console.log(`  ... and ${toUpdate.length - 20} more`);
    }

    if (DRY_RUN) {
        console.log('\nDry run complete. Run without DRY_RUN=true to deploy.');
        return;
    }

    // Initialize Turnkey signer
    console.log('\nInitializing Turnkey signer...');
    const { client: walletClient, address } = await createTurnkeySigner({ rpcUrl: RPC_URL });
    console.log(`Signer: ${address}\n`);

    let success = 0;
    let failed = 0;

    for (let i = 0; i < toUpdate.length; i++) {
        const mapping = toUpdate[i];

        // Wait for acceptable gas
        const maxGasWei = parseGwei(MAX_GAS_PRICE_GWEI.toString());
        let gasPrice: bigint;

        while (true) {
            gasPrice = await publicClient.getGasPrice();
            if (gasPrice <= maxGasWei) break;
            process.stdout.write(`\rGas: ${formatGwei(gasPrice)} gwei - waiting...    `);
            await sleep(6000);
        }

        try {
            const data = encodeFunctionData({
                abi: ICON_REGISTRY_ABI,
                functionName: 'mapChain',
                args: [BigInt(mapping.chainId), mapping.newSlug],
            });

            const gasEstimate = await publicClient.estimateGas({
                account: address,
                to: PROXY_ADDRESS,
                data,
            });

            const nonce = await publicClient.getTransactionCount({ address });
            const bufferedGasPrice = gasPrice + (gasPrice * 10n / 100n);

            const txHash = await walletClient.sendTransaction({
                to: PROXY_ADDRESS,
                data,
                gas: gasEstimate + (gasEstimate * 20n / 100n),
                gasPrice: bufferedGasPrice,
                nonce,
            });

            await publicClient.waitForTransactionReceipt({
                hash: txHash,
                timeout: 60_000,
            });

            success++;
            console.log(`[${i + 1}/${toUpdate.length}] ✓ ${mapping.chainId} → ${mapping.newSlug}`);
        } catch (err: any) {
            failed++;
            console.log(`[${i + 1}/${toUpdate.length}] ✗ ${mapping.chainId}: ${err.message?.slice(0, 50)}`);
        }

        await sleep(300);
    }

    console.log('\n=== Complete ===');
    console.log(`Success: ${success}`);
    console.log(`Failed: ${failed}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
