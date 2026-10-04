import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrehabResult, PREHAB_VERSION } from '../lib/prehabMethodology.mjs';
import { recommendGymSession } from '../lib/readySixGym.mjs';
import { PREHAB_FAMILIES } from '../lib/prehabCatalogue.mjs';
import { auditExerciseVariety, buildExerciseVarietyContext, varietyExerciseKey } from '../lib/exerciseVariety.mjs';
import { auditDose, buildDosePrescription } from '../lib/sessionDose.mjs';
import { normalizeSessionTempoDescriptions, exerciseDescription } from '../lib/tempoDescription.mjs';
const date = '2026-10-04';
function fixture({ upper=100, lower=100, position='Доигровщик', pain=null, future=false }={}) {
  const snapshot = { player:{id:'synthetic',position}, readySixDecision:{ recommendation:'full',capPercent:100,
    targets:[{target:'strength_upper',healthCapPercent:upper},{target:'strength_lower',healthCapPercent:lower}] },
    ...(pain ? { latestMorning:{ date,zoneDetails:{[pain]:{type:'pain',level10:3}} } } : {}),
    ...(future ? {readySixPlanning:{preliminary:true,assessmentDate:'2026-10-03'}} : {}),
  };
  return { snapshot,date,recommendation:recommendGymSession({snapshot,targetDate:date}),matchLoad:{status:'medium',rpe:5},matchDate:'2026-10-02' };
}
const exercises = result => result.session.blocks.flatMap(block => block.exercises);
const sets = result => exercises(result).reduce((sum,ex) => sum + ex.targetSets.length,0);
const active = result => result.session.methodology.activeSeconds;
const regionalSets = (result,region) => exercises(result).filter(ex => ex.prehabRegion === region).reduce((sum,ex) => sum + ex.targetSets.length,0);

test('MD+2 covers the whole body with four main-work budgets totaling 50, no warmup/cooldown counted', () => {
  const result = buildPrehabResult(fixture());
  assert.equal(result.session.methodology.version, PREHAB_VERSION);
  assert.deepEqual(result.session.blocks.map(b => b.plannedMinutes), [10,15,10,15]);
  assert.equal(result.session.methodology.timing.targetMainMinutes,50);
  assert.equal(result.session.methodology.timing.warmupIncluded,false);
  assert.equal(result.session.methodology.timing.cooldownIncluded,false);
  assert.equal(result.session.methodology.timing.postMatchDay,2);
  assert.equal(exercises(result).length,12);
  assert.equal(sets(result),24);
  assert.ok(regionalSets(result,'upper') > 0 && regionalSets(result,'lower') > 0);
  assert.equal(auditDose(result.session,buildDosePrescription({focus:result.focus})).safe,true);
  assert.equal(result.autoSaved,false);
});
for (const [position,key] of [['Центральная','middle'],['Доигровщик','outside'],['Диагональная','opposite'],['Связующая','setter'],['Либеро','libero'],['','general']]) {
  test(`${position || 'unknown'} gets its own positional priorities without inferred injury diagnosis`, () => {
    const result = buildPrehabResult(fixture({position}));
    assert.equal(result.session.methodology.position,key);
    assert.ok(result.session.methodology.positionPriorities);
    assert.equal(result.session.methodology.localTherapyPrescribed,false);
  });
}
test('participation and readiness change actual dose, not just the explanation', () => {
  const input = fixture();
  const standard = buildPrehabResult(input);
  const high = buildPrehabResult({...input,matchLoad:{status:'high',rpe:9}});
  const unknown = buildPrehabResult({...input,matchLoad:null});
  const yellow = buildPrehabResult({...input,coachRecovery:'yellow'});
  const red = buildPrehabResult({...input,coachRecovery:'red'});
  assert.ok(active(high) < active(standard));
  assert.ok(active(unknown) < active(standard));
  assert.ok(active(yellow) < active(standard));
  assert.ok(active(red) <= active(yellow));
  assert.equal(high.session.methodology.timing.plannedMainMinutes,50);
  assert.match(unknown.session.warnings,/неизвестна/);
  assert.equal(red.session.methodology.timing.plannedMainMinutes,50);
});
test('source regional caps remain visible without suppressing coach-requested prophylaxis; contradictory targets fail', () => {
  const standard = buildPrehabResult(fixture());
  const reduced = buildPrehabResult(fixture({upper:50}));
  assert.equal(active(reduced),active(standard));
  assert.equal(regionalSets(reduced,'lower'),regionalSets(standard,'lower'));
  const regional = buildPrehabResult(fixture({lower:0}));
  assert.ok(regionalSets(regional,'lower')>0); 
  assert.ok(regionalSets(regional,'upper') > 0);
  for (const cap of [null,0,20]) { const draft=buildPrehabResult(fixture({upper:cap,lower:cap})); assert.equal(exercises(draft).length,12); assert.equal(draft.session.methodology.coachProphylaxisOverride,true); }
  const input=fixture({lower:0}); input.recommendation.state.targets.push({...input.recommendation.state.targets[0]});
  assert.equal(buildPrehabResult(input),null);
});
for (const [area,zone] of [['Голеностоп','ankle'],['Ахилл','achilles'],['Колени','knee'],['Поясница','back'],['Плечи','shoulder']]) {
  test(`${area}: questionnaire complaint selects only unloaded comfortable options involving that zone`, () => {
    const result = buildPrehabResult(fixture({pain:area}));
    assert.ok(result.session.methodology.symptoms.zones.includes(zone));
    assert.equal(result.session.methodology.localTherapyPrescribed,false);
    assert.equal(result.quality.medicalReviewRequired,true);
    const catalogue = Object.values(PREHAB_FAMILIES).flat();
    for(const ex of exercises(result)) {
      const source = catalogue.find(item=>item.name===ex.name);
      if(source.zones.includes(zone)) {
        assert.equal(ex.symptomAdapted,true);
        assert.equal(ex.targetSets.length,2);
        assert.match(ex.weightNote,/Без отягощения/);
      }
    }
    assert.ok(exercises(result).some(ex=>!catalogue.find(item=>item.name===ex.name).zones.includes(zone)));
  });
}
test('future questionnaires cannot affect current symptoms and soreness is not converted to pain', () => {
  const input=fixture(); input.snapshot.latestMorning={date:'2026-10-05',zoneDetails:{Плечи:{type:'pain',level10:5}}};
  input.snapshot.latestSurvey={date,zoneDetails:{Колени:{type:'soreness',level10:5}}};
  assert.deepEqual(buildPrehabResult(input).session.methodology.symptoms.zones,[]);
});
test('worsening next-morning response constrains subsequent selection and dose', () => {
  const input=fixture();
  const reactions=[{date:'2026-10-01',before:{pain:{knee:0}},nextMorning:{pain:{knee:3}}}];
  const result=buildPrehabResult({...input,reactions});
  assert.deepEqual(result.session.methodology.symptoms.worsenedZones,['knee']);
  assert.ok(active(result)<active(buildPrehabResult(input)));
  assert.ok(!exercises(result).some(ex=>/Split Squat|Sit-to-Stand/.test(ex.name)));
});
test('repeat approved control anchors, rotate other exercises, and keep actual dose stable across sessions', () => {
  const history=[];
  for(let day=4;day<=9;day++) {
    const target=`2026-10-${String(day).padStart(2,'0')}`;
    const result=buildPrehabResult({...fixture(),date:target,recentSessions:history});
    assert.equal(sets(result),24);
    const previous=new Set(history.at(-1)?.session.blocks.flatMap(b=>b.exercises).map(e=>varietyExerciseKey(e.name)) || []);
    for(const ex of exercises(result)) if(previous.has(varietyExerciseKey(ex.name))) assert.equal(ex.prehabRole,'control_anchor');
    const context=buildExerciseVarietyContext(history,{targetDate:target,focus:result.focus});
    assert.equal(auditExerciseVariety(result.session,context).needsCorrection,false);
    history.push({date:target,focus:result.focus,session:result.session});
  }
});
test('restriction tags and imminent match caps still apply after rotation', () => {
  const input=fixture(); input.recommendation.calendar.daysToGame=1;
  const result=buildPrehabResult({...input,playerRestrictions:['AXIAL','ANKLE']});
  assert.ok(exercises(result).every(ex=>!Object.values(PREHAB_FAMILIES).flat().find(item=>item.name===ex.name).tags.some(tag=>['AXIAL','ANKLE'].includes(tag))));
  assert.ok(active(result)<active(buildPrehabResult(fixture())));
  assert.equal(buildPrehabResult({...input,playerRestrictions:['UNKNOWN']}),null);
  assert.equal(buildPrehabResult({...input,historyAvailable:false}),null);
});
test('saving and descriptions preserve controlled tempo and preliminary warnings', () => {
  const result=buildPrehabResult(fixture({future:true}));
  assert.match(result.session.warnings,/Предварительная/);
  const normalized=normalizeSessionTempoDescriptions(result.session);
  assert.deepEqual(normalizeSessionTempoDescriptions(normalized),normalized);
  for(const ex of normalized.blocks.flatMap(b=>b.exercises)) assert.doesNotMatch(exerciseDescription(ex),/максимально резко/);
});

test('a coach-entered light weight within prescribed RPE is allowed; heavy instructions still fail',()=>{
  const result=buildPrehabResult(fixture());
  const row=exercises(result).find(ex=>ex.name.includes('Row'));
  row.weightKg=2;
  assert.equal(auditDose(result.session,buildDosePrescription({focus:result.focus})).safe,true);
  row.weightNote='RPE 8';
  assert.equal(auditDose(result.session,buildDosePrescription({focus:result.focus})).safe,false);
});


test('partially permitted players receive 12 English-named stations and 50 minutes while source caps remain advisory', () => {
 for (const [upper,lower] of [[100,0],[0,100],[40,0],[0,25]]) {
  const result=buildPrehabResult(fixture({upper,lower}));
  assert.ok(result);
  assert.equal(exercises(result).length,12);
  assert.equal(result.session.methodology.timing.plannedMainMinutes,50);
  for (const ex of exercises(result)) {
   assert.doesNotMatch(ex.name,/[А-Яа-яЁё]/);
   assert.equal(result.session.methodology.coachProphylaxisOverride,true);
   assert.ok(ex.activeSecondsPerSet>0);
   assert.ok(ex.activeSecondsPerSet*ex.targetSets.length*(ex.targetSets[0].includes('/ст.')?2:1)<ex.stationMinutes*60);
   assert.doesNotMatch(exerciseDescription(ex),/максимально резко/);
  }
 }
});
test('complaints change individual tasks while preserving session stations', () => {
 const normal=buildPrehabResult(fixture());
 for (const pain of ['Голеностоп','Ахилл','Колени','Поясница','Плечи']) {
  const changed=buildPrehabResult(fixture({pain}));
  assert.equal(exercises(changed).length,12);
  assert.notDeepEqual(changed.session.blocks.at(-1).exercises.map(ex=>ex.name),normal.session.blocks.at(-1).exercises.map(ex=>ex.name));
 }
});
