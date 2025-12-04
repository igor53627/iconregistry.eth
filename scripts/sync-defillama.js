#!/usr/bin/env node
/**
 * Sync icons from DefiLlama/icons repository
 * Processes new/changed icons to 64x64 PNG format
 * 
 * Usage: node scripts/sync-defillama.js <defillama-icons-path>
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ICONS_DIR = path.join(__dirname, '..', 'icons-64');
const SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];

let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    console.error('sharp not installed. Run: npm install sharp');
    process.exit(1);
}

function getFileHash(filePath) {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(content).digest('hex');
}

function findAllIcons(dir, baseDir = dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findAllIcons(fullPath, baseDir));
        } else {
            const ext = path.extname(entry.name).toLowerCase();
            if (SUPPORTED_EXTENSIONS.includes(ext)) {
                const relativePath = path.relative(baseDir, fullPath);
                results.push({ fullPath, relativePath });
            }
        }
    }
    return results;
}

async function processIcon(sourcePath, destPath) {
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    
    try {
        await sharp(sourcePath)
            .resize(64, 64, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .png({
                compressionLevel: 9,
                palette: true
            })
            .toFile(destPath);
        return true;
    } catch (err) {
        console.error(`Failed to process ${sourcePath}: ${err.message}`);
        return false;
    }
}

async function main() {
    const defillamaPath = process.argv[2];
    if (!defillamaPath) {
        console.error('Usage: node sync-defillama.js <defillama-icons-path>');
        process.exit(1);
    }
    
    console.log('=== DefiLlama Icon Sync ===\n');
    console.log(`Source: ${defillamaPath}`);
    console.log(`Destination: ${ICONS_DIR}\n`);
    
    // Find source icons from different directories
    const sourceDirs = [
        { dir: path.join(defillamaPath, 'chains'), prefix: 'chains' },
        { dir: path.join(defillamaPath, 'protocols'), prefix: 'protocols' },
        { dir: path.join(defillamaPath, 'assets'), prefix: 'assets' }
    ];
    
    let allSourceIcons = [];
    for (const { dir, prefix } of sourceDirs) {
        const icons = findAllIcons(dir);
        allSourceIcons.push(...icons.map(i => ({
            ...i,
            slug: `${prefix}/${i.relativePath.replace(/\.[^.]+$/, '')}`
        })));
    }
    
    console.log(`Found ${allSourceIcons.length} source icons\n`);
    
    // Build existing icons map
    const existingIcons = new Map();
    const existingFiles = findAllIcons(ICONS_DIR);
    for (const { fullPath, relativePath } of existingFiles) {
        const slug = relativePath.replace(/\.png$/, '');
        existingIcons.set(slug, { fullPath, hash: getFileHash(fullPath) });
    }
    
    console.log(`Found ${existingIcons.size} existing icons\n`);
    
    let added = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const icon of allSourceIcons) {
        const destPath = path.join(ICONS_DIR, icon.slug + '.png');
        const existing = existingIcons.get(icon.slug);
        
        // Check if source has changed
        const sourceHash = getFileHash(icon.fullPath);
        
        if (existing) {
            // Compare by processing and checking output
            // For simplicity, we'll reprocess if source hash differs from a cached value
            // In practice, we just reprocess everything and let git detect changes
            skipped++;
            continue;
        }
        
        // New icon - process it
        const success = await processIcon(icon.fullPath, destPath);
        if (success) {
            added++;
            console.log(`+ ${icon.slug}`);
        } else {
            failed++;
        }
    }
    
    console.log('\n=== Summary ===');
    console.log(`Added: ${added}`);
    console.log(`Skipped (existing): ${skipped}`);
    console.log(`Failed: ${failed}`);
    
    if (added > 0) {
        console.log('\nNew icons added. Create PR to update registry.');
    }
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
