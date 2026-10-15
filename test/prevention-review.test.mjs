import test from 'node:test';
import assert from 'node:assert/strict';
import { clinicalReviewContext, reviewState, libraryIssues } from '../lib/prevention/review.mjs';
import { registeredCourse } from '../lib/prevention/catalogue.mjs';
import { createAssignment, assignmentSummary, applyAssignmentCommand, orderedSets } from '../lib/prevention/model.mjs';
test('clinical comparison ignores calendar, readiness percentages and injury administrative timestamps',()=>{
 const a={readySixDecision:{recommendation:'full',capPercent:100,restrictions:['b','a'],observations:['Плечо']},injuryLog:[{id:1,status:'active',note:'Шея',date:'2026-10-10'}]};
 const b={...a,readySixDecision:{...a.readySixDecision,capPercent:20,recommendation:'load_stop',restrictions:['a','b']},injuryLog:[{id:2,status:'active',note:'Шея',date:'2026-10-15'}]};
 assert.deepEqual(clinicalReviewContext(a,['WRIST'],''),clinicalReviewContext(b,['WRIST'],''));
 assert.notDeepEqual(clinicalReviewContext(a,[],''),clinicalReviewContext({...a,injuryLog:[]},[],''));
 assert.deepEqual(reviewState({status:'completed'},{hold:'Врач'}),{needed:false,reason:''});
 assert.equal(reviewState({status:'active',reviewFingerprint:'a'},{available:true,fingerprint:'a'}).needed,false);
 assert.equal(reviewState({status:'active',reviewFingerprint:'a'},{available:true,fingerprint:'b'}).needed,true);
 assert.equal(reviewState({status:'active'},{available:false}).needed,true);
});
test('manual correction list is based on the current library edition and preserves adaptation disclosures',()=>{
 const c=registeredCourse(), issues=libraryIssues(c);assert.equal(issues.length,7);
 assert.equal(issues.filter(i=>i.reasons.includes('Проверить название')).length,2);
 const patches=Object.fromEntries(issues.map(i=>[i.sourceId,{name:i.name==='Shin Box Rotation No Hands'?'90/90 Hip Rotation No Hands':i.name==='Hip Hinge Arms Overhead'?'Hip Hinge Overhead':i.name,note:'Проверенная подсказка',video:'https://youtu.be/synthetic'}]));
 assert.equal(libraryIssues(registeredCourse(c.id,{revision:1,exercises:patches})).length,0);
 assert.equal(libraryIssues(registeredCourse('plantar-fasciitis-comprehensive')).filter(i=>i.reasons.includes('Адаптация по запрету тренера')).length,1);
});
test('coach progress summaries report partial sets and actual completion without scheduling fields',()=>{
 const c=registeredCourse('plantar-fasciitis-basic');let a=createAssignment(c,{scope:'phase',phase:2,rangeChoice:'min',mainSets:1,stretch:false,stretchSets:2,reviewed:true},{id:'progress-overview-fixture'});
 a=applyAssignmentCommand(a,{requestId:'mark-progress-fixture',expectedRevision:a.revision,sessionIndex:0,action:'mark',key:orderedSets(a.sessions[0])[0].key,done:true}).assignment;
 let summary=assignmentSummary(a);assert.equal(summary.currentDone,1);assert.equal(summary.currentPhase,2);assert.equal(summary.cursor,0);assert.equal(summary.lastCompletedAt,null);
 for(const row of orderedSets(a.sessions[0]).slice(1)) a=applyAssignmentCommand(a,{requestId:'mark-progress-'+row.key.replace(':','-'),expectedRevision:a.revision,sessionIndex:0,action:'mark',key:row.key,done:true}).assignment;
 a=applyAssignmentCommand(a,{requestId:'complete-progress-fixture',expectedRevision:a.revision,sessionIndex:0,action:'complete'}).assignment;
 summary=assignmentSummary(a);assert.equal(summary.cursor,1);assert.equal(summary.currentDone,0);assert.ok(summary.lastCompletedAt);assert.equal('scheduledDate' in summary,false);
});
test('course-only daily overview never invents a phase',()=>{
 const c=registeredCourse('plantar-fasciitis-daily'),a=createAssignment(c,{scope:'course',mainSets:1,stretch:false,stretchSets:2,reviewed:true},{id:'daily-overview-fixture'}),s=assignmentSummary(a);
 assert.equal(s.courseOnly,true);assert.equal(s.currentPhase,undefined);assert.equal(s.currentPhaseLabel,undefined);
});
