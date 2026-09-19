import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,makeGoal,createPlan,generateWeekTasks,updateMonth,updateWeek,setCompletion,growthFor,scheduleTask,conflicts,addDays} from '../src/domain/model.js';
test('calendar months cover the exact goal interval, including short and leap-month weeks',()=>{
 const goal=makeGoal({title:'考研',startDate:'2028-02-27',targetDate:'2028-04-03'});const months=createPlan(goal);
 assert.equal(months[0].endDate,'2028-02-29');assert.equal(months.at(-1).endDate,goal.targetDate);
 const weeks=months.flatMap(m=>m.weeks);assert.equal(weeks[0].startDate,goal.startDate);
 for(let i=1;i<weeks.length;i++)assert.equal(weeks[i].startDate,addDays(weeks[i-1].endDate,1));
 assert.equal(months[1].weeks.length,5);
});
test('month edits preserve other months and mark child plan stale',()=>{
 const g=seed().goals[0],m=g.months[0],updated=updateMonth(g,m.id,{title:'新的月方向'});
 assert.equal(updated.months[0].stale,true);assert.equal(updated.months[0].source,'user');assert.equal(updated.months[0].revision,2);
 assert.deepEqual(updated.months[0].weeks,m.weeks);assert.deepEqual(updated.months.slice(1),g.months.slice(1));
});
test('week edits leave parent and siblings unchanged; daily output uses latest confirmed content',()=>{
 const g=seed().goals[0],m=g.months[0],w=m.weeks[0],updated=updateWeek(g,w.id,{title:'英语专项',description:'复习语法并整理例句'});
 assert.equal(updated.months[0].title,m.title);assert.deepEqual(updated.months[0].weeks[1],m.weeks[1]);
 const result=generateWeekTasks(updated,updated.months[0].weeks[0]);assert.equal(result.tasks[0].title,'英语专项');assert.match(result.tasks[0].description,/复习语法并整理例句/);assert.equal(result.tasks[0].planRevision,2);
});
test('same-title daily instances stay separate and generation is idempotent',()=>{
 const g=seed().goals[0],w=g.months[0].weeks[0],result=generateWeekTasks(g,w);
 assert.equal(result.tasks.length,21);assert.equal(new Set(result.tasks.map(t=>t.id)).size,21);
 assert.equal(result.tasks[0].title,result.tasks[3].title);assert.notEqual(result.tasks[0].id,result.tasks[3].id);
 assert.ok(result.tasks.every(t=>t.scheduledStart===null));assert.equal(generateWeekTasks(g,w,result.tasks).tasks.length,0);
});
test('completion is idempotent, reversible and isolated by goal and task instance',()=>{
 const s=seed(),id=s.tasks[0].id,done=setCompletion(s,id,true),twice=setCompletion(done,id,true);
 assert.equal(twice.events.length,1);assert.equal(growthFor(done,'exam'),growthFor(s,'exam')+1);assert.equal(growthFor(done,'fitness'),growthFor(s,'fitness'));
 assert.equal(done.tasks[3].executionStatus,'pending');assert.equal(setCompletion(done,id,false).events.length,0);
 assert.equal(setCompletion(setCompletion(done,id,false),id,true).events.length,1);
});
test('moving and resizing preserve task identity; unscheduling does not delete completion',()=>{
 let s=setCompletion(seed(),'walk',true);s=scheduleTask(s,'walk',600,45);let t=s.tasks.find(t=>t.id==='walk');assert.equal(t.scheduledEnd,645);
 s=scheduleTask(s,'walk',480,60);s=scheduleTask(s,'walk',null,60);t=s.tasks.find(t=>t.id==='walk');assert.equal(t.scheduledStart,null);assert.equal(t.scheduledEnd,null);assert.equal(t.executionStatus,'completed');assert.equal(s.events.length,1);
});
test('invalid durations and cross-midnight ranges fail without changing data',()=>{
 const s=seed();for(const [start,duration] of [[1430,30],[0,NaN],[0,10],[-15,30],[Infinity,30],[null,-1]])assert.throws(()=>scheduleTask(s,'walk',start,duration));
 assert.equal(s.tasks.find(t=>t.id==='walk').scheduledStart,null);
});
test('overlaps are reported, adjacent blocks are allowed and other tasks do not move',()=>{
 const s=seed(),scheduled=scheduleTask(s,'walk',540,30);assert.ok(conflicts(scheduled.tasks).has('walk'));
 assert.deepEqual(scheduled.tasks[0],s.tasks[0]);assert.ok(!conflicts(scheduleTask(s,'walk',570,30).tasks).has('walk'));
});
