# VNS GA Utils

A TypeScript library built with Rollup that creates a standalone JavaScript bundle for browser use.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Build the library:
```bash
npm run build
```

By default this outputs two files:
- `dist/vns-ga-utils.js` (readable, with source map)
- `dist/vns-ga-utils.min.js` (minified, with source map; set `OBFUSCATE=true` to also obfuscate)

To build with obfuscation:
```bash
OBFUSCATE=true npm run build
```

3. Watch mode for development:
```bash
npm run dev
```

## Usage

After building, include the generated file in your HTML:

```html
<script src="dist/vns-ga-utils.js"></script>
<script>
  // Option 1: If VnsGaUtil is a class
  function main() {
    const vnsGaUtil = new window.VnsGaUtil.VnsGaUtil();
    vnsGaUtil.addSectionVisibility("hero", {
        scrollDepth: 50,
        viewTime: 3000,
        customEvent: "hero_view",
    });
    vnsGaUtil.addSectionVisibility("features", {
        scrollDepth: 75,
        viewTime: 5000,
        customEvent: "features_view",
    });
    vnsGaUtil.addSectionVisibility("how-it-works", {
        scrollDepth: 20,
        viewTime: 1000,
        customEvent: "how-it-works_view",
    });
    vnsGaUtil.addSectionVisibility("how-it-works", {
        scrollDepth: 60,
        viewTime: 2000,
        customEvent: "how-it-works_view_2000",
    });
    vnsGaUtil.trackSectionVisibility();
    vnsGaUtil.checkUserReturn();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }

</script>
```

## Configuration

The build configuration is in `rollup.config.js`. The output format is UMD, which:
- Creates a standalone bundle
- Attaches to `window.VnsGaUtil`
- Includes source maps for debugging

## Project Structure

```
vns-ga-utils/
├── src/
│   └── index.ts          # Main entry point
├── dist/                 # Build output (generated)
│   ├── vns-ga-utils.js   # Main bundle
│   ├── vns-ga-utils.js.map  # Source map
│   └── index.d.ts        # TypeScript declarations
├── rollup.config.js      # Rollup configuration
├── tsconfig.json         # TypeScript configuration
└── package.json
```

## Customization

To change what gets exported to `window.VnsGaUtil`, modify the default export in `src/index.ts`:
- Export a class for `window.VnsGaUtil` to be a class
- Export an object/namespace for `window.VnsGaUtil` to contain classes and utilities

