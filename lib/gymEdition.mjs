// Mirrored programme aliases may share one edition but keep execution on the
// athlete's legacy link. Prefer its newest original evidence only within an
// identical saved edition. A newer different programme always wins.
export function selectGymEdition(candidates=[]) {
 const valid=candidates.filter(item=>item?.record?.session?.blocks);
 if(!valid.length)return null;
 const stamp=item=>String(item.record.savedAt || item.record.generatedAt || '');
 const latest=valid.reduce((best,item)=>stamp(item)>stamp(best)?item:best);
 const signature=item=>JSON.stringify([stamp(item),item.record.session,item.record.focus || '',item.record.trainingType || '']);
 const evidence=item=>Math.max(0,...[item.rawActual?.savedAt,item.rawLog?.savedAt].map(time=>{const n=Date.parse(time);return Number.isFinite(n) && n>=(Date.parse(stamp(item)) || 0)?n:0;}));
 return valid.filter(item=>signature(item)===signature(latest)).reduce((best,item)=>evidence(item)>evidence(best)?item:best,latest);
}
