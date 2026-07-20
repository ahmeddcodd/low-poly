# Scoop Ready — ice cream shop game

A mobile-first Three.js ice cream shop game with an animated worker, customer queues, flavor machines, preparation stations, serving, cash rewards, collisions, and responsive touch, mouse, and keyboard controls.

## Run locally

```bash
pnpm install
pnpm dev
```

Create the production bundle with:

```bash
pnpm build
```

## Controls

- Drag on the restaurant floor or use WASD/arrow keys to move the worker.
- The camera follows the worker while customers walk from the entrance to the order counter queue.
- Pinch or use the mouse wheel to zoom.
- Tap a green marker to select a future build slot.
- Use **Build slots** for a clean model-only view.
- Use the home button to reset the camera.

## Deploy to Vercel

The repository includes `vercel.json` with the Vite framework, production build command, `dist` output directory, SPA fallback, immutable caching for hashed assets, and basic security headers.

Deploy from the Vercel dashboard by importing this repository, or deploy with the CLI:

```bash
pnpm dlx vercel
```

Create a production deployment with:

```bash
pnpm dlx vercel --prod
```

No environment variables or server functions are required. Vercel installs from `pnpm-lock.yaml`, runs `pnpm run build:vercel`, and serves the generated `dist` directory.

## Character art pipeline

The playable cast uses the individual GLBs in `character_exports_v2`. The Blender 5.2+ pipeline preserves every gameplay clip while rebuilding the shared rest skeleton and skinned meshes into a short, rounded, completely faceless hyper-casual style.

```bash
blender --background --python scripts/stylize_faceless_characters_blender.py -- --input-dir character_exports_v2 --output-dir character_exports_v2
blender --background --python scripts/validate_character_glbs.py -- --input-dir character_exports_v2
```

The conversion is versioned in glTF extras, so rerunning it will not compact an already converted rig a second time. It also removes every `CHR_Face_*` mesh to keep the heads blank. Use `render_character_preview.py` for an isolated visual check and `audit_character_glb.py` for detailed rig/action inspection.


## Extension points

- Add authored placement definitions in `src/config.js`.
- Place station models under the matching `Placement_<id>` group or use each definition's world position.
- Address authored GLB pieces by their semantic names (for example `Floor_Cream_Tiles` and `Door_Entrance_Left`).
- Keep game state separate from `restaurant-scene.js`; the scene module coordinates presentation while `character-system.js` owns the cast and its animation mixers.
- Use `CharacterSystem.setAnimation()` with the role-specific player/customer animation names when gameplay states are added.

The game is Vercel-ready as a static Vite deployment. YouTube Playables SDK integration and official certification remain separate release steps.
