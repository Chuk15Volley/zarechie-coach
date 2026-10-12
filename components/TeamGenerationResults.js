export default function TeamGenerationResults({results,running,onOpen,onRetry}) {
  if(!results.length)return null;
  const failed=results.filter(row=>row.status==='error').length;
  return <div className="mt-4 text-left">
    <div className="grid gap-2 sm:grid-cols-2">{results.map(row=><div key={row.playerId} className={`rounded-xl border px-3 py-2 ${row.status==='done'?'border-emerald-500/25 bg-emerald-500/[0.07]':row.status==='error'?'border-rose-500/25 bg-rose-500/[0.07]':'border-white/[0.07] bg-white/[0.03]'}`}>
      <p className="text-xs font-semibold text-slate-200">{row.name}</p>
      {row.status==='done' && row.draft?<button type="button" onClick={()=>onOpen(row)} className="mt-1 text-xs font-semibold text-emerald-300 underline">Черновик · открыть</button>:<p className="mt-1 text-xs text-slate-400">{row.status==='done'?'Сохранено':row.status==='error'?'Ошибка':row.status==='generating'?'Генерирую…':'В очереди'}</p>}
      {row.status==='error' && <p role="alert" className="mt-1 break-words text-xs text-rose-300">{row.error || 'Не удалось выполнить запрос. Повторите проверку.'}</p>}
    </div>)}</div>
    {!running && failed>0 && <button type="button" onClick={onRetry} className="mt-3 text-xs font-semibold text-rose-300 underline">Повторить ошибки ({failed})</button>}
    {results.some(row=>row.status==='done' && row.draft) && <p className="mt-2 text-xs text-slate-400">Черновики готовы. Откройте программу игрока, проверьте и сохраните её.</p>}
  </div>;
}
