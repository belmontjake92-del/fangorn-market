/**
 * The Fangorn Market toolbox surface, described in the shape the upstream
 * `@fangorn-network/agent` toolbay understands. Today a deterministic scheduler
 * calls the underlying operations directly (no LLM); in Phase 4 each entry wraps
 * as a LangChain `DynamicStructuredTool` and registers as a real Toolbox so an
 * LLM-driven agent can reason over the same capabilities.
 */
export interface ToolDescriptor {
  name: string;
  description: string;
}

export interface ToolboxDescriptor {
  name: string;
  description: string;
  tools: ToolDescriptor[];
}

export const FANGORN_MARKET_TOOLBOX: ToolboxDescriptor = {
  name: "fangorn-market",
  description:
    "Deterministic market tools: read Grove prices, check risk limits, and settle simulated fills on-chain.",
  tools: [
    { name: "market.price", description: "Latest observed price for a market from the Grove mirror." },
    { name: "risk.check", description: "Pre-trade risk gate mirroring SettlementLedger.submitFill." },
    { name: "trade.submit", description: "Settle a simulated fill on-chain via SettlementLedger." },
    { name: "position.read", description: "Read the current on-chain position, cash, and PnL." },
  ],
};
