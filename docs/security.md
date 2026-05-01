# Security

## Threat model
Single-user note-taking app, geen backend, geen multi-user data. Gevoelige data (notes) blijft op de schijf van de gebruiker.

## Mitigaties

| Risico | Mitigatie |
|---|---|
| XSS via markdown content (live preview) | CodeMirror widgets gebruiken `textContent`/`setAttribute`, nooit `innerHTML` van content. |
| XSS via PDF export | `marked` output gaat door `DOMPurify.sanitize` voordat hij als `innerHTML` op `#pdf-print-root` in het hoofd-document gezet wordt. |
| XSS via Word export | Zelfde sanitize-stap; daarnaast wordt de title gestript van `<>&` en het document opent in Word, niet in een browser-context. |
| Data leak naar externe servers | Geen externe network calls. CSP `default-src 'self'` + `connect-src 'self'` blokkeren onbedoelde uitgaande requests. |
| Filesystem misbruik | File System Access API sandbox: app heeft alleen toegang tot de door de gebruiker expliciet gekozen werkmap. |
| Compromised dependencies | Build-time deps zitten niet in productie-bundle. `package-lock.json` pinpt versies. Wekelijkse `npm audit` in CI faalt bij high/critical CVE's — zie [CI.md § 1.2](CI.md). |
| Compromised GitHub-account → kwaadaardige deploy | Externe mitigaties: GitHub 2FA, branch protection op `main`, PR-review-vereiste. |

## Content-Security-Policy
Aanwezig als `<meta http-equiv="Content-Security-Policy">` in `index.html`:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';   (CodeMirror gebruikt inline styles)
img-src 'self' data:;                (geinlinede icons als data-URLs)
font-src 'self' data:;
connect-src 'self';
worker-src 'self';
manifest-src 'self';
frame-src 'self';                    (vroeger gebruikt voor PDF-iframe; nu strikter dan nodig — kan terug naar 'none')
object-src 'none';
base-uri 'self';
form-action 'none';
```

### Beperkingen van een meta-tag CSP
- `frame-ancestors`, `report-uri`/`report-to` en `sandbox` worden door browsers genegeerd in een meta-tag — alleen werkbaar via een echte HTTP-header. GitHub Pages staat geen custom headers toe; een verhuizing naar een host die dat wel doet (Cloudflare Pages, Netlify, Vercel) is voorwaarde om die directives te activeren.
- `unsafe-inline` voor styles is vereist door CodeMirror. Niet vermijdbaar zonder CodeMirror te forken of nonces server-side te genereren (niet mogelijk bij static hosting).

## Dependency scanning
- **CI gate**: `npm audit --omit=dev --audit-level=high` draait op push, PR en wekelijks (zie [CI.md § 1.2](CI.md)). Faalt de build bij een high/critical CVE in productie-deps.
- **GitHub Dependabot**: aan te zetten via repo → Settings → Code security voor automatische alerts en patch-PR's.

## Bekende beperkingen
- Geen Subresource Integrity (alle assets zijn same-origin, dus weinig toegevoegde waarde).
- Geen `frame-ancestors` clickjacking-defense zolang de site via GitHub Pages loopt (zie boven).
