# Registry History

On-chain changes to the IconRegistry (icons, token mappings, chain mappings).

## [Unreleased]

## [2025-12-14]

### Contract Upgrade
- Upgraded to implementation `0x99232b848594a149b2e68239ad4aa811abbb26cd`
- Improved error messages with context parameters:
  - `TokenIconNotMapped(address token, uint256 chainId)` - clear token lookup failures
  - `ChainIconNotMapped(uint256 chainId)` - clear chain lookup failures
  - `IconNotFound(bytes32 slugHash)` - includes slug hash
  - `VersionNotFound(bytes32 slugHash, uint256 version)` - includes version
  - `LengthMismatch(uint256 expected, uint256 got)` - shows array sizes
  - `InvalidData(string slug)` - shows which slug failed

### Token Mappings
- Added WALLET (Ambire Wallet) token mapping for mainnet
  - `0x88800092ff476844f74dc2fc427974bbee2794ae` → `protocols/ambire-wallet`

## [2025-12-09]

### Icons
- Synced 59 new icons from DefiLlama (12 + 13 + 10 + 12 + 10 + 2 batches)

### Token Mappings
- Initial batch of 74 stablecoin token mappings deployed
- Includes: USDC, USDT, DAI, FRAX, GHO, USDe, crvUSD, LUSD, and 66 others
- Covers chains: Ethereum (1), Optimism (10), BSC (56), Polygon (137), Base (8453), Arbitrum (42161), Avalanche (43114)

### Chain Mappings
- 333 chain ID to icon mappings deployed
- Enables `getIconByChain(chainId)` lookups

## [2025-12-06]

### Infrastructure
- Added Turnkey signing integration for GitHub Actions
- Deployed proxy contract at `0x342e808c40D8E00656fEd124CA11aEcBB96c61Fc`
- Added manifest generation for icon discovery
- Added token and chain mapping scripts

### Icons
- Initial deployment of ~10,000 protocol and chain icons from DefiLlama
