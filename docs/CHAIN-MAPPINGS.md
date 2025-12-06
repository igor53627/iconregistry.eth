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
| 1 | Ethereum | `chains/ethereum` |
| 10 | Optimism | `chains/optimism` |
| 14 | Flare | `chains/flare` |
| 19 | Songbird | `chains/songbird` |
| 20 | Elastos | `chains/elastos` |
| 25 | Cronos | `chains/cronos` |
| 30 | RSK | `chains/rsk` |
| 40 | Telos | `chains/telos` |
| 42 | LUKSO | `chains/lukso` |
| 44 | Crab | `chains/crab` |
| 46 | Darwinia | `chains/darwinia` |
| 50 | XDC | `chains/xdc` |
| 52 | CSC | `chains/csc` |
| 56 | BNB Chain | `chains/binance` |
| 57 | Syscoin | `chains/syscoin` |
| 58 | Ontology EVM | `chains/ontologyevm` |
| 60 | GoChain | `chains/gochain` |
| 61 | Ethereum Classic | `chains/ethereumclassic` |
| 66 | OKX Chain | `chains/okexchain` |
| 82 | Meter | `chains/meter` |
| 88 | TomoChain | `chains/tomochain` |
| 100 | Gnosis | `chains/xdai` |
| 106 | Velas | `chains/velas` |
| 108 | ThunderCore | `chains/thundercore` |
| 119 | ENULS | `chains/enuls` |
| 122 | Fuse | `chains/fuse` |
| 128 | HECO | `chains/heco` |
| 130 | Unichain | `chains/unichain` |
| 137 | Polygon | `chains/polygon` |
| 143 | Monad | `chains/monad` |
| 146 | Sonic | `chains/sonic` |
| 148 | Shimmer EVM | `chains/shimmerevm` |
| 169 | Manta | `chains/manta` |
| 173 | ENI | `chains/eni` |
| 185 | Mint | `chains/mint` |
| 199 | BitTorrent | `chains/bittorrent` |
| 204 | opBNB | `chains/opbnb` |
| 207 | VinuChain | `chains/vinuchain` |
| 225 | LaChain | `chains/lachain` |
| 232 | Lens | `chains/lens` |
| 246 | Energy Web | `chains/energyweb` |
| 248 | Oasys | `chains/oasys` |
| 250 | Fantom | `chains/fantom` |
| 252 | Fraxtal | `chains/fraxtal` |
| 254 | Swan | `chains/swan` |
| 255 | Kroma | `chains/kroma` |
| 269 | HPB | `chains/hpb` |
| 277 | Prom | `chains/prom` |
| 288 | Boba | `chains/boba` |
| 291 | Orderly | `chains/orderly` |
| 295 | Hedera | `chains/hedera` |
| 314 | Filecoin | `chains/filecoin` |
| 321 | KuCoin | `chains/kucoin` |
| 336 | Shiden | `chains/shiden` |
| 360 | Shape | `chains/shape` |
| 361 | Theta | `chains/theta` |
| 369 | PulseChain | `chains/pulse` |
| 388 | Cronos zkEVM | `chains/cronoszkevm` |
| 416 | SX Network | `chains/sx` |
| 478 | Form Network | `chains/formnetwork` |
| 570 | Rollux | `chains/rollux` |
| 592 | Astar | `chains/astar` |
| 648 | Endurance | `chains/endurance` |
| 690 | Redstone | `chains/redstone` |
| 698 | Matchain | `chains/matchain` |
| 747 | Flow | `chains/flow` |
| 820 | Callisto | `chains/callisto` |
| 841 | Taraxa | `chains/taraxa` |
| 888 | Wanchain | `chains/wanchain` |
| 957 | Lyra Chain | `chains/lyra-chain` |
| 996 | Bifrost | `chains/bifrost` |
| 999 | Hyperliquid | `chains/hyperliquid` |
| 1024 | CLV | `chains/clv` |
| 1030 | Conflux | `chains/conflux` |
| 1088 | Metis | `chains/metis` |
| 1101 | Polygon zkEVM | `chains/polygonzkevm` |
| 1116 | Core | `chains/core` |
| 1135 | Lisk | `chains/lisk` |
| 1230 | Ultron | `chains/ultron` |
| 1284 | Moonbeam | `chains/moonbeam` |
| 1285 | Moonriver | `chains/moonriver` |
| 1329 | Sei | `chains/sei` |
| 1453 | Meta | `chains/meta` |
| 1514 | Story | `chains/story` |
| 1625 | Gravity Bridge | `chains/gravity-bridge` |
| 1750 | Metal | `chains/metal` |
| 1890 | LightLink | `chains/lightlink` |
| 1996 | Sanko | `chains/sanko` |
| 2000 | Dogechain | `chains/dogechain` |
| 2020 | Ronin | `chains/ronin` |
| 2040 | Vana | `chains/vana` |
| 2221 | Kava Testnet | `chains/kava` ¹ |
| 2222 | Kava | `chains/kava` |
| 2358 | Kroma | `chains/kroma` |
| 2741 | Abstract | `chains/abstract` |
| 3338 | Peaq | `chains/peaq` |
| 3776 | Astar zkEVM | `chains/astar-zkevm` |
| 4200 | Merlin | `chains/merlin` |
| 4337 | Beam | `chains/beam` |
| 4689 | IoTeX | `chains/iotex` |
| 5000 | Mantle | `chains/mantle` |
| 5165 | Bahamut | `chains/bahamut` |
| 6969 | Tombchain | `chains/tombchain` |
| 7000 | ZetaChain | `chains/zetachain` |
| 7171 | Bitrock | `chains/bitrock` |
| 7560 | Cyber | `chains/cyber` |
| 7700 | Canto | `chains/canto` |
| 7887 | Kinto | `chains/kinto` |
| 8008 | Polynomial | `chains/polynomial` |
| 8217 | Klaytn | `chains/klaytn` |
| 8329 | Lorenzo | `chains/lorenzo` |
| 8333 | B3 | `chains/b3` |
| 8428 | Clique | `chains/clique` |
| 8453 | Base | `chains/base` |
| 8822 | IOTA | `chains/iota` |
| 9001 | Evmos | `chains/evmos` |
| 9790 | Carbon | `chains/carbon` |
| 10000 | SmartBCH | `chains/smartbch` |
| 10143 | Monad Testnet | `chains/monad` ¹ |
| 11011 | Shape | `chains/shape` |
| 11235 | Haqq | `chains/haqq` |
| 12324 | L3X Network | `chains/l3x-network` |
| 12553 | RSS3 | `chains/rss3` |
| 13371 | Immutable zkEVM | `chains/immutablezkevm` |
| 15557 | EOS | `chains/eos` |
| 17000 | Holesky | `chains/ethereum` ¹ |
| 17777 | EOS | `chains/eos` |
| 22222 | Hypr | `chains/hypr` |
| 22776 | MAP Protocol | `chains/map-protocol` |
| 23294 | Oasis Sapphire | `chains/oasissapphire` |
| 23888 | Blast Testnet | `chains/blast` ¹ |
| 32520 | Bitgert | `chains/bitgert` |
| 32659 | Fusion | `chains/fusion` |
| 32769 | Zilliqa | `chains/zilliqa` |
| 33979 | Funkichain | `chains/funkichain` |
| 34443 | Mode | `chains/mode` |
| 39797 | Energi | `chains/energi` |
| 41455 | Aleph Zero EVM | `chains/aleph-zero-evm` |
| 42161 | Arbitrum | `chains/arbitrum` |
| 42170 | Arbitrum Nova | `chains/arbitrumnova` |
| 42220 | Celo | `chains/celo` |
| 42262 | Oasis Emerald | `chains/oasis-emerald` |
| 42766 | ZKFair | `chains/zkfair` |
| 43113 | Avalanche Fuji | `chains/avalanche` ¹ |
| 43114 | Avalanche | `chains/avalanche` |
| 43288 | Boba Fuji | `chains/boba` ¹ |
| 44787 | Celo Alfajores | `chains/celo` ¹ |
| 47805 | REI | `chains/rei` |
| 48900 | Zircuit | `chains/zircuit` |
| 52014 | Electroneum | `chains/electroneum` |
| 53935 | DFK | `chains/dfk` |
| 55244 | Superposition | `chains/superposition` |
| 57073 | Ink | `chains/ink` |
| 59144 | Linea | `chains/linea` |
| 60808 | BOB | `chains/bob` |
| 71402 | Godwoken | `chains/godwoken` |
| 80002 | Polygon Amoy | `chains/polygon` ¹ |
| 80084 | Berachain Testnet | `chains/berachain` ¹ |
| 80094 | Berachain | `chains/berachain` |
| 81457 | Blast | `chains/blast` |
| 88888 | Chiliz | `chains/chiliz` |
| 98866 | Plume | `chains/plume` |
| 100000 | Q | `chains/q` |
| 128123 | Etherlink | `chains/etherlink` |
| 131313 | Odyssey | `chains/odyssey` |
| 167000 | Taiko | `chains/taiko` |
| 200901 | Bitlayer | `chains/bitlayer` |
| 210425 | PlatON | `chains/platon` |
| 245022934 | Neon | `chains/neon` |
| 534352 | Scroll | `chains/scroll` |
| 555666 | Eclipse | `chains/eclipse` |
| 622277 | Hypr | `chains/hypr` |
| 660279 | Xai | `chains/xai` |
| 713715 | Sei Devnet | `chains/sei` ¹ |
| 810180 | zkLink Nova | `chains/zklink-nova` |
| 7225878 | Saakuru | `chains/saakuru` |
| 7777777 | Zora | `chains/zora` |
| 11155111 | Sepolia | `chains/ethereum` ¹ |
| 11155420 | OP Sepolia | `chains/optimism` ¹ |
| 245022926 | Neon Devnet | `chains/neon` ¹ |
| 666666666 | Degen | `chains/degen` |
| 728126428 | Tron | `chains/tron` |
| 1313161554 | Aurora | `chains/aurora` |
| 1666600000 | Harmony | `chains/harmony` |

¹ Testnet/devnet using mainnet chain's icon

## Machine-Readable Format

See [chain-mappings.json](./chain-mappings.json) for the full list in JSON format.
