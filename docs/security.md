# Security

## Threat model
Browser-only app, geen backend, geen multi-user data. Notes blijven op de schijf van elke individuele gebruiker. Relevante aanvalsvectoren: clickjacking van save/delete-acties, XSS via geïmporteerde markdown, supply-chain compromise van dependencies.

## Mitigaties

| Risico | Mitigatie |
|---|---|
| XSS via markdown content (live preview) | CodeMirror widgets gebruiken `textContent`/`setAttribute`, nooit `innerHTML` van content. |
| XSS via PDF export | `marked` output gaat door `DOMPurify.sanitize` voordat hij als `innerHTML` op `#pdf-print-root` in het hoofd-document gezet wordt. |
| XSS via Word export | Zelfde sanitize-stap; daarnaast wordt de title gestript van `<>&` en het document opent in Word, niet in een browser-context. |
| Clickjacking (iframe-overlay tricks save/delete) | `frame-ancestors 'none'` in de Vercel CSP-header + `X-Frame-Options: DENY`. |
| Data leak naar externe servers | Geen externe network calls. CSP `default-src 'self'` + `connect-src 'self'` blokkeren onbedoelde uitgaande requests. |
| Filesystem misbruik | File System Access API sandbox: app heeft alleen toegang tot de door de gebruiker expliciet gekozen werkmap. |
| MIME-confusion / content-sniffing | `X-Content-Type-Options: nosniff` op Vercel. |
| API-misbruik door geïnjecteerd script | `Permissions-Policy` disabled `camera`, `microphone`, `geolocation`, `interest-cohort`, `browsing-topics`. |
| Compromised dependencies | Build-time deps zitten niet in productie-bundle. `package-lock.json` pint versies. Wekelijkse `npm audit` in CI faalt bij high/critical CVE's — zie [CI.md § 1.2](CI.md). |
| Compromised GitHub-account → kwaadaardige deploy | Externe mitigaties: GitHub 2FA, branch protection op `main`, PR-review. Vercel deployt vanuit GitHub dus erft die beveiliging. |

## Hosting & headers

De app draait parallel op twee origins. De Vercel-versie heeft de sterkere headers; de GH Pages-versie blijft beschikbaar omdat `github.io` corporate-whitelisted is op veel werklaptops waar het nieuwe eigen domein in een "beperkte weergave" terechtkomt.

| URL | Host | CSP-bron | Andere headers |
|---|---|---|---|
| `md-editor.elidesmet.nl` (canonical) | Vercel | HTTP-header in [`vercel.json`](../vercel.json) | XFO, nosniff, Referrer-Policy, Permissions-Policy, HSTS |
| `eldesm.github.io/md-editor/` (corporate-friendly) | GitHub Pages | Meta-tag in `index.html` | Alleen wat GH Pages standaard zet (HSTS) |

GitHub Pages laat geen custom HTTP-headers toe. De meta-tag-CSP is een baseline-policy zonder `frame-ancestors` (die directive werkt alleen via een HTTP-header). De canonical Vercel-deploy is strikter en preferent voor users zonder corporate restricties.

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

## Code- en dependency-scanning
- **Eigen code (`src/`)**: CodeQL met `security-extended` queries draait op push, PR en wekelijks (zie [CI.md § 1.3](CI.md)). Findings verschijnen in de GitHub Security-tab — server-side, niet via een PR-edit te verbergen. Detecteert XSS-sinks, prototype pollution, regex-DoS, onveilige deserialisaties en hardcoded secrets.
- **Dependencies (`package-lock.json`)**: `npm audit --omit=dev --audit-level=high` (zie [CI.md § 1.2.1](CI.md)) faalt de build bij high/critical CVE's in productie-deps.
- **GitHub Dependabot**: aan te zetten via repo → Settings → Code security voor automatische alerts en patch-PR's.

## Bekende beperkingen
- `unsafe-inline` voor styles is vereist door CodeMirror. Niet vermijdbaar zonder CodeMirror te forken of build-time HTML-rewriting met nonces.
- Geen Subresource Integrity (alle assets zijn same-origin, dus weinig toegevoegde waarde).
- Geen runtime CSP-violation-monitoring (`report-uri`/`report-to` zijn geconfigureerd noch ingericht). Toevoegen van een rapporteringseindpunt is een volgende stap.
- Agent-trust: alle CI-gates leven in de repo en kunnen via een PR-edit geneutraliseerd worden. De echte verdediging is branch protection met required status checks — nog te configureren in GitHub-settings.
