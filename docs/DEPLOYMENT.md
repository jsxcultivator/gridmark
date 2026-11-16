# Deployment

Gridmark builds to static files. Any host that can serve a folder will do.

```bash
npm install
npm run build     # writes out/
```

## GitHub Pages

The repository ships with `.github/workflows/pages.yml`, which tests, builds and publishes on every push to `main`.

1. Push the repository to GitHub.
2. Open **Settings -> Pages** and set **Source** to **GitHub Actions**.
3. Push to `main`, or run the workflow by hand from the **Actions** tab.

The site appears at `https://<user>.github.io/<repo>/`. The workflow sets `NEXT_PUBLIC_BASE_PATH` to `/<repo>` so assets resolve under that path.

If you serve from a custom domain or a `<user>.github.io` repository, the site lives at the root. Remove the `NEXT_PUBLIC_BASE_PATH` line from the workflow.

## Vercel

Import the repository at vercel.com/new. Vercel detects Next.js and needs no settings.

## Netlify and Cloudflare Pages

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `out` |
| Node version | 20.9 or newer |

## Your own server

Copy `out/` to the server and point the web server at it. With nginx:

```nginx
server {
  listen 80;
  server_name gridmark.example.com;
  root /var/www/gridmark/out;
  index index.html;
  location / {
    try_files $uri $uri/ $uri/index.html =404;
  }
}
```

## Serving from a sub-path

Set `NEXT_PUBLIC_BASE_PATH` when you build:

```bash
NEXT_PUBLIC_BASE_PATH=/tools/gridmark npm run build
```

## Notes

- The build downloads the Schibsted Grotesk font from Google Fonts and bundles it. The build machine needs network access; the deployed site makes no third-party requests.
- There are no environment secrets and no server runtime.
