/**
 * Production build, driven by the JS API instead of the plain `bun build` CLI for two reasons:
 *
 * 1. `PUBLIC_PATH` lets the same script produce a root-relative build (Vercel, served from `/`)
 *    or a subpath build (GitHub Pages, served from `/<repo>/`) without two divergent configs.
 * 2. `coi-serviceworker.js` (ADR: cross-origin isolation on hosts without custom response headers
 *    — GitHub Pages) must reach `dist/` as a byte-exact, unbundled file at a stable path: it is
 *    fetched twice by the browser under two different meanings of the same URL — once as a normal
 *    script, once as a standalone service worker — and either bundling or renaming it breaks that.
 *    Bun's HTML bundler has no "copy, don't bundle" tag option today, so it is deliberately kept out
 *    of index.html's source and spliced into the built HTML after Bun has already processed it.
 */

export {};

const publicPath = process.env.PUBLIC_PATH ?? '';

const result = await Bun.build({
  entrypoints: ['./index.html'],
  outdir: './dist',
  minify: true,
  publicPath,
});

if (!result.success) {
  for (const message of result.logs) console.error(message);
  throw new Error('Build failed');
}

await Bun.write('./dist/coi-serviceworker.js', Bun.file('./coi-serviceworker.js'));

const indexPath = './dist/index.html';
const original = await Bun.file(indexPath).text();
const swTag = '<script src="./coi-serviceworker.js"></script>';
if (!original.includes('<head>')) {
  throw new Error('dist/index.html has no <head> tag to inject the service-worker script into');
}
await Bun.write(indexPath, original.replace('<head>', `<head>${swTag}`));

console.log(`Built dist/ (publicPath="${publicPath || '/'}"), coi-serviceworker.js copied and wired.`);
