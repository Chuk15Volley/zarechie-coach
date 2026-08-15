const SEASON_CALENDAR_WORKSPACES = new Set(['zarechie', 'nkperf']);

// Both coaching workspaces own isolated schedule and match-load namespaces.
// The methodology is shared; only the available monitoring domains differ.
export function usesSeasonCalendar(workspace) {
  return SEASON_CALENDAR_WORKSPACES.has(String(workspace || ''));
}

export function expectsPerformanceTests(workspace) {
  return workspace === 'zarechie';
}

export function workspaceDisplayName(workspace) {
  return workspace === 'nkperf' ? 'NK PERFORMANCE' : 'ЗАРЕЧЬЕ';
}
