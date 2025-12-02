#!/bin/bash
# Process icons: ImageMagick resize to 64x64 + oxipng optimization

SOURCE_DIR="/Users/user/pse/logos/defillama-icons/assets"
OUTPUT_DIR="/Users/user/pse/icon-registry/docs"
SIZE=64
CATEGORIES=("chains" "protocols")

echo "Processing ${SIZE}x${SIZE} icons: ImageMagick → oxipng"
echo ""

total=0
total_size=0

for category in "${CATEGORIES[@]}"; do
  src_dir="${SOURCE_DIR}/${category}"
  out_dir="${OUTPUT_DIR}/${category}"
  
  # Clean and create output dir
  rm -rf "$out_dir"
  mkdir -p "$out_dir"
  
  count=0
  cat_size=0
  
  printf "%s: " "$category"
  
  shopt -s nullglob nocaseglob
  for file in "$src_dir"/*.png "$src_dir"/*.jpg "$src_dir"/*.jpeg "$src_dir"/*.webp; do
    
    # Get basename, normalize to lowercase, remove special chars
    base=$(basename "$file" | sed 's/\.[^.]*$//' | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g')
    out_path="${out_dir}/${base}.png"
    
    # Resize with ImageMagick: fit in 64x64, transparent background
    magick "$file" \
      -resize "${SIZE}x${SIZE}" \
      -gravity center \
      -background transparent \
      -extent "${SIZE}x${SIZE}" \
      -strip \
      PNG32:"$out_path" 2>/dev/null
    
    if [ -f "$out_path" ]; then
      # Optimize with oxipng
      oxipng -o max --strip all -q "$out_path" 2>/dev/null
      
      size=$(stat -f%z "$out_path" 2>/dev/null || stat -c%s "$out_path" 2>/dev/null)
      cat_size=$((cat_size + size))
      count=$((count + 1))
      printf "."
    fi
  done
  
  total=$((total + count))
  total_size=$((total_size + cat_size))
  
  printf " %d icons (%.2f MB)\n" "$count" "$(echo "scale=2; $cat_size/1024/1024" | bc)"
done

echo ""
echo "Total: $total icons, $(echo "scale=2; $total_size/1024/1024" | bc) MB"
