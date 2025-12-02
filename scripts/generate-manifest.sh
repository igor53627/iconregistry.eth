#!/bin/bash
# Generate manifest.json from processed icons

OUTPUT_DIR="/Users/user/pse/icon-registry/docs"
MANIFEST="${OUTPUT_DIR}/manifest.json"
CATEGORIES=("protocols" "chains")

echo "Generating manifest.json..."

# Start JSON
echo '{' > "$MANIFEST"
echo '  "version": "1.0.0",' >> "$MANIFEST"
echo '  "generatedAt": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",' >> "$MANIFEST"
echo '  "size": "64x64",' >> "$MANIFEST"
echo '  "icons": [' >> "$MANIFEST"

total=0
total_size=0
first=true

for category in "${CATEGORIES[@]}"; do
  dir="${OUTPUT_DIR}/${category}"
  
  for file in "$dir"/*.png; do
    [ -f "$file" ] || continue
    
    name=$(basename "$file" .png)
    size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
    total_size=$((total_size + size))
    total=$((total + 1))
    
    if [ "$first" = true ]; then
      first=false
    else
      echo ',' >> "$MANIFEST"
    fi
    
    printf '    {"id":"%s/%s","name":"%s","category":"%s","processed":{"path":"%s/%s.png","size":%d}}' \
      "$category" "$name" "$name" "$category" "$category" "$name" "$size" >> "$MANIFEST"
  done
done

echo '' >> "$MANIFEST"
echo '  ],' >> "$MANIFEST"
echo '  "stats": {' >> "$MANIFEST"
echo '    "total": '$total',' >> "$MANIFEST"
echo '    "totalSize": '$total_size >> "$MANIFEST"
echo '  }' >> "$MANIFEST"
echo '}' >> "$MANIFEST"

echo "Generated manifest with $total icons ($(echo "scale=2; $total_size/1024/1024" | bc) MB)"
