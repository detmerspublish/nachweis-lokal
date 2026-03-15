# Nachweis Lokal

**Prüfungen dokumentieren — einfach und sicher.**

Desktop-App für Prüfprotokolle und Checklisten. Für Kleingewerbe in Deutschland.

## Features

- **Wizard-basierter Einstieg** — Betrieb beschreiben, passende Checklisten erhalten
- **5 Basis-Checklisten** — Brandschutz, Erste-Hilfe, Leitern, Unterweisung, Fluchtweg
- **Eigene Checklisten erstellen** — unbegrenzt, kostenlos
- **Prüfung Schritt für Schritt** — Punkte abhaken, Fotos machen, Mängel dokumentieren
- **PDF-Prüfprotokolle** — Professionell mit Briefkopf und QR-Code
- **Revisionssicher** — HMAC-SHA256 Hash-Kette erkennt Manipulation
- **Offline-first** — Alle Daten lokal, keine Cloud, kein Account
- **Mehrsprachig** — Deutsch + Untertitel in Türkisch und Englisch

## Installation

### Offizielle Installer (empfohlen)

Signierte Installer für Windows, macOS und Linux:
**[detmers-publish.de/nachweis-lokal](https://portal.detmers-publish.de/nachweis-lokal)**

### Aus dem Quellcode bauen

Voraussetzungen: Node.js 22+, pnpm

```bash
git clone https://github.com/detmerspublish/nachweis-lokal.git
cd nachweis-lokal
pnpm install
pnpm dev              # Vite Dev-Server
pnpm electron:dev     # Electron-App (Entwicklung)
pnpm electron:build   # Installer bauen
```

## Nachweis Lokal Business

31+ kuratierte Branchenvorlagen, offizielle Installer, automatische Updates und persönlicher Support:
**[detmers-publish.de/nachweis-lokal](https://portal.detmers-publish.de/nachweis-lokal#preise)**

## Lizenz

GPL-3.0 — siehe [LICENSE](LICENSE).

Die Software ist vollständig funktionsfähig und kostenlos nutzbar. Alle Code-Funktionen stehen ohne Einschränkung zur Verfügung.

Die 5 Basis-Checklisten stehen unter CC-BY-SA 4.0. Die kuratierten Branchenvorlagen im Business-Paket sind separat lizenziert und nicht in diesem Repository enthalten.

## Code Signing Policy

Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org).

### Team Roles

| Role | Member | GitHub |
|------|--------|--------|
| Author / Committer | Lars Detmers | [@detmerspublish](https://github.com/detmerspublish) |
| Reviewer | Lars Detmers | [@detmerspublish](https://github.com/detmerspublish) |
| Approver | Lars Detmers | [@detmerspublish](https://github.com/detmerspublish) |

All team members use MFA. Only CI-built artifacts from the `main` branch are signed.

### Open Source Compliance

All code in the signed packages is GPL-3.0. Business templates are NOT included in the signed installer — they are delivered separately.

### Privacy

No telemetry, no analytics, no tracking. All data stays on the user's device. See [Privacy Policy](https://portal.detmers-publish.de/datenschutz).

## Support

- **Community**: [GitHub Issues](https://github.com/detmerspublish/nachweis-lokal/issues)
- **Business-Kunden**: E-Mail-Support

---

Made in Germany by [Detmers Publishing & Media](https://portal.detmers-publish.de)
