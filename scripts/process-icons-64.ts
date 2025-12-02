import sharp from "sharp";
import { execSync } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";

const SOURCE_DIR = "/Users/user/pse/logos/defillama-icons/assets";
const OUTPUT_DIR = "/Users/user/pse/icons/icons-64";
const SIZE = 64;
const CATEGORIES = ["chains", "protocols", "agg_icons", "pegged"];

async function main() {
  console.log("Processing 64x64 icons: sharp → oxipng");
  
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let total = 0, totalSize = 0;

  for (const category of CATEGORIES) {
    const srcDir = path.join(SOURCE_DIR, category);
    const outDir = path.join(OUTPUT_DIR, category);
    await fs.mkdir(outDir, { recursive: true });

    const files = await fs.readdir(srcDir);
    const images = files.filter(f => /\.(png|jpg|jpeg|webp|svg)$/i.test(f));
    
    process.stdout.write(`${category}: `);
    
    for (const file of images) {
      try {
        const baseName = path.basename(file, path.extname(file))
          .toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        const outPath = path.join(outDir, `${baseName}.png`);

        await sharp(path.join(srcDir, file))
          .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png({ compressionLevel: 9 })
          .toFile(outPath);

        execSync(`oxipng -o max --strip all -q "${outPath}"`, { stdio: "ignore" });
        
        const stat = await fs.stat(outPath);
        totalSize += stat.size;
        total++;
        process.stdout.write(".");
      } catch {}
    }
    console.log(` ✓`);
  }

  console.log(`\nTotal: ${total} icons, ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(console.error);
