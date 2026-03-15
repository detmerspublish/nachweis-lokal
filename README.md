# Nachweis Lokal

**Prüfungen dokumentieren — einfach und sicher.**

Desktop-App für Prüfprotokolle und Checklisten. Für Kleingewerbe in Deutschland.

## Features

- **Wizard-basierter Einstieg** — Betrieb beschreiben, passende Checklisten erhalten
- **35+ Checklisten** — Brandschutz, Hygiene, Elektro, Spielgeräte, und mehr
- **Prüfung Schritt für Schritt** — Punkte abhaken, Fotos machen, Mängel dokumentieren
- **PDF-Prüfprotokolle** — Professionell mit Briefkopf und QR-Code
- **Revisionssicher** — HMAC-SHA256 Hash-Kette erkennt Manipulation
- **Offline-first** — Alle Daten lokal, keine Cloud, kein Account
- **Mehrsprachig** — Deutsch + Untertitel in Türkisch und Englisch
- **KI-Assistent** — Betrieb beschreiben, passende Checklisten finden

## Installation

### Offizielle Installer (empfohlen)

Signierte Installer für Windows, macOS und Linux:
**[detmers-publish.de/nachweis-lokal](https://portal.detmers-publish.de/nachweis-lokal)**

### Aus dem Quellcode bauen

Voraussetzungen: Node.js 22+, pnpm

```bash
# Repository klonen
git clone https://github.com/detmerspublish/nachweis-lokal.git
cd nachweis-lokal

# Abhängigkeiten installieren
pnpm install

# Entwicklungsserver starten
pnpm dev

# Electron-App starten (Entwicklung)
pnpm electron:dev

# Installer bauen
pnpm electron:build
```

## Technologie

- **Electron** + **Svelte 5** + **SQLite**
- **tamper-evident-log** für Hash-Kette (eigenes [npm-Paket](https://www.npmjs.com/package/tamper-evident-log))
- Shared Packages: electron-platform, app-shared, ui-shared, shared

## Lizenz

GPL-3.0 — siehe [LICENSE](LICENSE).

Die Software ist vollständig funktionsfähig und kostenlos nutzbar.

### Nachweis Lokal Business

Kuratierte Branchenvorlagen, offizielle signierte Installer, automatische Updates und persönlicher Support: **[detmers-publish.de/nachweis-lokal](https://portal.detmers-publish.de/nachweis-lokal#preise)**

## Support

- **Community**: [GitHub Issues](https://github.com/detmerspublish/nachweis-lokal/issues)
- **Business-Kunden**: E-Mail-Support (Details im Business-Paket)

## Beitragen

Beiträge sind willkommen. Bitte öffne zuerst ein Issue bevor du einen PR erstellst.

---

Made with ❤️ in Germany by [Detmers Publishing & Media](https://portal.detmers-publish.de)
