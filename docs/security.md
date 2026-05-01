# Security

## Threat model
Browser-only app, geen backend, geen multi-user data. Notes blijven op de schijf van elke individuele gebruiker. Relevante aanvalsvectoren: clickjacking van save/delete-acties, XSS via geïmporteerde markdown, supply-chain compromise van dependencies.

## Mitigaties

| Risico | Mitigatie |
|---|---|
| XSS via markdown content (live preview) | CodeMirror widgets gebruiken `textContent`/`setAttribute`, nooit `innerHTML` van content. |
| XSS via PDF export | `marked` output gaat door `DOMPurify.sanitize` voordat hij als `innerHTML` op `#pdf-print-root` in het hoofd-document gezet wordt. |
| XSS via Word export | Zelfde sanitize-stap; daarnaast wordt de title gestript van `<>&` en het document opent in Word, niet in een browser-context. |
| Clickjacking (iframe-overlay tricks save/delete) | `frame-ancestors 'none'` in de Vercel CSP-header + `X-Frame-Options: DENY`. Werkt alleen op Vercel — GH Pages-versie heeft deze defense niet (meta-tag CSP negeert `frame-ancestors`). |
| Data leak naar externe servers | Geen externe network calls. CSP `default-src 'self'` + `connect-src 'self'` blokkeren onbedoelde uitgaande requests. |
| Filesystem misbruik | File System Access API sandbox: app heeft alleen toegang tot de door de gebruiker expliciet gekozen werkmap. |
| MIME-confusion / content-sniffing | `X-Content-Type-Options: nosniff` op Vercel. |
| API-misbruik door geïnjecteerd script | `Permissions-Policy` disabled `camera`, `microphone`, `geolocation`, `interest-cohort`, `browsing-topics`. |
| Compromised dependencies | Build-time deps zitten niet in productie-bundle. `package-lock.json` pint versies. Wekelijkse `npm audit` in CI faalt bij high/critical CVE's — zie [CI.md § 1.2](CI.md). |
| Compromised GitHub-account → kwaadaardige deploy | Externe mitigaties: GitHub 2FA, branch protection op `main`, PR-review. Vercel deployt vanuit GitHub dus erft die beveiliging. |

## Hosting & headers

De app draait op twee origins:

| URL | Host | CSP-bron | Andere headers |
|---|---|---|---|
| `md-editor.elidesmet.nl` (canonical) | Vercel | HTTP-header in [`vercel.json`](../vercel.json) | XFO, nosniff, Referrer-Policy, Permissions-Policy, HSTS |
| `eldesm.github.io/md-editor/` (legacy) | GitHub Pages | Meta-tag in `index.html` | Alleen wat GH Pages standaard zet (HSTS) |

GitHub Pages laat geen custom HTTP-headers toe. De meta-tag-CSP daar is een baseline voor bestaande PWA-installaties die nog niet zijn overgestapt. De canonical Vercel-deploy is strikter en heeft `frame-ancestors`, dat in een meta-tag wordt genegeerd.

### Vercel CSP (HTTP-header, canonical)

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';   (CodeMirror inline styles)
img-src 'self' data:;
font-src 'self' data:;
connect-src 'self';
worker-src 'self';
manifest-src 'self';
frame-src 'none';                   (geen iframes)
frame-ancestors 'none';             (geen embedding — clickjacking-defense)
object-src 'none';
base-uri 'self';
form-action 'none';
```

### GH Pages CSP (meta-tag, legacy)

Identiek aan boven, maar zonder `frame-ancestors` (genegeerd in meta) en met `frame-src 'self'` (kan strikter, niet relevant zolang GH Pages geen iframes gebruikt).

## Dependency scanning
- **CI gate**: `npm audit --omit=dev --audit-level=high` draait op push, PR en wekelijks (zie [CI.md § 1.2](CI.md)). Faalt de build bij een high/critical CVE in productie-deps.
- **GitHub Dependabot**: aan te zetten via repo → Settings → Code security voor automatische alerts en patch-PR's.

## Bekende beperkingen
- `unsafe-inline` voor styles is vereist door CodeMirror. Niet vermijdbaar zonder CodeMirror te forken of build-time HTML-rewriting met nonces.
- Geen Subresource Integrity (alle assets zijn same-origin, dus weinig toegevoegde waarde).
- Geen runtime CSP-violation-monitoring (`report-uri`/`report-to` zijn geconfigureerd noch ingericht). Toevoegen van een rapporteringseindpunt is een volgende stap.
- Agent-trust: alle CI-gates leven in de repo en kunnen via een PR-edit geneutraliseerd worden. De echte verdediging is branch protection met required status checks — nog te configureren in GitHub-settings.
