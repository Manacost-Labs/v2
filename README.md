# Manacost V2

Independent Next.js frontend for the experimental [v2.hs-manacost.ru](https://v2.hs-manacost.ru) experience.
The existing WordPress installation remains the editorial CMS and canonical content source.

## Boundaries

- Public, read-only WordPress REST requests only.
- No authentication, VIP, comments, analytics, or WordPress writes.
- VIP category and inline paywall content are excluded.
- WordPress HTML is sanitized before rendering; media requests use a strict origin allowlist.
- The entire V2 host is `noindex, nofollow` while it remains experimental.

See [the architecture contract](docs/architecture/headless-v2.md) for runtime, deployment, and rollback details.

## Development

```bash
nvm use
npm ci --ignore-scripts
npm run dev
```

The default content endpoint is `https://hs-manacost.ru/wp-json/wp/v2`.

## Verification

```bash
npm run check
npm run test:browser
npm audit --omit=dev --audit-level=high
bash -n ops/web-v2/release.sh
```

Production activation is intentionally separate from merge. The release script accepts only an exact, clean SHA already fetched from `origin/main`.
