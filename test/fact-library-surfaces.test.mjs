import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {weekFactPeriod} from '../lib/coachFactSurface.mjs';
import {libraryGroup,libraryMatches,libraryVideoId,eligibleLibraryCard} from '../lib/exerciseLibraryView.mjs';
import {isCoachBannedExercise,hasRestriction} from '../lib/exerciseRestrictions.js';
import {replaceExerciseDescription} from '../lib/exerciseReplacement.mjs';

test('week facts stay in the selected week and never fetch future completed facts',()=>{
 assert.deepEqual(weekFactPeriod('2026-10-12','2026-10-14'),{from:'2026-10-12',to:'2026-10-14'});
 assert.deepEqual(weekFactPeriod('2026-10-05','2026-10-14'),{from:'2026-10-05',to:'2026-10-11'});
 const future=weekFactPeriod('2026-10-19','2026-10-14');assert.ok(future.from>future.to);
 assert.equal(weekFactPeriod('2026-02-30','2026-10-14'),null);
});
test('library videos use validated YouTube hosts and IDs, never arbitrary frames or script URLs',()=>{
 for(const url of ['https://www.youtube.com/watch?v=Hvo7VIAoYkc','https://youtu.be/Hvo7VIAoYkc?t=2','https://www.youtube-nocookie.com/embed/Hvo7VIAoYkc','https://m.youtube.com/shorts/Hvo7VIAoYkc'])assert.equal(libraryVideoId(url),'Hvo7VIAoYkc');
 for(const url of ['javascript:alert(1)','https://evil-youtube.com/watch?v=Hvo7VIAoYkc','https://youtube.com.evil.com/embed/Hvo7VIAoYkc','https://youtu.be/short','file:///tmp/video',''])assert.equal(libraryVideoId(url),null);
});
test('search combines words and movement/media filters while unknown exercises stay unclassified',()=>{
 const card={title:'Chest-Supported DB Row',video:'https://youtu.be/Hvo7VIAoYkc'};
 assert.equal(libraryMatches(card,{search:' row   DB ',group:'pull',media:'video'}),true);
 assert.equal(libraryMatches(card,{search:'row barbell'}),false);assert.equal(libraryMatches(card,{group:'squat'}),false);assert.equal(libraryMatches(card,{media:'missing'}),false);
 assert.equal(libraryGroup('Bulgarian Split Squat'),'lunge');assert.equal(libraryGroup('Romanian Deadlift'),'hinge');assert.equal(libraryGroup('Unknown movement'),'other');
});
for(const workspace of ['zarechie','nkperf'])test(workspace+': inspecting candidates excludes coach bans and restrictions; selecting a different variant clears kg and retains replacement history',()=>{
 const eligible=(title,restrictions=[])=>eligibleLibraryCard({title},restrictions,isCoachBannedExercise,hasRestriction);
 for(const title of ['Machine Hamstring Curl','Supine Glute Set','Supine Diaphragmatic Breathing','Side-Lying Short-Lever Adductor Raise','Barbell Bench Press','Seated Cable Row','Incline Push-Up'])assert.equal(eligible(title),false,title);
 assert.equal(eligible('DB Overhead Press',['SHOULDER']),false);assert.equal(eligible('Chest-Supported DB Row'),true);
 const original={name:'Trap Bar Deadlift',weightKg:100,actualKg:100,targetSets:['5','5']},before=structuredClone(original),next=replaceExerciseDescription(original,{name:'DB Romanian Deadlift'});
 assert.deepEqual(original,before);assert.equal(next.weightKg,null);assert.equal(next.replacementFrom,original.name);
});
test('navigation inspects the atlas in the current coach app and preserves the live program state',()=>{
 const navigation=readFileSync(new URL('../components/CoachNavigation.js',import.meta.url),'utf8');assert.ok(!navigation.includes("window.location.assign('/library')"));
 const index=readFileSync(new URL('../pages/index.js',import.meta.url),'utf8');assert.ok(index.includes("mainSection==='library'"));assert.ok(index.includes('fixedPeriod={weekFactPeriod(calWeekStart)}'));assert.ok(index.includes('label="Заполнить факты · последние занятия команды"'));
});
