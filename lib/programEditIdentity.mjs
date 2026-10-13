// Preserve the owner of an opened edition; never redirect edits to another player.
export function programEditPlayerId(playerId,sourcePlayerId) {
  const current=String(playerId || ''),source=String(sourcePlayerId || '');
  if(source===current)return current;
  if(/^(?:whoop_)?\d+$/.test(current) && /^(?:whoop_)?\d+$/.test(source) && current.replace(/^whoop_/,'')===source.replace(/^whoop_/,''))return source;
  return current;
}
