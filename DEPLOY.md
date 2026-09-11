# Deploying Fangorn Market

The whole app ships as **one container**: the Express API serves the built React
frontend on the same origin, with the two on-chain databases (`.data/sepolia.db`,
`.data/robinhoodTestnet.db`) bundled in. The smart contracts are already deployed
on both chains, so there's nothing else to stand up.

**No secrets required.** The public app is read-only over already-settled on-chain
data, and wallet connections are non-custodial (users sign in their own extension -
we never see keys). Nothing sensitive is baked into the image.

## Prerequisites (one-time, you do these)

1. Install the Fly CLI:
   ```bash
   powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
   ```
2. Create a Fly account and log in (opens a browser):
   ```bash
   fly auth signup   # or: fly auth login
   ```

## First deploy

From the `fangorn-market` folder:

```bash
fly launch --copy-config --name fangorn-market --region iad --now
```

- `--copy-config` uses the included `fly.toml`.
- If the name `fangorn-market` is taken, pick another (it becomes
  `https://<name>.fly.dev`).
- The image builds on Fly's servers (you don't need Docker installed locally).

When it finishes, open it:

```bash
fly open
```

## Redeploying after changes

```bash
fly deploy
```

## Custom domain (optional)

```bash
fly certs add app.yourdomain.com
```
Then add the DNS records Fly prints. HTTPS is issued automatically.

## Handy

```bash
fly logs        # live logs
fly status      # machines / health
fly scale count 1   # keep 1 machine always-on (removes cold starts)
```

## If the container build fails on the filtered install

The Dockerfile installs only the `api` + `web` workspaces to skip heavier
packages. If Fly's build ever errors on `pnpm install --filter …`, change that
line in the `Dockerfile` to a full install:

```dockerfile
RUN pnpm install --frozen-lockfile
```

## What is NOT deployed (by design)

- The x402 paid-data **access worker** and the Arbitrum **facilitator** - only
  needed to originate *new* stealth/relayed purchases, which aren't wired to the
  browser yet. Existing purchases already display from the bundled data.
- Live agent loops. To refresh on-chain data, run the agent scripts locally and
  redeploy (the DBs travel with the image), or later move data to a hosted DB.
