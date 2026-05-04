const NEW_URL = "https://md-editor.elidesmet.nl/";
const DISMISS_KEY = "migration-banner-dismissed-at";
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000;

function isOnGitHubPages(): boolean {
  return location.hostname.endsWith(".github.io");
}

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const t = Number(raw);
    if (!Number.isFinite(t)) return false;
    return Date.now() - t < DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function showMigrationBannerIfNeeded(): void {
  if (!isOnGitHubPages() || isDismissed()) return;

  const banner = document.createElement("div");
  banner.id = "migration-banner";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-labelledby", "migration-banner-title");

  const text = document.createElement("div");
  text.className = "migration-banner-text";

  const title = document.createElement("strong");
  title.id = "migration-banner-title";
  title.textContent = "md-editor is verhuisd";
  text.appendChild(title);

  const body = document.createElement("span");
  body.textContent =
    "Deze versie wordt niet meer bijgewerkt. Open de nieuwe versie en installeer hem opnieuw als app.";
  text.appendChild(body);

  const cta = document.createElement("a");
  cta.className = "migration-banner-cta";
  cta.href = NEW_URL;
  cta.target = "_blank";
  cta.rel = "noopener noreferrer";
  cta.textContent = "Open md-editor.elidesmet.nl ↗";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "migration-banner-close";
  close.setAttribute("aria-label", "Sluit melding");
  close.title = "Sluit melding";
  close.textContent = "×";
  close.addEventListener("click", () => {
    markDismissed();
    banner.remove();
  });

  banner.appendChild(text);
  banner.appendChild(cta);
  banner.appendChild(close);
  document.body.appendChild(banner);
}
