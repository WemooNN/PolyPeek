# Tools

Scripts used to generate PolyPeek's icons, store images and 3D models. They have no dependencies beyond Windows PowerShell (System.Drawing) and Node.js.

| Script | Output |
|---|---|
| `make-icons.ps1 -OutDir <dir> -StoreDir <dir>` | Extension icons (16/32/48/128) and store promo tiles (440x280, 1400x560) |
| `make-shots.ps1 -In <dir> -Out <dir>` | Annotated 1280x800 store screenshots. Expects raw 1280x800 captures named `shot8.png`, `shot9.png` and `shot10.png` in `-In` |
| `node make-glb.js [out.glb]` | 3D logo (`polypeek-logo.glb`) |
| `node make-glb2.js [out.glb]` | Animated showcase scene (`polypeek-showcase.glb`). Expects `panel1.jpg`–`panel3.jpg` (1024x640) next to the script |
