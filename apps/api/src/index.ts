import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { Repo } from "@fangorn-market/db";
import { findRepoRoot } from "@fangorn-market/shared";
import { createServer } from "./server.js";
import { startWorker } from "./worker.js";

const PORT = Number(process.env.PORT ?? 4000);
const root = findRepoRoot();

// Built frontend (present in production images); undefined in dev.
const WEB_DIST = process.env.WEB_DIST ?? resolve(root, "apps", "web", "dist");

type NetKey = "arbitrum" | "robinhood";

/** Per-network databases - the app switches between them at runtime via `?network=`. */
const DB_PATHS: Record<NetKey, string> = {
  arbitrum: process.env.DATABASE_PATH ?? resolve(root, ".data", "sepolia.db"),
  robinhood: process.env.ROBINHOOD_DATABASE_PATH ?? resolve(root, ".data", "robinhoodTestnet.db"),
};

// Fall back to the local e2e db if the arbitrum db hasn't been produced yet.
if (!existsSync(DB_PATHS.arbitrum)) DB_PATHS.arbitrum = resolve(root, ".data", "local-e2e.db");

const repos = new Map<NetKey, Repo>();
const repoFor = (network: string): Repo => {
  const key: NetKey = network === "robinhood" ? "robinhood" : "arbitrum";
  let repo = repos.get(key);
  if (!repo) {
    repo = Repo.open(DB_PATHS[key]);
    repos.set(key, repo);
  }
  return repo;
};

const app = createServer(repoFor, WEB_DIST);

app.listen(PORT, () => {
  console.log(`Fangorn Market API on http://localhost:${PORT}`);
  console.log(`  arbitrum db:  ${DB_PATHS.arbitrum}`);
  console.log(`  robinhood db: ${DB_PATHS.robinhood}`);
  console.log(`  web dist:     ${existsSync(WEB_DIST) ? WEB_DIST : "(not built - dev mode)"}`);
  // Always-on paper worker (opt-in via env so local dev stays quiet).
  if (process.env.AGENT_WORKER === "1") startWorker(repoFor);
});
