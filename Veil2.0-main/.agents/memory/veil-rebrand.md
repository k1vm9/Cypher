---
name: Veil rebrand decisions
description: Key decisions made when rebuilding the dashboard as "Veil" — colors, logo SVG, token key, file changes
---

## Color system
- Light mode: `--bg:#F5F5DA` (cream), `--accent:#7B021D` (dark maroon)
- Dark mode: `--bg:#140919` (deep purple), `--accent:#D76960` (coral/salmon)
- Default theme: dark (`data-theme="dark"` on `<html>`)
- Theme preference stored in `localStorage` key `veil_theme`

## V logo SVG (interlaced)
Left arm passes behind right arm. Crossing point at approximately (40, 64) in an 80×80 viewBox.
```svg
<line x1="13" y1="9" x2="45" y2="74" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>
<line x1="43" y1="59" x2="37" y2="69" stroke="var(--bg)" stroke-width="14" stroke-linecap="round"/>
<line x1="67" y1="9" x2="35" y2="74" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>
```
The middle cover line uses `var(--bg)` so it adapts to both light and dark themes.

## localStorage token key
Changed from `david_token` → `veil_token`. Existing sessions are invalidated on rename.

## Files changed
- `src/dashboard/public/index.html` — full rewrite (Veil branding, new CSS palette)
- `src/dashboard/public/manifest.json` — renamed to Veil
- `src/dashboard/public/sw.js` — cache renamed to `veil-v1`
- `src/dashboard/public/favicon.svg` — new SVG favicon with interlaced V
- `config.json` — `botName` → "Veil"
- `package.json` — `name` → "veil"
- `David.js` — banner and fallback botName → "Veil"

**Why:** Complete rebrand requested by user; all Arabic UI text preserved (bot is Arabic-language).

**How to apply:** If adding new pages/tabs, use `var(--accent)` for primary color and `var(--bg)` for background. Always test cover lines in SVG logos use `var(--bg)` not a hardcoded color.
