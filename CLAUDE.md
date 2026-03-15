# Nachweis Lokal — Agent-Anweisungen

## Produkt

Pruefprotokolle, Checklisten und Nachweise. Electron + Svelte 5 + SQLite Desktop-App.
Lokale Dokumentation wiederkehrender Pruefungen mit revisionssicherer Hash-Kette.

## Architektur-Pflicht

**Lies und befolge die uebergeordnete CLAUDE.md im Repo-Root (`../../CLAUDE.md`).**
**Lies und befolge `../../docs/konzept/architektur-integritaet-tests.md` fuer alle DB-Aenderungen.**

Kurzfassung:
- Jede Schreiboperation → Event in events-Tabelle (append-only, Hash-Kette)
- Schema-Version in `_schema_meta` hochzaehlen bei jeder Modellaenderung
- Soft-Delete fuer Vorlagen und Objekte (active-Flag), Hard-Delete fuer Pruefungen
- Alle 7 Testkategorien muessen bestehen vor Release

## Projektstruktur

```
app.config.cjs        Electron-Konfiguration (CFNW-Prefix)
electron/main.cjs     Electron Entry (nutzt @codefabrik/electron-platform)
src/
  lib/
    db.js             DB-Zugriff (Schema, Templates, Objects, Inspections, Events)
    license.js        Probe-Lizenz (10 Vorlagen Limit)
    pdf.js            PDF-Engine (Protokolle, Maengelberichte, Listen)
    stores/
      navigation.js   View-Navigation (String-basiert)
      inspections.js  Svelte Stores (inspections, search, filter)
  routes/
    Dashboard.svelte         Statistiken + Faelligkeitsuebersicht + Offene Maengel
    TemplateList.svelte      Vorlagenliste
    TemplateForm.svelte      Vorlage anlegen/bearbeiten + Pruefpunkte
    TemplateDetail.svelte    Vorlagendetail + Pruefhistorie
    TemplateLibrary.svelte   Vorlagen-Bibliothek (15 fertige Vorlagen)
    ObjectList.svelte        Objektliste (Geraete, Raeume, Anlagen)
    ObjectForm.svelte        Objekt anlegen/bearbeiten
    ObjectDetail.svelte      Objektdetail + Pruefhistorie
    InspectionList.svelte    Pruefungsliste + Filter + CSV/PDF Export
    InspectionForm.svelte    Neue Pruefung anlegen
    InspectionExecute.svelte Interaktive Pruefungsdurchfuehrung + Fotos + Wiederkehrend
    InspectionDetail.svelte  Ergebnisse + PDF + Fotos + Nachpruefung
    DefectList.svelte        Offene Maengel, gruppiert nach Objekt, filterbar
    DefectDetail.svelte      Einzelansicht, Status-Aenderung, Nachpruefung starten
    ImportTemplates.svelte   CSV-Import fuer Vorlagen
    Integrity.svelte         Hash-Ketten-Verifikation + Event-Log
    Settings.svelte          Organisationsprofil + Supportvertrag + Integritaet (Tabs)
    SupportHub.svelte        Support + Ideen + Changelog (Tabs)
    FirstRunWizard.svelte    4-Schritte-Einrichtungsassistent
  components/
    PhotoAttachment.svelte   Foto-Picker + Thumbnail-Galerie pro Ergebnis
  assets/
    template-library.json    15 Vorlagen (Brandschutz, Elektro, Spielgeraete, Leitern, Erste-Hilfe, Regale, UVV-Fahrzeug, PSA, Hygiene, Buero, Unterweisung, IT-Serverraum, Aufzug, Legionellen, Fluchtwege)
  App.svelte                Root-Komponente, Navigation, DB-Init, First-Run-Wizard
tests/
  fixtures/              SQLite-Fixtures pro Version (NIE loeschen)
  test_*.js              Testdateien (node --test)
```

## DB-Layer (src/lib/db.js)

- `initDb()` erstellt Schema v3 (11 Tabellen, Migration v1→v2→v3 integriert)
- Templates: `getTemplates()`, `saveTemplate()`, `deleteTemplate()` (Soft-Delete)
- Template Items: `getTemplateItems()`, `saveTemplateItems()` (Replace-Strategie)
- Template Library: `importLibraryTemplate(libraryTemplate)` — Import aus Vorlagen-Bibliothek
- Template Duplication: `duplicateTemplate(id)` — Vorlage als Kopie anlegen
- Inspectors: `getInspectors()`, `saveInspector()`, `deleteInspector()` — Prueferverwaltung
- Objects: `getObjects()`, `saveObject()`, `deleteObject()` (Soft-Delete)
- Inspections: `getInspections(filter)`, `saveInspection()`, `deleteInspection()` (Hard-Delete)
- Recurring: `createRecurringInspection(sourceInspectionId)` — Folgepruefung aus Intervall
- Results: `getInspectionResults()`, `saveInspectionResults()`, `initInspectionResults()`
- Attachments: `saveAttachment()`, `getAttachments()`, `getAttachmentsByInspection()`, `deleteAttachment()`
- Defects: `createDefectsFromInspection()`, `getDefects(filter)`, `getDefect()`, `updateDefectStatus()`, `getOpenDefectCount()`, `createReinspection()`
- Dashboard: `getDueInspections()` (Ampellogik), `getInspectionStats()`, `getOpenDefectCount()`
- History: `getObjectHistory(objectId)`
- Profile: `getOrgProfile()`, `saveOrgProfile()`
- Export: `exportInspectionsCSV()`
- Events: `appendEvent()`, `verifyChain()`, `getEvents()`

## Svelte 5 Patterns

- Runes: `$state`, `$props`, `$derived`, `$derived.by`, `$effect`
- Stores: `writable`, `derived` aus svelte/store
- Navigation: String-basiert via `currentView` Store
  - Hauptviews: 'dashboard', 'inspections', 'templates', 'objects', 'defects', 'templates:library', 'import', 'integrity', 'settings', 'support', 'feature-request'
  - Detail: 'template:ID', 'object:ID', 'inspection:ID', 'defect:ID'
  - Formulare: 'template:new', 'template:edit:ID', 'object:new', 'object:edit:ID', 'inspection:new'
  - Spezial: 'inspection:execute:ID'
- Shared Components: `SupportView`, `FeatureRequestView`, `LicenseSection` aus `@codefabrik/app-shared/components`

## Aktuelle Version: v0.5.0

40 Features (20 aus v0.1.0 + 4 aus v0.2.0 + 7 aus v0.3.0 + 2 aus v0.4.0 + 7 neu in v0.5.0):
- Checklisten-CRUD mit Pruefpunkten (beliebig viele)
- Geraete-/Raumverwaltung mit Pruefhistorie
- Pruefungsverwaltung (anlegen, durchfuehren, abschliessen)
- Interaktive Checkliste (OK/Maengel/N/A pro Punkt, Zwischenspeichern)
- Status-Workflow (offen → bestanden/bemaengelt/abgebrochen)
- Dashboard mit Statistiken + Faelligkeits-Ampel + Offene Maengel
- PDF-Pruefprotokoll + Maengelbericht + Pruefungsliste
- CSV-Export + CSV-Import (Checklisten)
- Organisationsprofil (Briefkopf)
- Event-Log mit HMAC-SHA256 Hash-Kette
- Aenderungshistorie (unter Einstellungen → Erweitert)
- Probe-Lizenz (10 Checklisten Limit)
- Support-Integration + Feature-Requests
- Checklisten-Bibliothek (35 fertige Checklisten)
- Wiederkehrende Pruefungen (automatische Folgepruefung)
- Foto-Anhaenge (pro Pruefpunkt, Thumbnail-Galerie)
- Maengeltracking (offen/behoben/verifiziert, Nachpruefung)
- Sammel-PDF (mehrere Pruefprotokolle in einem Dokument)
- Fotos in PDF (eingebettete Foto-Anhaenge im Pruefprotokoll)
- Checklisten duplizieren (Kopie erstellen und anpassen)
- Erinnerungen (Warnbanner fuer ueberfaellige/bald faellige Pruefungen)
- Prueferverwaltung (Pruefer mit Rolle/Qualifikation, Autovervollstaendigung)
- QR-Code auf PDF (Pruefungsreferenz zur Zuordnung)
- Workflow-orientierte Sidebar (Gruppenheader: Einrichten/Durchfuehren)
- Einrichtungsassistent (4-Schritte-Wizard: Willkommen, Checklisten, Geraet/Raum, Organisation)
- **NEU v0.5.0:** Usability-Refactoring (Vorlagen→Checklisten, Objekte→Geraete & Raeume, Navigation vereinfacht)
- **NEU v0.5.0:** Dashboard-Upgrade (klickbare ueberfaellige Pruefungen, Jetzt-Pruefen-Button, Zuletzt-bearbeitet, offene Maengel als Liste)
- **NEU v0.5.0:** Wizard-Neuordnung (Willkommen→Checklisten→Geraet→Organisation, Pruefer entfernt)
- **NEU v0.5.0:** 35 Checklisten-Bibliothek (20 neue: Tueren/Tore, Werkzeugmaschinen, Kita, Gastro, Minigolf, Schankanlage, Saisonstart u.a.)
- **NEU v0.5.0:** Leerformular drucken (Checkliste als leeres PDF mit Checkboxen zum Vor-Ort-Abhaken)
- **NEU v0.5.0:** System-Benachrichtigungen (OS-Notification bei ueberfaelligen Pruefungen beim App-Start)
- **NEU v0.5.0:** Schnellstart vom Dashboard (Jetzt-Pruefen erstellt Pruefung und springt direkt in Durchfuehrung)
