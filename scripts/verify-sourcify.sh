#!/bin/bash
# Verify IconRegistry contracts on Sourcify
# Usage: ./scripts/verify-sourcify.sh <IMPLEMENTATION_ADDRESS> [FACTORY_ADDRESS]

set -e

IMPLEMENTATION=${1:-""}
FACTORY=${2:-""}

if [ -z "$IMPLEMENTATION" ]; then
    echo "Usage: ./scripts/verify-sourcify.sh <IMPLEMENTATION_ADDRESS> [FACTORY_ADDRESS]"
    exit 1
fi

echo "=== Sourcify Verification ==="
echo ""

# Verify implementation
echo "Verifying IconRegistry implementation: $IMPLEMENTATION"
forge verify-contract "$IMPLEMENTATION" \
    contracts/IconRegistry.sol:IconRegistry \
    --verifier sourcify \
    --chain 1

echo ""
echo "Implementation verified!"
echo "View: https://sourcify.dev/#/lookup/$IMPLEMENTATION"

# Verify factory if provided
if [ -n "$FACTORY" ]; then
    echo ""
    echo "Verifying IconRegistryDeployer factory: $FACTORY"
    forge verify-contract "$FACTORY" \
        scripts/Deploy.s.sol:IconRegistryDeployer \
        --verifier sourcify \
        --chain 1
    
    echo ""
    echo "Factory verified!"
    echo "View: https://sourcify.dev/#/lookup/$FACTORY"
fi

echo ""
echo "=== Verification Complete ==="
