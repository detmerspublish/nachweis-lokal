<script>
  let { columns = [], rows = [], sortKey = $bindable(''), sortDir = $bindable('asc'), onRowClick } = $props();

  function handleSort(key) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = 'asc';
    }
  }
</script>

<div class="table-container">
  <table>
    <thead>
      <tr>
        {#each columns as col}
          <th onclick={() => handleSort(col.key)} class:sortable={true}>
            {col.label}
            {#if sortKey === col.key}
              <span class="sort-indicator">{sortDir === 'asc' ? '▲' : '▼'}</span>
            {/if}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as row}
        <tr onclick={() => onRowClick?.(row)} class:clickable={!!onRowClick}>
          {#each columns as col}
            <td>{row[col.key] ?? ''}</td>
          {/each}
        </tr>
      {/each}
      {#if rows.length === 0}
        <tr><td colspan={columns.length} class="empty">Keine Eintraege gefunden.</td></tr>
      {/if}
    </tbody>
  </table>
</div>

<style>
  .table-container { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #e2e8f0; }
  th { background: #f7fafc; cursor: pointer; user-select: none; font-weight: 600; }
  th:hover { background: #edf2f7; }
  .sort-indicator { margin-left: 0.25rem; font-size: 0.75rem; }
  .clickable { cursor: pointer; }
  .clickable:hover { background: #f7fafc; }
  .empty { text-align: center; color: #a0aec0; padding: 2rem; }
</style>
