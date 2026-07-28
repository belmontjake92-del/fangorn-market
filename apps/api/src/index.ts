import { resolve } from "node:path";
import { Repo } from "@fangorn-market/db";
import { findRepoRoot } from "@fangorn-market/shared";
import { createServer } from "./server.js";

const PORT = Number(process.env.PORT ?? 4000);
const DB_PATH =
  process.env.DATABASE_PATH ?? resolve(findRepoRoot(), ".data", "local-e2e.db");

const repo = Repo.open(DB_PATH);
const app = createServer(repo);

app.listen(PORT, () => {
  console.log(`Fangorn Market API on http://localhost:${PORT}`);
  console.log(`  db: ${DB_PATH}`);
});
