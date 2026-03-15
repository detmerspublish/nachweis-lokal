<script>
  let { term } = $props();

  const glossar = {
    'BG': 'Ihre Berufsgenossenschaft. Das ist Ihre Unfallversicherung als Unternehmer. Jeder Betrieb hat eine BG.',
    'SiFa': 'Fachkraft für Arbeitssicherheit. Ein Experte, der Ihren Betrieb in Sachen Sicherheit berät.',
    'DGUV': 'Deutsche Gesetzliche Unfallversicherung. Die DGUV macht Regeln für die Sicherheit am Arbeitsplatz.',
    'DGUV V3': 'Vorschrift für die Prüfung elektrischer Geräte und Anlagen. Betrifft fast jeden Betrieb.',
    'BetrSichV': 'Betriebssicherheitsverordnung. Regelt, wie Arbeitsmittel und Anlagen sicher betrieben werden.',
    'ArbStättV': 'Arbeitsstättenverordnung. Regelt Anforderungen an Arbeitsräume (Licht, Luft, Temperatur).',
    'ASR': 'Technische Regeln für Arbeitsstätten. Konkrete Vorgaben zu Fluchtwegen, Beleuchtung und mehr.',
    'HACCP': 'System für Lebensmittelsicherheit. Pflicht in der Gastronomie und überall wo Essen zubereitet wird.',
    'PSA': 'Persönliche Schutzausrüstung. Zum Beispiel: Helm, Handschuhe, Schutzbrille, Sicherheitsschuhe.',
    'UVV': 'Unfallverhütungsvorschriften. Regeln der BG zur Vermeidung von Arbeitsunfällen.',
    'Hash-Kette': 'Ein technisches Verfahren, das sicherstellt, dass niemand Ihre Prüfprotokolle nachträglich ändern kann.',
    'GoBD': 'Regeln für digitale Buchführung. Ihre Aufzeichnungen müssen nachvollziehbar und unveränderbar sein.',
    'ZÜS': 'Zugelassene Überwachungsstelle. Prüft z.B. Aufzüge und Druckgeräte.',
    'TrinkwV': 'Trinkwasserverordnung. Regelt die Qualität von Trinkwasser in Gebäuden.',
    'IfSG': 'Infektionsschutzgesetz. Regelt Hygiene-Anforderungen, z.B. Gesundheitszeugnis in der Gastronomie.',
  };

  let open = $state(false);
  let wrapperEl = $state(null);

  const explanation = $derived(glossar[term] ?? '');

  function toggle() {
    open = !open;
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && open) {
      open = false;
    }
  }

  function handleClickOutside(e) {
    if (open && wrapperEl && !wrapperEl.contains(e.target)) {
      open = false;
    }
  }

  $effect(() => {
    if (open) {
      document.addEventListener('click', handleClickOutside, true);
      document.addEventListener('keydown', handleKeydown);
      return () => {
        document.removeEventListener('click', handleClickOutside, true);
        document.removeEventListener('keydown', handleKeydown);
      };
    }
  });
</script>

<span class="glossar-wrapper" bind:this={wrapperEl}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <span
    class="glossar-term"
    role="button"
    tabindex="0"
    onmouseenter={() => open = true}
    onmouseleave={() => open = false}
    onclick={toggle}
    onkeydown={(e) => e.key === 'Enter' && toggle()}
  >
    <slot />
  </span>
  {#if open && explanation}
    <span class="glossar-tooltip">
      <span class="glossar-arrow"></span>
      {explanation}
    </span>
  {/if}
</span>

<style>
  .glossar-wrapper {
    position: relative;
    display: inline;
  }

  .glossar-term {
    text-decoration: underline dotted;
    text-decoration-color: var(--color-primary, #2b6cb0);
    text-underline-offset: 2px;
    cursor: help;
  }

  .glossar-tooltip {
    position: absolute;
    left: 50%;
    top: calc(100% + 8px);
    transform: translateX(-50%);
    background: white;
    border: 1px solid #d1d5db;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    max-width: 280px;
    padding: 0.75rem;
    font-size: 0.8125rem;
    line-height: 1.5;
    border-radius: 0.5rem;
    color: #1a202c;
    z-index: 50;
    white-space: normal;
    text-decoration: none;
    font-weight: normal;
  }

  .glossar-arrow {
    position: absolute;
    top: -6px;
    left: 50%;
    transform: translateX(-50%);
    width: 10px;
    height: 10px;
    background: white;
    border-left: 1px solid #d1d5db;
    border-top: 1px solid #d1d5db;
    transform: translateX(-50%) rotate(45deg);
  }
</style>
