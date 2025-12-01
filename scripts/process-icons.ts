import sharp from "sharp";
import { execSync } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";

interface IconEntry {
  id: string;
  name: string;
  category: string;
  original: {
    path: string;
    width: number;
    height: number;
    size: number;
    format: string;
  };
  processed: {
    path: string;
    size: number;
  };
}

interface Manifest {
  version: string;
  generatedAt: string;
  sourceRepo: string;
  size: "32x32";
  icons: IconEntry[];
  stats: {
    total: number;
    byCategory: Record<string, number>;
    originalTotalSize: number;
    processedTotalSize: number;
    compressionRatio: number;
  };
}

const SOURCE_DIR = "/Users/user/pse/logos/defillama-icons/assets";
const OUTPUT_DIR = "/Users/user/pse/icons/icons";
const SIZE = 32;

const CATEGORIES = ["chains", "protocols", "agg_icons", "pegged"];

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function getImageInfo(
  filePath: string
): Promise<{ width: number; height: number; format: string } | null> {
  try {
    const metadata = await sharp(filePath).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || "unknown",
    };
  } catch {
    return null;
  }
}

async function processIcon(
  sourcePath: string,
  category: string,
  fileName: string
): Promise<IconEntry | null> {
  try {
    const stat = await fs.stat(sourcePath);
    const info = await getImageInfo(sourcePath);

    if (!info || info.width === 0) {
      return null;
    }

    const baseName = path
      .basename(fileName, path.extname(fileName))
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    const id = `${category}/${baseName}`;
    const outDir = path.join(OUTPUT_DIR, category);
    await ensureDir(outDir);

    const outPath = path.join(outDir, `${baseName}.png`);

    // Step 1: sharp - decode, resize to 32x32, encode PNG
    await sharp(sourcePath)
      .resize(SIZE, SIZE, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toFile(outPath);

    // Step 2: oxipng - lossless optimization
    execSync(`oxipng -o max --strip all -q "${outPath}"`, { stdio: "ignore" });

    const outStat = await fs.stat(outPath);

    return {
      id,
      name: baseName,
      category,
      original: {
        path: path.relative(SOURCE_DIR, sourcePath),
        width: info.width,
        height: info.height,
        size: stat.size,
        format: info.format,
      },
      processed: {
        path: path.relative(OUTPUT_DIR, outPath),
        size: outStat.size,
      },
    };
  } catch {
    return null;
  }
}

async function processCategory(category: string): Promise<IconEntry[]> {
  const categoryDir = path.join(SOURCE_DIR, category);
  const entries: IconEntry[] = [];

  try {
    const files = await fs.readdir(categoryDir);
    const imageFiles = files.filter((f) =>
      /\.(png|jpg|jpeg|webp|svg)$/i.test(f)
    );

    console.log(`\n${category}: ${imageFiles.length} files`);

    for (const file of imageFiles) {
      const sourcePath = path.join(categoryDir, file);
      const entry = await processIcon(sourcePath, category, file);
      if (entry) {
        entries.push(entry);
        process.stdout.write(".");
      }
    }
    console.log(` ✓ ${entries.length}`);
  } catch (err) {
    console.log(`Error: ${category}`, err);
  }

  return entries;
}

async function main() {
  console.log("Pipeline: sharp (resize 32x32) → oxipng (lossless)");
  console.log(`Source: ${SOURCE_DIR}`);
  console.log(`Output: ${OUTPUT_DIR}`);

  // Clean output
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  await ensureDir(OUTPUT_DIR);

  const allEntries: IconEntry[] = [];

  for (const category of CATEGORIES) {
    const entries = await processCategory(category);
    allEntries.push(...entries);
  }

  const stats = {
    total: allEntries.length,
    byCategory: {} as Record<string, number>,
    originalTotalSize: 0,
    processedTotalSize: 0,
    compressionRatio: 0,
  };

  for (const entry of allEntries) {
    stats.byCategory[entry.category] =
      (stats.byCategory[entry.category] || 0) + 1;
    stats.originalTotalSize += entry.original.size;
    stats.processedTotalSize += entry.processed.size;
  }

  stats.compressionRatio = stats.originalTotalSize / stats.processedTotalSize;

  const manifest: Manifest = {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    sourceRepo: "https://github.com/DefiLlama/icons",
    size: "32x32",
    icons: allEntries.sort((a, b) => a.id.localeCompare(b.id)),
    stats,
  };

  await fs.writeFile(
    path.join(OUTPUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  console.log("\n=== Summary ===");
  console.log(`Total: ${stats.total} icons`);
  console.log(`Original: ${(stats.originalTotalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Processed: ${(stats.processedTotalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Ratio: ${stats.compressionRatio.toFixed(1)}x smaller`);
}

main().catch(console.error);
