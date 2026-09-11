import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express, { type Express, type Request, type Response } from "express";
import type { Repo } from "@fangorn-market/db";
import { sendJson } from "./serialize.js";
import { parseBacktestParams, runBacktest } from "./backtest.js";

/** Resolve the repo for a request's `?network=` (arbitrum | robinhood). */
export type RepoFor = (network: string) => Repo;

/**
 * Build the Fangorn Market API. Data is served per-network - the same routes
 * back both Arbitrum Sepolia (stealth) and Robinhood Chain (direct), selected by
 * a `?network=` query param. Amounts are decimal strings of 1e6 fixed point.
 *
 * In production, pass `webDist` (the built `apps/web/dist`) to serve the SPA
 * from the same origin - then the frontend's relative `/api` calls just work.
 */
export function createServer(repoFor: RepoFor, webDist?: string): Express {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
  });

  const repo = (req: Request): Repo => repoFor(String(req.query.network ?? "arbitrum"));

  app.get("/health", (_req, res) => sendJson(res, { ok: true, service: "fangorn-market-api" }));

  // ── The Grove ────────────────────────────────────────────────────────────
  app.get("/api/data-assets", (req, res) => sendJson(res, repo(req).listDataAssets()));
  app.get("/api/observations/:symbol", (req, res) =>
    sendJson(res, repo(req).listObservations(String(req.params.symbol), Math.min(Number(req.query.limit ?? 500), 5000))),
  );

  // ── Marketplace ──────────────────────────────────────────────────────────
  app.get("/api/deployments", (req, res) => sendJson(res, repo(req).listDeployments()));
  app.get("/api/deployments/:id", (req: Request, res: Response) => {
    const id = String(req.params.id);
    const r = repo(req);
    const deployment = r.getDeployment(id);
    if (!deployment) return sendJson(res, { error: "not found" }, 404);
    sendJson(res, { deployment, positions: r.getPositions(id), fills: r.listFills(id, 50) });
  });
  app.get("/api/deployments/:id/positions", (req, res) => sendJson(res, repo(req).getPositions(String(req.params.id))));
  app.get("/api/deployments/:id/fills", (req, res) =>
    sendJson(res, repo(req).listFills(String(req.params.id), Math.min(Number(req.query.limit ?? 200), 2000))),
  );

  // ── Monetized resources & earnings ───────────────────────────────────────
  app.get("/api/resources", (req, res) => sendJson(res, repo(req).listResources()));
  app.get("/api/resources/:id/purchases", (req, res) => sendJson(res, repo(req).listPurchases(String(req.params.id))));
  app.get("/api/earnings/:owner", (req, res) => {
    const owner = String(req.params.owner);
    const r = repo(req);
    const { gross, count } = r.earningsForOwner(owner);
    sendJson(res, { owner, grossUsdcBaseUnits: gross, purchases: count, recent: r.listPurchases().slice(0, 20) });
  });

  // ── Agent Lab: backtest (chain-agnostic) ─────────────────────────────────
  app.get("/api/backtest", (req, res) => sendJson(res, runBacktest(parseBacktestParams(req.query as Record<string, unknown>))));

  // ── Activity ─────────────────────────────────────────────────────────────
  app.get("/api/activity", (req, res) => sendJson(res, repo(req).listActivity(Math.min(Number(req.query.limit ?? 100), 1000))));

  // ── Catalog deploy tally (global, not network-scoped) ────────────────────
  // Seeded low in the UI; this counts real user deploys on top.
  app.get("/api/catalog-deploys", (_req, res) => sendJson(res, repoFor("arbitrum").catalogDeploys()));
  app.post("/api/catalog-deploys/:id", (req, res) => {
    const id = String(req.params.id).slice(0, 64);
    sendJson(res, { id, count: repoFor("arbitrum").incrementCatalogDeploy(id) });
  });

  // ── Static frontend (production) ─────────────────────────────────────────
  // Serve the built SPA and fall back to index.html for client-side routes,
  // leaving /api and /health to the handlers above.
  if (webDist && existsSync(webDist)) {
    const indexHtml = resolve(webDist, "index.html");
    app.use(express.static(webDist));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api") || req.path === "/health") return next();
      res.sendFile(indexHtml);
    });
  }

  return app;
}
