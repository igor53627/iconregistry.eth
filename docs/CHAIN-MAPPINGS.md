# Chain ID Mappings

This document lists all EVM chain IDs mapped to icons in the IconRegistry contract.

**Contract:** `0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc` (Ethereum Mainnet)

## Usage

```solidity
// Get chain icon by chain ID
bytes memory icon = registry.getChainIcon(1); // Ethereum
bytes memory icon = registry.getChainIcon(137); // Polygon
```

```javascript
// ethers.js
const icon = await registry.getChainIcon(8453); // Base - returns PNG bytes
```

## Mapped Chains (184 total)

| Chain ID | Name | Slug |
|----------|------|------|
| 1 | Ethereum | `chains/rszethereum` |
| 10 | Optimism | `chains/rszoptimism` |
| 14 | Flare | `chains/rszflare` |
| 19 | Songbird | `chains/rszsongbird` |
| 20 | Elastos | `chains/rszelastos` |
| 25 | Cronos | `chains/rszcronos` |
| 30 | RSK | `chains/rszrsk` |
| 40 | Telos | `chains/rsztelos` |
| 42 | LUKSO | `chains/rszlukso` |
| 44 | Crab | `chains/rszcrab` |
| 46 | Darwinia | `chains/rszdarwinia` |
| 50 | XDC | `chains/rszxdc` |
| 52 | CSC | `chains/rszcsc` |
| 56 | BNB Chain | `chains/rszbinance` |
| 57 | Syscoin | `chains/rszsyscoin` |
| 58 | Ontology EVM | `chains/rszontologyevm` |
| 60 | GoChain | `chains/rszgochain` |
| 61 | Ethereum Classic | `chains/rszethereumclassic` |
| 66 | OKX Chain | `chains/rszokexchain` |
| 82 | Meter | `chains/rszmeter` |
| 88 | TomoChain | `chains/rsztomochain` |
| 100 | Gnosis | `chains/rszxdai` |
| 106 | Velas | `chains/rszvelas` |
| 108 | ThunderCore | `chains/rszthundercore` |
| 119 | ENULS | `chains/rszenuls` |
| 122 | Fuse | `chains/rszfuse` |
| 128 | HECO | `chains/rszheco` |
| 130 | Unichain | `chains/rszunichain` |
| 137 | Polygon | `chains/rszpolygon` |
| 143 | Monad | `chains/rszmonad` |
| 146 | Sonic | `chains/rszsonic` |
| 148 | Shimmer EVM | `chains/rszshimmerevm` |
| 169 | Manta | `chains/rszmanta` |
| 173 | ENI | `chains/rszeni` |
| 185 | Mint | `chains/rszmint` |
| 199 | BitTorrent | `chains/rszbittorrent` |
| 204 | opBNB | `chains/rszopbnb` |
| 207 | VinuChain | `chains/rszvinuchain` |
| 225 | LaChain | `chains/rszlachain` |
| 232 | Lens | `chains/rszlens` |
| 246 | Energy Web | `chains/rszenergyweb` |
| 248 | Oasys | `chains/rszoasys` |
| 250 | Fantom | `chains/rszfantom` |
| 252 | Fraxtal | `chains/rszfraxtal` |
| 254 | Swan | `chains/rszswan` |
| 255 | Kroma | `chains/rszkroma` |
| 269 | HPB | `chains/rszhpb` |
| 277 | Prom | `chains/rszprom` |
| 288 | Boba | `chains/rszboba` |
| 291 | Orderly | `chains/rszorderly` |
| 295 | Hedera | `chains/rszhedera` |
| 314 | Filecoin | `chains/rszfilecoin` |
| 321 | KuCoin | `chains/rszkucoin` |
| 336 | Shiden | `chains/rszshiden` |
| 360 | Shape | `chains/rszshape` |
| 361 | Theta | `chains/rsztheta` |
| 369 | PulseChain | `chains/rszpulse` |
| 388 | Cronos zkEVM | `chains/rszcronoszkevm` |
| 416 | SX Network | `chains/rszsx` |
| 478 | Form Network | `chains/rszformnetwork` |
| 570 | Rollux | `chains/rszrollux` |
| 592 | Astar | `chains/rszastar` |
| 648 | Endurance | `chains/rszendurance` |
| 690 | Redstone | `chains/rszredstone` |
| 698 | Matchain | `chains/rszmatchain` |
| 747 | Flow | `chains/rszflow` |
| 820 | Callisto | `chains/rszcallisto` |
| 841 | Taraxa | `chains/rsztaraxa` |
| 888 | Wanchain | `chains/rszwanchain` |
| 957 | Lyra Chain | `chains/rszlyra-chain` |
| 996 | Bifrost | `chains/rszbifrost` |
| 999 | Hyperliquid | `chains/rszhyperliquid` |
| 1024 | CLV | `chains/rszclv` |
| 1030 | Conflux | `chains/rszconflux` |
| 1088 | Metis | `chains/rszmetis` |
| 1101 | Polygon zkEVM | `chains/rszpolygonzkevm` |
| 1116 | Core | `chains/rszcore` |
| 1135 | Lisk | `chains/rszlisk` |
| 1230 | Ultron | `chains/rszultron` |
| 1284 | Moonbeam | `chains/rszmoonbeam` |
| 1285 | Moonriver | `chains/rszmoonriver` |
| 1329 | Sei | `chains/rszsei` |
| 1453 | Meta | `chains/rszmeta` |
| 1514 | Story | `chains/rszstory` |
| 1625 | Gravity Bridge | `chains/rszgravity-bridge` |
| 1750 | Metal | `chains/rszmetal` |
| 1890 | LightLink | `chains/rszlightlink` |
| 1996 | Sanko | `chains/rszsanko` |
| 2000 | Dogechain | `chains/rszdogechain` |
| 2020 | Ronin | `chains/rszronin` |
| 2040 | Vana | `chains/rszvana` |
| 2221 | Kava Testnet | `chains/rszkava` ¹ |
| 2222 | Kava | `chains/rszkava` |
| 2358 | Kroma | `chains/rszkroma` |
| 2741 | Abstract | `chains/rszabstract` |
| 3338 | Peaq | `chains/rszpeaq` |
| 3776 | Astar zkEVM | `chains/rszastar-zkevm` |
| 4200 | Merlin | `chains/rszmerlin` |
| 4337 | Beam | `chains/rszbeam` |
| 4689 | IoTeX | `chains/rsziotex` |
| 5000 | Mantle | `chains/rszmantle` |
| 5165 | Bahamut | `chains/rszbahamut` |
| 6969 | Tombchain | `chains/rsztombchain` |
| 7000 | ZetaChain | `chains/rszzetachain` |
| 7171 | Bitrock | `chains/rszbitrock` |
| 7560 | Cyber | `chains/rszcyber` |
| 7700 | Canto | `chains/rszcanto` |
| 7887 | Kinto | `chains/rszkinto` |
| 8008 | Polynomial | `chains/rszpolynomial` |
| 8217 | Klaytn | `chains/rszklaytn` |
| 8329 | Lorenzo | `chains/rszlorenzo` |
| 8333 | B3 | `chains/rszb3` |
| 8428 | Clique | `chains/rszclique` |
| 8453 | Base | `chains/rszbase` |
| 8822 | IOTA | `chains/rsziota` |
| 9001 | Evmos | `chains/rszevmos` |
| 9790 | Carbon | `chains/rszcarbon` |
| 10000 | SmartBCH | `chains/rszsmartbch` |
| 10143 | Monad Testnet | `chains/rszmonad` ¹ |
| 11011 | Shape | `chains/rszshape` |
| 11235 | Haqq | `chains/rszhaqq` |
| 12324 | L3X Network | `chains/rszl3x-network` |
| 12553 | RSS3 | `chains/rszrss3` |
| 13371 | Immutable zkEVM | `chains/rszimmutablezkevm` |
| 15557 | EOS | `chains/rszeos` |
| 17000 | Holesky | `chains/rszethereum` ¹ |
| 17777 | EOS | `chains/rszeos` |
| 22222 | Hypr | `chains/rszhypr` |
| 22776 | MAP Protocol | `chains/rszmap-protocol` |
| 23294 | Oasis Sapphire | `chains/rszoasissapphire` |
| 23888 | Blast Testnet | `chains/rszblast` ¹ |
| 32520 | Bitgert | `chains/rszbitgert` |
| 32659 | Fusion | `chains/rszfusion` |
| 32769 | Zilliqa | `chains/rszzilliqa` |
| 33979 | Funkichain | `chains/rszfunkichain` |
| 34443 | Mode | `chains/rszmode` |
| 39797 | Energi | `chains/rszenergi` |
| 41455 | Aleph Zero EVM | `chains/rszaleph-zero-evm` |
| 42161 | Arbitrum | `chains/rszarbitrum` |
| 42170 | Arbitrum Nova | `chains/rszarbitrumnova` |
| 42220 | Celo | `chains/rszcelo` |
| 42262 | Oasis Emerald | `chains/rszoasis-emerald` |
| 42766 | ZKFair | `chains/rszzkfair` |
| 43113 | Avalanche Fuji | `chains/rszavalanche` ¹ |
| 43114 | Avalanche | `chains/rszavalanche` |
| 43288 | Boba Fuji | `chains/rszboba` ¹ |
| 44787 | Celo Alfajores | `chains/rszcelo` ¹ |
| 47805 | REI | `chains/rszrei` |
| 48900 | Zircuit | `chains/rszzircuit` |
| 52014 | Electroneum | `chains/rszelectroneum` |
| 53935 | DFK | `chains/rszdfk` |
| 55244 | Superposition | `chains/rszsuperposition` |
| 57073 | Ink | `chains/rszink` |
| 59144 | Linea | `chains/rszlinea` |
| 60808 | BOB | `chains/rszbob` |
| 71402 | Godwoken | `chains/rszgodwoken` |
| 80002 | Polygon Amoy | `chains/rszpolygon` ¹ |
| 80084 | Berachain Testnet | `chains/rszberachain` ¹ |
| 80094 | Berachain | `chains/rszberachain` |
| 81457 | Blast | `chains/rszblast` |
| 88888 | Chiliz | `chains/rszchiliz` |
| 98866 | Plume | `chains/rszplume` |
| 100000 | Q | `chains/rszq` |
| 128123 | Etherlink | `chains/rszetherlink` |
| 131313 | Odyssey | `chains/rszodyssey` |
| 167000 | Taiko | `chains/rsztaiko` |
| 200901 | Bitlayer | `chains/rszbitlayer` |
| 210425 | PlatON | `chains/rszplaton` |
| 245022934 | Neon | `chains/rszneon` |
| 534352 | Scroll | `chains/rszscroll` |
| 555666 | Eclipse | `chains/rszeclipse` |
| 622277 | Hypr | `chains/rszhypr` |
| 660279 | Xai | `chains/rszxai` |
| 713715 | Sei Devnet | `chains/rszsei` ¹ |
| 810180 | zkLink Nova | `chains/rszzklink-nova` |
| 7225878 | Saakuru | `chains/rszsaakuru` |
| 7777777 | Zora | `chains/rszzora` |
| 11155111 | Sepolia | `chains/rszethereum` ¹ |
| 11155420 | OP Sepolia | `chains/rszoptimism` ¹ |
| 245022926 | Neon Devnet | `chains/rszneon` ¹ |
| 666666666 | Degen | `chains/rszdegen` |
| 728126428 | Tron | `chains/rsztron` |
| 1313161554 | Aurora | `chains/rszaurora` |
| 1666600000 | Harmony | `chains/rszharmony` |

¹ Testnet/devnet using mainnet chain's icon

## Machine-Readable Format

See [chain-mappings.json](./chain-mappings.json) for the full list in JSON format.
