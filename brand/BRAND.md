# Fangorn Market - Brand & Theme

The identity: **an ancient forest that trades.** Fangorn = Tolkien's oldest forest
(Ents, growth, deep memory) → the "living graph" of The Grove. Chartreuse on near-black
reads both organic and fintech-serious. Serif display + mono data = "old wisdom, live markets."

## Colors

| Role | Hex | Use |
|---|---|---|
| **Accent (signature)** | `#c6f24e` | Chartreuse. Primary brand color - logo, CTAs, highlights, the market-up color. |
| Accent bright | `#d4f76a` | Hovers, the "market high" node. |
| Accent dim | `#8aad3f` | Muted accent, borders. |
| Ink / background | `#050506` | Near-black canvas. |
| Surface | `#0d0d0e` | Cards. |
| Surface 2 | `#151517` | Raised elements. |
| Border | `#232326` | Hairlines. |
| Text | `#fafafa` | Headlines / primary. |
| Text muted | `#d8d8dc` | Body. |
| Text dim | `#a6a6ad` | Secondary. |
| Cyan | `#6fa8c9` | "Paper / practice" accent. |
| Violet | `#9a8fd4` | "Backtest" accent. |
| Amber | `#d6a84a` | "Monetized" accent. |
| Loss | `#d97066` | Down / negative. |

Light theme flips the accent to deep green `#3f6212` so it stays readable on white
(buttons and `text-accent` keep contrast). See `apps/web/src/index.css`.

## Typography

- **Display / headlines:** Playfair Display (serif, 700, italic for emphasis) - falls back to Georgia.
- **Body / UI:** IBM Plex Sans - falls back to Segoe UI / Arial.
- **Data / mono:** IBM Plex Mono - falls back to Consolas.

Convention: **"Fangorn"** in white, **"*Market*"** in chartreuse italic.

## Logo

- `icon.svg` - the mark alone (avatar, favicon, app icon). A tree whose branches rise
  into a market graph, ending in a bright "market high" node.
- `logo.svg` - horizontal lockup (mark + wordmark).
- Clearspace ≥ the height of the mark's trunk. Never recolor the mark off-accent.
- On light backgrounds, use the deep-green accent variant.

## Assets in this folder

- `icon.svg`, `logo.svg` - scalable masters (edit these).
- `twitter-banner.svg` - 1500×500 master.
- `twitter-banner.jpg` - 1500×500 raster, ready to upload to X/Twitter.

## Voice

Confident, plain, non-hypey. "Build smarter agents. Trade proven intelligence."
Always lead with **non-custodial** and **verifiable** - the trust story is the product.
