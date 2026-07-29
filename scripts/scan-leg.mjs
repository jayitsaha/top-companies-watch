// One batch leg: takes a batch index, slices config/companies.json into
// BATCH_SIZE-sized chunks, generates a portals.yml with just that batch's
// tracked_companies + the shared filters, and runs career-ops's scan.mjs
// against it. Companies here are pre-resolved to REAL, verified ATS board
// URLs (Greenhouse/Lever/Ashby/Workday/iCIMS) via a one-time name-match
// against the same public job-board-aggregator dataset scan-ats-full.mjs
// uses (see /Users/jayitsaha/Documents/APPLICATIONS/top_companies_ranked.json
// and this repo's README for how the list was built) — not live-guessed.
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
} from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "career-ops-src");
const STATE_DIR = path.join(ROOT, "state");
const CONFIG_DIR = path.join(ROOT, "config");
const BATCH_INDEX = parseInt(process.argv[2], 10);
const BATCH_SIZE = 20;
const OUT_DIR = path.join(ROOT, "leg-output", `batch-${BATCH_INDEX}`);

const PIPELINE_SKELETON = `# Pipeline\n\n## Pending\n\n## Processed\n`;

function sh(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit", ...opts });
}

function loadBatch() {
  const all = JSON.parse(readFileSync(path.join(CONFIG_DIR, "companies.json"), "utf8"));
  const start = BATCH_INDEX * BATCH_SIZE;
  return all.slice(start, start + BATCH_SIZE);
}

function generateBatchPortals(companies) {
  const filters = readFileSync(path.join(CONFIG_DIR, "filters.yml"), "utf8");
  const trackedYaml = companies
    .map((c) => {
      const escaped = c.name.replace(/"/g, '\\"');
      return `  - name: "${escaped}"\n    careers_url: ${c.careers_url}\n    enabled: true`;
    })
    .join("\n");
  return `${filters}\ntracked_companies:\n${trackedYaml}\n`;
}

function setupSrc() {
  if (existsSync(SRC_DIR)) rmSync(SRC_DIR, { recursive: true, force: true });
  sh("git", [
    "clone",
    "--depth",
    "1",
    "https://github.com/santifer/career-ops.git",
    SRC_DIR,
  ]);
  sh("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: SRC_DIR,
  });
}

function restoreState(portalsYaml) {
  const dataDir = path.join(SRC_DIR, "data");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(path.join(SRC_DIR, "portals.yml"), portalsYaml);

  for (const f of ["scan-history.tsv", "portal-health.tsv"]) {
    const src = path.join(STATE_DIR, `batch-${BATCH_INDEX}-${f}`);
    if (existsSync(src)) cpSync(src, path.join(dataDir, f));
  }
  writeFileSync(path.join(dataDir, "pipeline.md"), PIPELINE_SKELETON);
}

function parsePendingOffers() {
  const pipelinePath = path.join(SRC_DIR, "data", "pipeline.md");
  if (!existsSync(pipelinePath)) return [];
  const text = readFileSync(pipelinePath, "utf8");
  const lines = text.split("\n").filter((l) => l.startsWith("- [ ] "));
  return lines.map((line) => {
    const body = line.slice("- [ ] ".length);
    const parts = body.split(" | ").map((p) => p.trim());
    const [url, company, title, location, compensation] = parts;
    return {
      url,
      company,
      title,
      location: location || "N/A",
      compensation: compensation || null,
    };
  });
}

function saveLegOutput(offers) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, "offers.json"), JSON.stringify(offers, null, 2));
  const dataDir = path.join(SRC_DIR, "data");
  for (const f of ["scan-history.tsv", "portal-health.tsv"]) {
    const src = path.join(dataDir, f);
    if (existsSync(src)) cpSync(src, path.join(OUT_DIR, `batch-${BATCH_INDEX}-${f}`));
  }
}

function main() {
  if (Number.isNaN(BATCH_INDEX)) {
    console.error("Usage: node scan-leg.mjs <batch-index>");
    process.exit(1);
  }
  const companies = loadBatch();
  console.log(`Batch ${BATCH_INDEX}: ${companies.length} companies`);
  if (companies.length === 0) {
    saveLegOutput([]);
    return;
  }

  setupSrc();
  const portalsYaml = generateBatchPortals(companies);
  restoreState(portalsYaml);

  try {
    sh("node", ["scan.mjs"], { cwd: SRC_DIR });
  } catch (e) {
    console.error(`Batch ${BATCH_INDEX} scan failed (continuing, contributes 0 offers):`, e.message);
  }

  const offers = parsePendingOffers();
  console.log(`Batch ${BATCH_INDEX}: ${offers.length} offers found`);
  saveLegOutput(offers);
}

main();
