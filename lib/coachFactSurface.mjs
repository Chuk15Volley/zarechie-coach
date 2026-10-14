import {calendarToday,shiftCalendarDate,validCalendarDate} from './coachCalendar.mjs';
// Facts end today; a future planning week cannot contain completed facts yet.
export function weekFactPeriod(start,today=calendarToday()){
 if(!validCalendarDate(start) || !validCalendarDate(today))return null;
 return {from:start,to:shiftCalendarDate(start,6)>today?today:shiftCalendarDate(start,6)};
}
