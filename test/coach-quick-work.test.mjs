import test from 'node:test';
import assert from 'node:assert/strict';
import {correctionPreview,rememberCorrectionPreview,readinessSummary,loadDayPresentation,recordedTotal,weekBudgetCoverage,progressionSummary} from '../lib/coachQuickWork.mjs';
import {summarizeLoadOverview,readinessIssues} from '../lib/coachOverview.mjs';
import {libraryMatches,libraryVariantMeta} from '../lib/exerciseLibraryView.mjs';
import {buildAthleteWeekLoad} from '../lib/weekLoadManagement.mjs';
test('explicit mode choice is isolated by coach workspace and unavailable storage preserves default',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 assert.equal(correctionPreview(storage,'zarechie',true),true);rememberCorrectionPreview(storage,'zarechie',false);
 assert.equal(correctionPreview(storage,'zarechie',true),false);assert.equal(correctionPreview(storage,'nkperf',true),true);
 rememberCorrectionPreview(storage,'nkperf',true);assert.equal(values.size,2);
 assert.equal(correctionPreview({getItem(){throw Error('private');}},'zarechie',true),true);
});
test('compact data summary retains missing and stale source names, failure and full original issue text',()=>{
 const source={id:'qa',dataProvenance:{missingSources:['survey','whoop'],staleSources:['neuro']}},before=JSON.stringify(source);
 const issues=readinessIssues(source,{revalidating:true});assert.equal(JSON.stringify(source),before);
 assert.match(readinessSummary(issues),/Нет: опрос ReadySix, WHOOP/);assert.match(readinessSummary(issues),/Устарело: прыжковые/);assert.match(issues[1].text,/устарело/);
 assert.equal(readinessSummary([{kind:'updating',text:'Обновляю'}]),'');assert.match(readinessSummary([{kind:'unavailable',text:'Источник недоступен'}]),/недоступен/);
});
test('planned waiting sessions are separate from incomplete started/completed facts; stale supplement always remains attention',()=>{
 const player={byDay:{d:0},evidenceByDay:{d:{source:'missing',partial:true}},executionByDay:{d:{completed:false,completedSets:0}},factFieldsByDay:{d:{missing:{kg:2}}}};
 assert.equal(loadDayPresentation(player,'d').waiting,true);assert.equal(summarizeLoadOverview({dates:['d'],players:[player]}).gaps,0);
 player.executionByDay.d.started=true;assert.equal(loadDayPresentation(player,'d').gap,true);
 player.executionByDay.d={completed:true};assert.equal(loadDayPresentation(player,'d').gap,true);
 player.executionByDay.d={completed:false};player.evidenceByDay.d.supplementStatus='stale';assert.equal(loadDayPresentation(player,'d').gap,true);
 player.evidenceByDay.d={source:'no_session'};assert.equal(loadDayPresentation(player,'d').gap,false);
});
test('unknown zero is not recorded total; confirmed zero and positive partial facts remain visible',()=>{
 const player={byDay:{d:0},evidenceByDay:{d:{source:'player_log',partial:true}},executionByDay:{d:{completed:false}}};
 assert.equal(recordedTotal(player,['d']),false);player.executionByDay.d.completed=true;assert.equal(recordedTotal(player,['d']),false);
 player.evidenceByDay.d.partial=false;assert.equal(recordedTotal(player,['d']),true);
 player.evidenceByDay.d.partial=true;player.byDay.d=100;assert.equal(recordedTotal(player,['d']),true);
});
test('budget coverage discloses only usable personal bases without recalculating totals',()=>{
 const athletes=[{budget:{status:'within',tonnage:100}},{budget:{status:'calibrating',tonnage:100}},{budget:{status:'within',sets:0,tonnage:0}}],before=JSON.stringify(athletes);
 assert.equal(weekBudgetCoverage(athletes),'Персональная база: 1 из 3 игроков');assert.equal(JSON.stringify(athletes),before);
});
test('equipment filters and variant labels distinguish named position and implement without merging exercises',()=>{
 assert.equal(libraryMatches({title:'Single-Arm Cable Press (Half-Kneeling)'},{equipment:'cable'}),true);
 assert.equal(libraryMatches({title:'Single-Arm Cable Press (Half-Kneeling)'},{equipment:'db'}),false);
 assert.match(libraryVariantMeta('Single-Arm Cable Press (Half-Kneeling)'),/на одном колене/);
 assert.match(libraryVariantMeta('Seated Chest-Supported Neutral-Grip DB Row'),/сидя.*грудь на опоре.*нейтральный хват/);
});
test('fold only exact generic progression prose; individual clinical messages and unknown formats stay visible',()=>{
 const decision='Вес подобрать подводящими подходами по технике и усилию; точные кг заранее не назначены. RPE 6–7; без отказа. Сопоставимой фактической истории для этого упражнения нет; вес другой вариации не переносить. При ухудшении техники или усилии выше цели снизить вес; автоматически не повышать.';
 assert.match(progressionSummary({decision}),/Подбор по RPE/);assert.match(progressionSummary({decision:decision.replace(' При ухудшении','  \n При ухудшении')}),/Подбор по RPE/);assert.equal(progressionSummary({decision:decision+' Боль: исключить нагрузку.'}),null);assert.equal(progressionSummary({decision:'Ограничить нагрузку плеча'}),null);
});
test('week adds saved training direction for display while keeping original classification label and source unchanged',()=>{
 const entries=[{date:'2026-10-15',record:{trainingLabel:'Копия программы · проверка тренером · Активация / мощность',session:{blocks:[]}}}],before=JSON.stringify(entries);
 const {days}=buildAthleteWeekLoad({weekStart:'2026-10-12',dates:['2026-10-15'],entries});
 assert.match(days[0].trainingDirection,/Активация/);assert.equal(days[0].label,entries[0].record.trainingLabel);assert.equal(JSON.stringify(entries),before);
});
