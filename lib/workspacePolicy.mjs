const SEASON_CALENDAR_WORKSPACES = new Set();
const MATCH_LOAD_WORKSPACES = new Set(['zarechie', 'nkperf']);

// Session type is selected manually per athlete and date in every workspace.
// Team calendars must never override that coach decision.
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
