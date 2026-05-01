# Build & deploy

## Lokaal
```
npm install
npm run dev      # vite dev server op :5173
npm run build    # productie-bundle in dist/
```

## Productie-bundle
- `vite-plugin-pwa` genereert `dist/manifest.webmanifest`, `dist/sw.js`, `dist/registerSW.js`.
- `vite.config.ts` zet `base` conditioneel: `/` op Vercel-builds (detecteert `process.env.VERCEL === "1"`) en `/md-editor/` op alle andere builds (zoals GH Pages). De PWA-`scope` volgt dezelfde waarde.
- `vite.config.ts` leest `package.json` en injecteert `__APP_VERSION__` als compile-time constant; `main.ts` zet daarmee `document.title = "md-editor <version>"`.
- Iconen in `public/icons/` worden 1-op-1 gekopieerd; iconen in `icons/` (gebruikt door CSS) worden door Vite verwerkt en gehasht.

## Versie-bumping
Een lokale PreToolUse-hook (in Claude-settings) bumpt de patch-versie in `package.json` automatisch bij elke `git commit`. De volgende build pikt die nieuwe waarde op via `__APP_VERSION__` en toont 'm in de tab-titel.

## Deploy targets

### Vercel (canonical)
- URL: `md-editor.elidesmet.nl`
- Vercel detecteert pushes naar `main` automatisch en bouwt met `VERCEL=1` in de env, dus `base` wordt `/`.
- Security-headers worden gezet via [`vercel.json`](../vercel.json) — zie [security.md](security.md) voor de volledige policy.
- Custom domain: in Vercel project → Settings → Domains. DNS bij de elidesmet.nl-provider: CNAME `md-editor` → `cname.vercel-dns.com`. Vercel issued automatisch een Let's Encrypt-certificaat.

### GitHub Pages (legacy)
- URL: `eldesm.github.io/md-editor/`
- Workflow [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) deployt op push naar `main` met `base: "/md-editor/"`.
- CSP via meta-tag (geen `frame-ancestors`-defense — die werkt alleen via HTTP-header).
- Blijft draaien tijdens de migratie; bestaande PWA-installaties op deze origin blijven functioneren tot gebruikers handmatig overstappen naar de Vercel-URL.

## CI/CD
Zie [CI.md](CI.md) voor de GitHub Actions workflows (deploy + security audit).

## PWA install-flow
1. Gebruiker bezoekt de app-URL in Chrome/Edge.
2. Browser leest manifest, toont install-prompt in de adresbalk.
3. Geïnstalleerde app draait standalone (eigen venster, dock/desktop icoon).
4. Service worker cached alle assets → werkt offline na eerste bezoek.

PWA-installaties zijn aan een specifieke origin gebonden. Een gebruiker die de app op `eldesm.github.io/md-editor/` had geïnstalleerd moet 'm opnieuw installeren op `md-editor.elidesmet.nl` om de nieuwe headers + URL te benutten.

## Browser-support

| Feature | Chrome | Edge | Firefox | Safari |
|---|---|---|---|---|
| File System Access API | ✓ | ✓ | ✗ | ✗ |
| Service Worker / PWA install | ✓ | ✓ | ✓ (geen install) | ✓ (beperkt) |
| IndexedDB | ✓ | ✓ | ✓ | ✓ |

**Conclusie:** de app vereist Chrome of Edge voor volledige functionaliteit. Bij ontbreken van File System Access API toont de app een waarschuwing en disabled de "Open folder"-knop.
