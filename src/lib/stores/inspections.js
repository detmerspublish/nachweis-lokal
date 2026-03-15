import { writable, derived } from 'svelte/store';

export const inspections = writable([]);
export const searchQuery = writable('');
export const statusFilter = writable('alle');

export const filteredInspections = derived(
  [inspections, searchQuery, statusFilter],
  ([$inspections, $searchQuery, $statusFilter]) => {
    let result = $inspections;
    if ($statusFilter !== 'alle') {
      result = result.filter(i => i.status === $statusFilter);
    }
    if ($searchQuery.trim()) {
      const q = $searchQuery.toLowerCase();
      result = result.filter(i =>
        i.title?.toLowerCase().includes(q) ||
        i.template_name?.toLowerCase().includes(q) ||
        i.object_name?.toLowerCase().includes(q) ||
        i.inspector?.toLowerCase().includes(q)
      );
    }
    return result;
  }
);
