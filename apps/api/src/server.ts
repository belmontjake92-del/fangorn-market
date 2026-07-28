import express, { type Express, type Request, type Response } from "express";
import type { Repo } from "@fangorn-market/db";
import { sendJson } from "./serialize.js";
import { parseBacktestParams, runBacktest } from "./backtest.js";

/**
 * Build the Fangorn Market API over the data layer. All amounts/prices/sizes are
 * returned as decimal strings of 1e6 fixed-point integers (USDC-6 / price / size).
 * Read-only for now — the marketplace and dashboards consume this.
 */
export function createServer(repo: Repo): Express {
  const app = express();
  app.use(express.json());

  // Permissive CORS for the local frontend dev server.
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
  });

  app.get("/health", (_req, res) => sendJson(res, { ok: true, service: "fangorn-market-api" }));

  // ── The Grove: data assets & observations ────────────────────────────────
  app.get("/api/data-assets", (_req, res) => sendJson(res, repo.listDataAssets()));

  app.get("/api/observations/:symbol", (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit ?? 500), 5000);
    sendJson(res, repo.listObservations(String(req.params.symbol), limit));
  });

  // ── Marketplace: deployments, positions, fills ───────────────────────────
  app.get("/api/deployments", (_req, res) => sendJson(res, repo.listDeployments()));

  app.get("/api/deployments/:id", (req: Request, res: Response) => {
    const id = String(req.params.id);
    const deployment = repo.getDeployment(id);
    if (!deployment) return sendJson(res, { error: "not found" }, 404);
    sendJson(res, {
      deployment,
      positions: repo.getPositions(id),
      fills: repo.listFills(id, 50),
    });
  });

  app.get("/api/deployments/:id/positions", (req, res) =>
    sendJson(res, repo.getPositions(String(req.params.id))),
  );
  app.get("/api/deployments/:id/fills", (req, res) =>
    sendJson(res, repo.listFills(String(req.params.id), Math.min(Number(req.query.limit ?? 200), 2000))),
  );

  // ── The Grove: monetized/encrypted resources & earnings (Phase 2) ────────
  app.get("/api/resources", (_req, res) => sendJson(res, repo.listResources()));

  app.get("/api/resources/:id/purchases", (req, res) =>
    sendJson(res, repo.listPurchases(String(req.params.id))),
  );

  app.get("/api/earnings/:owner", (req, res) => {
    const owner = String(req.params.owner);
    const { gross, count } = repo.earningsForOwner(owner);
    sendJson(res, { owner, grossUsdcBaseUnits: gross, purchases: count, recent: repo.listPurchases().slice(0, 20) });
  });

  // ── Agent Lab: deterministic backtest (trading engine, no chain) ─────────
  app.get("/api/backtest", (req: Request, res: Response) => {
    sendJson(res, runBacktest(parseBacktestParams(req.query as Record<string, unknown>)));
  });

  // ── Activity feed ────────────────────────────────────────────────────────
  app.get("/api/activity", (req, res) =>
    sendJson(res, repo.listActivity(Math.min(Number(req.query.limit ?? 100), 1000))),
  );

  return app;
}
