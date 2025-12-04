#!/bin/bash
# Setup local Vault for IconRegistry deployment
# Usage: ./scripts/vault-setup.sh

set -e

VAULT_DIR="$HOME/.iconregistry-vault"
VAULT_CONFIG="$VAULT_DIR/config.hcl"
VAULT_DATA="$VAULT_DIR/data"

echo "=== IconRegistry Vault Setup ==="
echo ""

# Create vault directory
mkdir -p "$VAULT_DATA"

# Create config for file-based storage (persistent, no dev mode)
cat > "$VAULT_CONFIG" << 'EOF'
storage "file" {
  path = "~/.iconregistry-vault/data"
}

listener "tcp" {
  address     = "127.0.0.1:8200"
  tls_disable = true
}

disable_mlock = true
api_addr = "http://127.0.0.1:8200"
EOF

# Expand ~ in config
sed -i '' "s|~|$HOME|g" "$VAULT_CONFIG"

echo "Vault config created at: $VAULT_CONFIG"
echo ""
echo "To start Vault server (in a separate terminal):"
echo "  vault server -config=$VAULT_CONFIG"
echo ""
echo "To initialize (first time only):"
echo "  export VAULT_ADDR='http://127.0.0.1:8200'"
echo "  vault operator init -key-shares=1 -key-threshold=1"
echo "  # Save the Unseal Key and Root Token!"
echo ""
echo "To unseal and login:"
echo "  vault operator unseal <UNSEAL_KEY>"
echo "  vault login <ROOT_TOKEN>"
echo ""
echo "To store your private key:"
echo "  vault kv put secret/iconregistry private_key=<YOUR_KEY>"
echo ""
echo "Or use dev mode for quick testing (keys reset on restart):"
echo "  vault server -dev -dev-root-token-id=iconregistry"
