const plural=(value,one,few,many)=>{const n=value%100;return n>=11&&n<=14?many:value%10===1?one:value%10>=2&&value%10<=4?few:many;};
export default function ProgramOverview({blocks=[],title,preview,onPreview,onNavigate}) {
  const rows=blocks.map((block,index)=>({index,label:block.label || String(index+1),exercises:(block.exercises || []).length,sets:(block.exercises || []).reduce((sum,ex)=>sum+(Array.isArray(ex.targetSets)?ex.targetSets.length:0),0)}));
  const sets=rows.reduce((sum,row)=>sum+row.sets,0),exercises=rows.reduce((sum,row)=>sum+row.exercises,0),max=Math.max(1,...rows.map(row=>row.sets));
  return <section className="coach-program-overview" aria-label="Структура и просмотр программы">
    <div className="coach-program-intro"><p className="coach-program-kicker">ПРОГРАММА ПОДГОТОВКИ</p><h2>{title || 'Индивидуальная тренировка'}</h2><p>Видео, техника и нагрузка — в каждой карточке.</p>
      <div className="coach-program-modes" aria-label="Режим программы">{[[false,'Редактор'],[true,'Просмотр']].map(([value,label])=><button key={label} type="button" aria-pressed={preview===value} onClick={()=>onPreview(value)}>{label}</button>)}</div>
    </div>
    <div className="coach-program-structure"><header><div><span>Объём по плану</span><strong>{sets}<small>{plural(sets,'подход','подхода','подходов')}</small></strong></div><p>{exercises} {plural(exercises,'упражнение','упражнения','упражнений')}<br/>{rows.length} {plural(rows.length,'блок','блока','блоков')}</p></header>
      <div className="coach-program-chart" aria-label="Плановые подходы по блокам">{rows.map(row=><button key={row.index} type="button" aria-label={`Перейти к блоку ${row.label}: ${row.exercises} ${plural(row.exercises,'упражнение','упражнения','упражнений')}, ${row.sets} ${plural(row.sets,'подход','подхода','подходов')}`} onClick={()=>onNavigate(row.index)}><span className="coach-program-chart-value">{row.sets}</span><span className="coach-program-chart-track" aria-hidden="true"><i style={{height:Math.max(3,row.sets/max*100)+'%'}}/></span><span className="coach-program-chart-label">{row.label}</span></button>)}</div>
      <p className="coach-program-chart-caption">Подходы по блокам · нажмите для перехода</p>
    </div>
  </section>;
}
