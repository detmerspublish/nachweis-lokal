/**
 * Minimale i18n-Unterstützung für Nachweis Lokal.
 * Zeigt Untertitel unter deutschen Haupttexten.
 * Sprache wird automatisch erkannt oder manuell gewählt.
 */

const translations = {
  tr: {
    // Sidebar
    'Dashboard': 'Gösterge Paneli',
    'EINRICHTEN': 'KURULUM',
    'Checklisten': 'Kontrol Listeleri',
    'Geräte & Räume': 'Cihazlar ve Odalar',
    'DURCHFÜHREN': 'UYGULAMA',
    'Prüfungen': 'Denetimler',
    'Mängel': 'Eksiklikler',
    'Einstellungen': 'Ayarlar',
    'Hilfe': 'Yardım',

    // Wizard
    'Willkommen bei Nachweis Lokal': 'Nachweis Lokal\'a hoş geldiniz',
    'Los geht\'s': 'Başlayalım',
    'Weiter': 'İleri',
    'Überspringen': 'Atla',
    'Einrichtung überspringen': 'Kurulumu atla',
    'Fertig': 'Tamam',
    'Was prüfen Sie?': 'Neyi denetliyorsunuz?',
    'Wo prüfen Sie?': 'Nerede denetliyorsunuz?',
    'Ihre Daten': 'Bilgileriniz',

    // Inspection
    'Prüfung durchführen': 'Denetim yap',
    'OK': 'Tamam',
    'Entfällt': 'Geçersiz',
    'Abschließen': 'Tamamla',
    'Zwischenspeichern': 'Kaydet',
    'Zurück': 'Geri',
    'Was ist das Problem?': 'Sorun nedir?',

    // Status
    'Bestanden': 'Başarılı',
    'Mit Mängeln': 'Eksiklikli',
    'Offen': 'Açık',

    // Dashboard
    'Prüfungen gesamt': 'Toplam denetim',
    'Prüfungen aktuell': 'Güncel denetimler',
    'Jetzt prüfen': 'Şimdi denetle',

    // Buttons
    'Neue Checkliste': 'Yeni kontrol listesi',
    'Speichern': 'Kaydet',
    'Löschen': 'Sil',
    'Bearbeiten': 'Düzenle',
    'Am Handy prüfen': 'Telefonla denetle',

    // Hints
    'hint_bg': 'Meslek Birliği (BG): İşveren olarak iş kazası sigortanız. Her işletmenin bir BG\'si vardır.',
    'hint_why_inspect': 'İşveren olarak belirli şeyleri düzenli olarak kontrol etmelisiniz. Denetim kanıtınız yoksa kişisel olarak sorumlu tutulursunuz.',
    'hint_disclaimer': 'Bu kontrol listeleri bir başlangıçtır — resmi bir yönetmelik değildir.',
  },

  en: {
    // Sidebar
    'Dashboard': 'Dashboard',
    'EINRICHTEN': 'SETUP',
    'Checklisten': 'Checklists',
    'Geräte & Räume': 'Devices & Rooms',
    'DURCHFÜHREN': 'INSPECT',
    'Prüfungen': 'Inspections',
    'Mängel': 'Defects',
    'Einstellungen': 'Settings',
    'Hilfe': 'Help',

    // Wizard
    'Willkommen bei Nachweis Lokal': 'Welcome to Nachweis Lokal',
    'Los geht\'s': 'Let\'s go',
    'Weiter': 'Next',
    'Überspringen': 'Skip',
    'Einrichtung überspringen': 'Skip setup',
    'Fertig': 'Done',
    'Was prüfen Sie?': 'What do you inspect?',
    'Wo prüfen Sie?': 'Where do you inspect?',
    'Ihre Daten': 'Your details',

    // Inspection
    'Prüfung durchführen': 'Conduct inspection',
    'OK': 'OK',
    'Entfällt': 'N/A',
    'Abschließen': 'Complete',
    'Zwischenspeichern': 'Save draft',
    'Zurück': 'Back',
    'Was ist das Problem?': 'What is the problem?',

    // Status
    'Bestanden': 'Passed',
    'Mit Mängeln': 'Has defects',
    'Offen': 'Open',

    // Dashboard
    'Prüfungen gesamt': 'Total inspections',
    'Prüfungen aktuell': 'Inspections up to date',
    'Jetzt prüfen': 'Inspect now',

    // Buttons
    'Neue Checkliste': 'New checklist',
    'Speichern': 'Save',
    'Löschen': 'Delete',
    'Bearbeiten': 'Edit',
    'Am Handy prüfen': 'Inspect by phone',

    // Hints
    'hint_bg': 'Trade association (BG): Your accident insurance as a business owner. Every business in Germany has one.',
    'hint_why_inspect': 'As a business owner you must regularly inspect certain things. Without proof of inspection, you are personally liable.',
    'hint_disclaimer': 'These checklists are a starting point — not an official regulation.',
  },
};

/** Currently selected subtitle language. null = no subtitles. */
let currentLang = null;

/**
 * Set the subtitle language.
 * @param {'tr'|'en'|null} lang
 */
export function setLanguage(lang) {
  currentLang = lang;
  if (typeof localStorage !== 'undefined') {
    if (lang) localStorage.setItem('nachweis-subtitle-lang', lang);
    else localStorage.removeItem('nachweis-subtitle-lang');
  }
}

/**
 * Get the current subtitle language.
 */
export function getLanguage() {
  if (currentLang) return currentLang;
  if (typeof localStorage !== 'undefined') {
    currentLang = localStorage.getItem('nachweis-subtitle-lang') || null;
  }
  return currentLang;
}

/**
 * Get subtitle text for a German string.
 * Returns null if no translation or language not set.
 */
export function sub(germanText) {
  const lang = getLanguage();
  if (!lang) return null;
  return translations[lang]?.[germanText] || null;
}

/**
 * Available subtitle languages.
 */
export const availableLanguages = [
  { code: null, label: 'Nur Deutsch' },
  { code: 'tr', label: 'Türkçe (Türkisch)' },
  { code: 'en', label: 'English' },
];
