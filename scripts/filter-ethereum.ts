import * as fs from "fs/promises";
import * as path from "path";

const ICONS_DIR = "/Users/user/pse/icons/icons";
const OUTPUT_DIR = "/Users/user/pse/icons/icons-ethereum";

interface Protocol {
  name: string;
  slug: string;
  chains: string[];
  logo: string;
}

async function main() {
  // Fetch protocols from DefiLlama API
  console.log("Fetching protocols from DefiLlama API...");
  const res = await fetch("https://api.llama.fi/protocols");
  const protocols: Protocol[] = await res.json();

  // Filter protocols that are on Ethereum
  const ethereumProtocols = protocols.filter(
    (p) => p.chains && p.chains.includes("Ethereum")
  );

  console.log(`Total protocols: ${protocols.length}`);
  console.log(`Ethereum protocols: ${ethereumProtocols.length}`);

  // Create slug -> protocol mapping
  const ethereumSlugs = new Set(
    ethereumProtocols.map((p) => p.slug.toLowerCase().replace(/\s+/g, "-"))
  );

  // Read our manifest
  const manifest = JSON.parse(
    await fs.readFile(path.join(ICONS_DIR, "manifest.json"), "utf-8")
  );

  // Filter icons that match Ethereum protocols
  const matchedIcons: typeof manifest.icons = [];
  const unmatchedEthereum: string[] = [];

  for (const icon of manifest.icons) {
    // Check if protocol name matches
    if (icon.category === "protocols") {
      if (ethereumSlugs.has(icon.name)) {
        matchedIcons.push(icon);
      }
    } else if (icon.category === "chains") {
      // Include ethereum chain icon
      if (icon.name === "ethereum" || icon.name === "rszethereumclassic") {
        matchedIcons.push(icon);
      }
    }
  }

  // Also find Ethereum protocols we don't have icons for
  const ourProtocolNames = new Set(
    manifest.icons
      .filter((i: any) => i.category === "protocols")
      .map((i: any) => i.name)
  );

  for (const slug of ethereumSlugs) {
    if (!ourProtocolNames.has(slug)) {
      unmatchedEthereum.push(slug);
    }
  }

  console.log(`\nMatched icons: ${matchedIcons.length}`);
  console.log(`Ethereum protocols without icons: ${unmatchedEthereum.length}`);

  // Calculate size
  let totalSize = 0;
  for (const icon of matchedIcons) {
    totalSize += icon.processed.size;
  }

  console.log(`\nTotal size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(
    `Avg per icon: ${(totalSize / matchedIcons.length).toFixed(0)} bytes`
  );

  // Copy matched icons to new directory
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });

  for (const icon of matchedIcons) {
    const srcPath = path.join(ICONS_DIR, icon.processed.path);
    const destDir = path.join(OUTPUT_DIR, icon.category);
    const destPath = path.join(destDir, path.basename(icon.processed.path));

    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(srcPath, destPath);
  }

  // Write new manifest
  const ethManifest = {
    ...manifest,
    version: "1.0.0-ethereum",
    generatedAt: new Date().toISOString(),
    filter: "Ethereum mainnet protocols only",
    icons: matchedIcons,
    stats: {
      total: matchedIcons.length,
      byCategory: {} as Record<string, number>,
      totalSize,
    },
  };

  for (const icon of matchedIcons) {
    ethManifest.stats.byCategory[icon.category] =
      (ethManifest.stats.byCategory[icon.category] || 0) + 1;
  }

  await fs.writeFile(
    path.join(OUTPUT_DIR, "manifest.json"),
    JSON.stringify(ethManifest, null, 2)
  );

  console.log(`\nOutput: ${OUTPUT_DIR}`);

  // Cost estimate
  const gasPerByte = 200; // SSTORE2
  const totalGas = totalSize * gasPerByte;
  const gweiPrice = 30;
  const ethPrice = 2500;
  const costEth = (totalGas * gweiPrice) / 1e9;
  const costUsd = costEth * ethPrice;

  console.log(`\n=== SSTORE2 Cost Estimate ===`);
  console.log(`Gas: ${(totalGas / 1e9).toFixed(2)}B`);
  console.log(`Cost: ${costEth.toFixed(2)} ETH (~$${costUsd.toFixed(0)})`);
}

main().catch(console.error);
