# Build & deploy

## Lokaal
```
npm install
npm run dev      # vite dev server op :5173
npm run build    # productie-bundle in dist/
```

## Productie-bundle
- `vite-plugin-pwa` genereert `dist/manifest.webmanifest`, `dist/sw.js`, `dist/registerSW.js`.
- `base: "/md-editor/"` zodat alle URLs werken onder `eldesm.github.io/md-editor/`.
- `vite.config.ts` leest `package.json` en injecteert `__APP_VERSION__` als compile-time constant; `main.ts` zet daarmee `document.title = "md-editor <version>"`.
- Iconen in `public/icons/` worden 1-op-1 gekopieerd; iconen in `icons/` (gebruikt door CSS) worden door Vite verwerkt en gehasht.

## Versie-bumping
Een lokale PreToolUse-hook (in Claude-settings) bumpt de patch-versie in `package.json` automatisch bij elke `git commit`. De volgende build pikt die nieuwe waarde op via `__APP_VERSION__` en toont 'm in de tab-titel.

## CI/CD
Zie [CI.md](CI.md) voor de GitHub Actions workflows (deploy + security audit).

## PWA install-flow
1. Gebruiker bezoekt `https://eldesm.github.io/md-editor/` in Chrome/Edge.
2. Browser leest manifest, toont install-prompt in de adresbalk.
3. Geïnstalleerde app draait standalone (eigen venster, dock/desktop icoon).
4. Service worker cached alle assets → werkt offline na eerste bezoek.

## Browser-support

| Feature | Chrome | Edge | Firefox | Safari |
|---|---|---|---|---|
| File System Access API | ✓ | ✓ | ✗ | ✗ |
| Service Worker / PWA install | ✓ | ✓ | ✓ (geen install) | ✓ (beperkt) |
| IndexedDB | ✓ | ✓ | ✓ | ✓ |

**Conclusie:** de app vereist Chrome of Edge voor volledige functionaliteit. Bij ontbreken van File System Access API toont de app een waarschuwing en disabled de "Open folder"-knop.
