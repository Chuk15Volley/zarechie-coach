import {readySixPublicationState} from './readySixPublication.mjs';
// Compare latest source answers, not the user-selected depth of historical data.
// No answers are persisted: only hashes. This metadata never gates generation.
const latest=value=>Array.isArray(value)?[...value].sort((a,b)=>String(b.date || '').localeCompare(String(a.date || '')))[0] || null:value || null;
export function coachSourceState(snapshot,restrictions){
 return readySixPublicationState({...snapshot,morning:latest(snapshot.latestMorning || snapshot.morning),surveys:latest(snapshot.latestSurvey || snapshot.surveys),postMorningSurveys:latest(snapshot.latestPostMorning || snapshot.postMorningSurveys),overtraqHistory:null,chronicSurveys:null,chronicPostMorningSurveys:null},restrictions);
}
