// Read-only presentation of validated strength facts. Never use planned loads,
// session RPE, estimated 1RM or unconfirmed completion as exercise evidence.
const number = value => value !== '' && value != null && typeof value !== 'boolean' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const effort = value => number(value) >= 1 && number(value) <= 10 ? number(value) : null;
const perSide = set => set?.perSide === true || /\/side$/.test(String(set?.target || ''));
const identity = row => JSON.stringify([row.trainingType || 'full_body',row.code,row.name,row.loadUnits === 2 ? 2 : 1,row.perSide]);

export function historyPerformanceSeries(sessions = []) {
  const strength = [...sessions].filter(row => row.focus === 'inseason_strength').sort((a,b) => a.date.localeCompare(b.date));
  const groups = new Map();
  for (const session of strength) {
    if (!session.factReview?.completed) continue;
    for (const row of session.factReview.rows || []) {
      // A rep-unit change creates a different series, even within an exercise.
      const units = [...new Set((row.sets || []).map(perSide))];
      for (const side of units) {
        const item = {...row,trainingType:session.trainingType || 'full_body',perSide:side};
        const key = identity(item);
        if (!groups.has(key)) groups.set(key,{...item,key,observations:[]});
        groups.get(key).observations.push({date:session.date,exercise:row.exercise,missingRpe:row.missingRpe,exerciseRpe:effort(row.rpe),adapted:!!row.symptomAdapted,
          supplementStatus:session.factReview.supplementStatus || 'none',
          sets:(row.sets || []).map(set => perSide(set) === side ? {completed:true,missingKg:set.missingKg,missingReps:set.missingReps,kg:set.missingKg ? null : number(set.kg),reps:set.missingReps || !/^\d+(\/side)?$/.test(String(set.target || '')) ? null : number(set.reps),perSide:side} : {completed:false,kg:null,reps:null,perSide:side})});
      }
    }
  }
  return [...groups.values()].sort((a,b)=>b.observations.at(-1).date.localeCompare(a.observations.at(-1).date)).map(row => ({...row,observations:strength.map(session => row.observations.find(point => point.date === session.date) || {
    date:session.date,exerciseRpe:null,sets:[],gap:session.factReview?.completed ? 'Этот вариант не выполнялся' : 'Полное выполнение не подтверждено',supplementStatus:session.factReview?.supplementStatus || 'none',
  })}));
}

export function cyclePerformanceSeries(cycle) {
  return (cycle?.exercises || []).flatMap(row => {
    const units = [...new Set(row.observations.flatMap(point => (point.sets || []).map(perSide)))];
    return units.map(side => ({...row,key:row.key+':'+side,perSide:side,observations:[...(cycle.completionDates || [])].sort().map(date => {
      const point = row.observations.find(point => point.date === date);
      return point ? {...point,exerciseRpe:effort(point.exerciseRpe),sets:(point.sets || []).map(set => ({...set,completed:set.completed === true && perSide(set) === side,kg:number(set.kg),reps:set.requiresReps === false ? null : number(set.reps)}))} : {date,sets:[],exerciseRpe:null,gap:'Этот вариант не выполнялся'};
    })}));
  });
}

export function performancePoints(series, setIndex = 0) {
  return (series?.observations || []).map(point => {
    const set = point.sets?.[setIndex],completed = set?.completed === true;
    return {...point,missingFields:point.gap || !point.exercise?[]:[...(completed && set.missingKg?[{exercise:point.exercise,set:setIndex,field:'kg',label:'Заполнить кг'}]:[]),...(completed && set.missingReps?[{exercise:point.exercise,set:setIndex,field:'reps',label:'Заполнить повторы'}]:[]),...(point.missingRpe?[{exercise:point.exercise,set:null,field:'rpe',label:'Заполнить RPE'}]:[])],kg:completed ? number(set.kg) : null,reps:completed ? number(set.reps) : null,rpe:point.gap ? null : effort(point.exerciseRpe),
      gap:point.gap || (!set ? 'Такого подхода нет' : !completed ? 'Подход не подтверждён / другие единицы повторов' : '')};
  });
}

export function performanceChartGeometry(points, metric, width = 640, height = 150) {
  const values = points.map(point => number(point[metric]));
  const highest = Math.max(1,...values.filter(value => value != null));
  const max = metric === 'rpe' ? 10 : metric === 'reps' ? Math.ceil(highest*1.1) : Math.ceil(highest*1.1/5)*5;
  const min = metric === 'rpe' ? 1 : 0;
  const coordinates = values.map((value,index) => value == null ? null : {index,value,x:38 + index * (width-60) / Math.max(1,points.length-1),y:16 + (max-value)/(max-min)*(height-42)});
  // Missing and adapted observations break lines; no smoothing/interpolation.
  const segments = []; let current = [];
  coordinates.forEach((point,index) => {
    if (!point || points[index].adapted) {if(current.length)segments.push(current);current=[];return;}
    current.push(point);
  });
  if(current.length)segments.push(current);
  return {min,max,coordinates,segments};
}
