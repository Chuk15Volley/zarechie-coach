const SEASON_CALENDAR_WORKSPACES = new Set(['zarechie']);
const MATCH_LOAD_WORKSPACES = new Set(['zarechie', 'nkperf']);

// Zarechie uses one team calendar. NK Performance is deliberately manual
// because athletes may have different competition dates.
export function usesSeasonCalendar(workspace) {
  return SEASON_CALENDAR_WORKSPACES.has(String(workspace || ''));
}

export function usesMatchLoad(workspace) {
  return MATCH_LOAD_WORKSPACES.has(String(workspace || ''));
}

export function expectsPerformanceTests(workspace) {
  return workspace === 'zarechie';
}

export function workspaceDisplayName(workspace) {
  return workspace === 'nkperf' ? 'NK PERFORMANCE' : 'ЗАРЕЧЬЕ';
}
