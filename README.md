# Block City Mayhem

A tiny low-poly, GTA-style open-city game that runs entirely in your browser. Steal cars, dodge the cops, and finish 5 story levels — no install, no build step, no assets to download.

**▶ Play it here: [happysingh3d.github.io/block-city-mayhem](https://happysingh3d.github.io/block-city-mayhem/)**

## Controls

| Input | Action |
|---|---|
| Click the game | Lock the mouse (required for camera) |
| Mouse | Third-person camera orbit |
| Mouse wheel | Zoom in / out |
| `W A S D` / arrows | Walk / drive |
| `Shift` | Run |
| `Space` | Jump (on foot) / handbrake (in car) |
| `E` | Enter / exit the nearest car |
| `Esc` | Pause menu |

## Levels

1. **Pizza Rush** — timed pickup and delivery
2. **Repo Man** — chase down and ram the target car
3. **Heat Wave** — survive a 2-star wanted level
4. **Checkpoint Run** — a 6-checkpoint street race
5. **The Big Score** — rob the vault and escape a 3-star manhunt

Levels unlock in order; progress is saved in your browser (localStorage). There's also a Free Roam mode.

## Run locally

Pointer Lock and CDN scripts need the page served over HTTP (not opened as a `file://`). From the repo folder:

```bash
npx serve
# or: python -m http.server 8000
```

Then open the printed localhost URL.

## Tech

Plain HTML5 + vanilla JavaScript + [Three.js](https://threejs.org/) (r128, loaded from CDN). Everything is drawn from primitives — instanced buildings, hand-rolled AABB collisions, arcade car physics, a node-graph traffic system, and a 2D canvas minimap. Total code size ≈ 40 KB.

## License

MIT — see [LICENSE](LICENSE).
