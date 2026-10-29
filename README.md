# Hall Pass

A single-file browser game. `index.html` is the entire thing — all HTML, CSS,
JavaScript, sprites, and audio are inline. There are no assets, no dependencies,
no package.json, and no build step.

## Deploying

Serve `index.html` as a static file at the root of a domain. That's it.

- **Build command:** none
- **Build output directory:** repository root (`/`)
- **Framework preset:** none / static

## Do not

- Do not add a bundler, minifier, or framework.
- Do not split the file into separate .css/.js files — it is deliberately
  one file so it can be dropped anywhere.
- Do not reformat or "optimize" it. Future updates arrive as a full
  replacement of this file.

## Requirements of the host

The page must be served over HTTPS and must **not** send a restrictive
`X-Frame-Options` or `frame-ancestors` header, because the finished URL is
embedded in a Google Site via an iframe. Cloudflare Pages and GitHub Pages
both satisfy this by default.

## Updating later

Replace `index.html` with the new version, commit, let the host redeploy.
The public URL must stay the same so the Google Site embed never needs editing.
