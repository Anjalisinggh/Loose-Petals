# Loose Petals

A little world of unreasonable nature — an interactive botanical playground where flowers behave like physical objects.

- **Drag** a flower to bend and stretch its stem; **release** to let it spring back.
- **Click** empty paper to grow a new flower, or click a stem to grow a side shoot.
- **Type** anywhere and the word appears in the centre with flowers growing out of the letters.
- **Wind**, **gusts** and **gravity** controls, a **petal storm**, and **Save PNG**.

## Run it

```bash
npm install
npm run dev
```

`npm run build` type-checks and produces a production build in `dist/`.

## How it is built

React, TypeScript and Vite, rendering to a single HTML canvas. Flower heads and loose petals are Matter.js bodies; stems are a custom chain of stretch and bend springs stepped at a fixed 120 Hz.

| Folder | What lives there |
| --- | --- |
| `src/canvas` | Canvas sizing, device-pixel-ratio scaling, paper texture, sprite baking |
| `src/garden` | Flower varieties, plant generation, the opening composition, typed letters, the main `Garden` loop |
| `src/physics` | Matter.js world, stem springs, wind field |
| `src/particles` | Loose petals and pollen |
| `src/input` | Mouse, pen and touch handling |
| `src/render` | Drawing |
| `src/export` | PNG export |
| `src/ui` | React controls |
