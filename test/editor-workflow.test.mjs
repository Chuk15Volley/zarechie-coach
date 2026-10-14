import test from 'node:test';
import assert from 'node:assert/strict';
import {workCopyKey,workCopyBasis,recoverableWorkCopy,WORK_COPY_TTL,rpePresentation,plannedRpePatch,plannedInputIssues} from '../lib/editorWorkflow.mjs';
import {repeatedPlannedSets,plannedSetParts,formatPlannedSet} from '../lib/plannedLoadEditor.mjs';
import {libraryMatches,libraryVariantMeta,searchableExercise} from '../lib/exerciseLibraryView.mjs';
import {replacementTechnique,techniqueQuality} from '../lib/exerciseReplacement.mjs';
import {replaceExerciseDescription} from '../lib/exerciseReplacement.mjs';
test('work copy recovery isolates workspace/job/player and rejects stale or revised server bases',()=>{
 const ctx={workspace:'zarechie',playerId:'fictional',date:'2026-10-15',queueId:'q',batchId:'b'};
 for(const patch of [{workspace:'nkperf'},{playerId:'other'},{queueId:'new'},{batchId:'new'},{date:'2026-10-16'}])assert.notEqual(workCopyKey(ctx),workCopyKey({...ctx,...patch}));
 const record={date:ctx.date,savedAt:'stamp',teamDraft:{version:'v1'},session:{blocks:[]}},basis=workCopyBasis(record),copy={basis,session:{blocks:[]},at:1000};
 assert.equal(recoverableWorkCopy(copy,basis,2000),true);assert.equal(recoverableWorkCopy(copy,workCopyBasis({...record,teamDraft:{version:'v2'}}),2000),false);assert.equal(recoverableWorkCopy(copy,basis,1001+WORK_COPY_TTL),false);assert.equal(recoverableWorkCopy(copy,basis,999),false);
});
test('bulk number edits retain individual side/time/distance units; explicit unit changes are deliberate',()=>{
 const original=['5/side','25 sec/side','10 m','8'];assert.deepEqual(repeatedPlannedSets(original,'6'),['6/side','6 sec/side','6 m','6']);assert.deepEqual(original,['5/side','25 sec/side','10 m','8']);
 assert.deepEqual(repeatedPlannedSets(original,'7','reps'),['7','7','7','7']);
 assert.deepEqual(plannedSetParts('25 sec/side'),{value:'25',unit:'sec/side'});assert.deepEqual(plannedSetParts('/side'),{value:'',unit:'reps/side'});assert.equal(formatPlannedSet('6','reps/side'),'6/side');assert.equal(plannedSetParts('3 x 5').unit,'custom');
});
test('RPE legacy display is read-only and a deliberate valid edit synchronizes existing note without erasing warnings',()=>{
 const ex={weightNote:'12 кг · RPE 6–7; боль → стоп',actualRpe:9};assert.deepEqual(rpePresentation(ex),{value:'',note:'6–7',conflict:false});
 assert.equal(plannedRpePatch(ex,8).weightNote,'12 кг · RPE ≤ 8; боль → стоп');assert.equal(ex.actualRpe,9);assert.equal(ex.weightNote,'12 кг · RPE 6–7; боль → стоп');
 const issue=plannedInputIssues({blocks:[{exercises:[{code:'A1',name:'DB Row',targetSets:['6'],targetRpeMax:99}]}]});assert.equal(issue[0].field,'целевой RPE упражнения');
 assert.equal(plannedInputIssues({blocks:[{exercises:[{name:'DB Row',targetSets:['/side'],targetRpeMax:7}]}]}).length,1);
});
test('Russian/typo discovery never merges canonical variants and exposes exact variation differences',()=>{
 const card={title:'Single-Leg DB Romanian Deadlift',canonicalId:'original'};
 for(const search of ['румынская','румынская тяга гантели','Romanain','гантели'])assert.equal(libraryMatches(card,{search}),true,search);
 assert.equal(searchableExercise('Dummbell Romanian Deadlift'),searchableExercise('Dumbbell Romanian Deadlift'));assert.equal(card.canonicalId,'original');assert.match(libraryVariantMeta(card.title),/одна опорная нога/);assert.match(libraryVariantMeta('Chest-Supported Neutral-Grip DB Row'),/грудь на опоре.*нейтральный хват/);
});
test('quality flags mobility contradictions and missing single-leg/landing setup; originals remain untouched',()=>{
 const name='Half-Kneeling Ankle Dorsiflexion Mobilization (Band)',text='Двигайся плавно и максимально резко, но без рывка';assert.ok(techniqueQuality(name,text));assert.ok(techniqueQuality('Single-Leg DB Romanian Deadlift','Держать гантели близко к ногам.'));assert.equal(techniqueQuality('Single-Leg DB Romanian Deadlift',replacementTechnique('Single-Leg DB Romanian Deadlift')),'');
 const ex={name:'DB Bench Press',targetSets:['5','5'],weightKg:20,tempo:'2-0-X-0',descriptionOverride:'Индивидуальное описание'};const replaced=replaceExerciseDescription(ex,{name:'Single-Leg DB Romanian Deadlift'});assert.equal(replaced.weightKg,null);assert.deepEqual(replaced.targetSets,ex.targetSets);assert.equal(ex.descriptionOverride,'Индивидуальное описание');assert.match(replaced.cue,/опорной ноге/);
});
import {compactWorkoutTitle} from '../lib/playerGym.mjs';
test('player title removes copy/review labels only, preserving the training direction and stored label',()=>{
 const label='Копия программы · проверка тренером · Активация / мощность';assert.equal(compactWorkoutTitle(label),'Активация / мощность');assert.equal(label,'Копия программы · проверка тренером · Активация / мощность');assert.equal(compactWorkoutTitle('Мощность / скорость · Всё тело'),'Мощность / скорость · Всё тело');assert.equal(compactWorkoutTitle('Профилактика · индивидуальная программа'),'Профилактика');
});
import {savedProgramForTeamDay,teamSessionIds} from '../lib/teamSavedProgram.mjs';
for(const workspace of ['zarechie','nkperf'])test(`${workspace}: a later separately saved copy finishes the queue day; old/foreign/draft records never do`,()=>{
 const queue={workspace,id:'q',date:'2026-10-15',createdAt:'2026-10-14T18:00:00Z'},player={playerId:'123'},job={workspace,teamQueueId:'q',playerId:'123',status:'done',completedAt:'2026-10-14T18:20:00Z'},saved={date:queue.date,savedAt:'2026-10-14T20:38:00Z',session:{blocks:[]}};
 assert.equal(savedProgramForTeamDay(queue,player,job,[saved]),saved);assert.deepEqual(teamSessionIds('whoop_123'),['123','whoop_123']);assert.equal(savedProgramForTeamDay(queue,player,job,[{...saved,savedAt:'2026-10-14T17:00:00Z'}]),null);assert.equal(savedProgramForTeamDay(queue,player,job,[{...saved,draft:true}]),null);assert.equal(savedProgramForTeamDay(queue,player,{...job,workspace:workspace==='nkperf'?'zarechie':'nkperf'},[saved]),null);assert.equal(savedProgramForTeamDay(queue,player,job,[{...saved,date:'2026-10-16'}]),null);
});
test('legacy Russian side/time units survive numeric bulk edits exactly; unknown formats are never silently discarded',()=>{
 for(const [source,target] of [['5/сторона','6/сторона'],['5/сторону','6/сторону'],['25 сек/сторона','6 сек/сторона'],['10 м/сторона','6 м/сторона'],['5 на сторону','6 на сторону'],['5/leg','6/leg']]){assert.notEqual(plannedSetParts(source).unit,'custom',source);assert.deepEqual(repeatedPlannedSets([source],'6'),[target]);}
 assert.deepEqual(repeatedPlannedSets(['3 x 5'],'6'),['3 x 5']);assert.deepEqual(repeatedPlannedSets(['3 x 5'],'6','reps'),['6']);
});
