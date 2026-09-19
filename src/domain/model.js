export const TODAY = '2026-09-19';
export const MODES = {
  tree: {name:'生命之树', en:'TREE OF LIFE', line:'让每一份投入，生长成一片绿意。', stage:'枝叶渐丰', asset:'tree.png'},
  city: {name:'理想之城', en:'MY CITY', line:'从一盏灯开始，建起心中的城市。', stage:'初具轮廓', asset:'city.png'},
  planet: {name:'星球文明', en:'NEW WORLD', line:'在尚未抵达的地方，创造新的可能。', stage:'生命初现', asset:'planet.png'},
};
let counter=0;
export const uid = (prefix='id') => `${prefix}-${Date.now().toString(36)}-${++counter}`;
export const addDays = (date,n) => new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export const daysBetween = (a,b) => Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
export const timeLabel = n => `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export const timeValue = t => {const [h,m]=t.split(':').map(Number); return h*60+m};
export const shortDate = date => `${Number(date.slice(5,7))}月${Number(date.slice(8,10))}日`;
export function createPlan(goal) {
  const months=[]; let cursor=goal.startDate; let i=0;
  const labels=['建立基础，找到自己的节奏','巩固知识，形成学习体系','专项练习，连接知识点','检验成果，调整下一步'];
  while(cursor<=goal.targetDate && i<60){
    const d=new Date(cursor+'T12:00:00Z');
    const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)).toISOString().slice(0,10);
    const last=end<goal.targetDate?end:goal.targetDate;
    const month={id:uid('month'),goalId:goal.id,index:i+1,startDate:cursor,endDate:last,title:labels[Math.min(Math.floor(i/3),3)],description:`围绕「${goal.title}」建立可持续的行动节奏，按时间预算逐步推进。`,source:'ai',revision:1,stale:false,weeks:[]};
    let w=cursor; let wi=0;
    while(w<=last){
      const we=addDays(w,6)<last?addDays(w,6):last;
      month.weeks.push({id:uid('week'),monthId:month.id,index:++wi,startDate:w,endDate:we,title:['梳理基础，建立学习习惯','专项练习，整理薄弱环节','复习巩固，练习与反馈','阶段自测，调整学习节奏','整理本月收获'][Math.min(wi-1,4)],description:/考研/.test(goal.title)?'每天安排词汇复习与数学基础练习，留出时间整理错题；根据实际情况调整强度。':`围绕「${goal.title}」完成本周重点练习，记录反馈并调整下一步。`,source:'ai',revision:1,generated:false});
      w=addDays(we,1);
    }
    months.push(month); cursor=addDays(last,1); i++;
  }
  return months;
}
export function makeGoal(input){return {id:uid('goal'),growthModeId:'tree',status:'draft',baseGrowth:0,description:'',foundation:'',...input,revision:1,months:[],research:{step:0,status:'idle',sources:[]},generatedThrough:null};}
export function generateWeekTasks(goal,week,existing=[]){
  const templates=[{id:`${week.id}-vocab`,weekId:week.id,title:'背英语单词',description:'复习 50 个核心词汇，标记不熟悉的单词。',estimatedDuration:30,recurrence:'daily'}, {id:`${week.id}-math`,weekId:week.id,title:'数学复习资料 A',description:'完成基础例题，整理思路和错题。',estimatedDuration:60,recurrence:'daily'}, {id:`${week.id}-review`,weekId:week.id,title:'整理今日学习笔记',description:'写下今天的一个收获和一个问题。',estimatedDuration:20,recurrence:'daily'}];
  if(week.revision>1 || !/考研/.test(goal.title)){
    templates[0]={...templates[0],title:week.title,description:week.description};
    templates[1]={...templates[1],title:`${goal.title} · 专项练习`,description:`按已确认周计划推进：${week.description}`};
  }
  const tasks=[];
  for(let date=week.startDate;date<=week.endDate;date=addDays(date,1)) for(const t of templates){
    const id=`${t.id}-${date}`;
    if(!existing.some(x=>x.id===id)) tasks.push({id,taskTemplateId:t.id,weekId:week.id,goalId:goal.id,title:t.title,description:`${t.description}\n所属周计划：${week.title}（v${week.revision}）`,estimatedDuration:t.estimatedDuration,date,scheduledStart:null,scheduledEnd:null,executionStatus:'pending',planRevision:week.revision});
  }
  return {templates,tasks};
}
export function setCompletion(state,id,complete){
  const task=state.tasks.find(t=>t.id===id); if(!task)return state;
  const desired=complete?'completed':'pending'; if(task.executionStatus===desired)return state;
  return {...state,tasks:state.tasks.map(t=>t.id===id?{...t,executionStatus:desired}:t),events:complete?[...state.events.filter(e=>e.taskInstanceId!==id),{id:`complete-${id}`,goalId:task.goalId,taskInstanceId:id,occurredAt:new Date().toISOString(),eventType:'completed'}]:state.events.filter(e=>e.taskInstanceId!==id)};
}
export function growthFor(state,goalId){const goal=state.goals.find(g=>g.id===goalId);return (goal?.baseGrowth||0)+state.events.filter(e=>e.goalId===goalId).length;}
export function scheduleTask(state,id,start,duration){
  if(!Number.isFinite(duration)||duration<15||duration>1440||(start!==null && (!Number.isFinite(start)||start<0||start+duration>1440)))throw Error('时间需在同一天内，时长至少 15 分钟。');
  return {...state,tasks:state.tasks.map(t=>t.id===id?{...t,scheduledStart:start,scheduledEnd:start===null?null:start+duration,estimatedDuration:duration}:t)};
}
export function conflicts(tasks){return new Set(tasks.filter(a=>a.scheduledStart!==null&&tasks.some(b=>b.id!==a.id&&b.date===a.date&&b.scheduledStart!==null&&a.scheduledStart<b.scheduledEnd&&a.scheduledEnd>b.scheduledStart)).map(t=>t.id));}
export function updateMonth(goal,id,patch){return {...goal,revision:goal.revision+1,months:goal.months.map(m=>m.id===id?{...m,...patch,source:'user',revision:m.revision+1,stale:true}:m)}};
export function updateWeek(goal,id,patch){return {...goal,revision:goal.revision+1,months:goal.months.map(m=>({...m,weeks:m.weeks.map(w=>w.id===id?{...w,...patch,source:'user',revision:w.revision+1}:w)}))}};
export function seed(){
  const goal=makeGoal({id:'exam',title:'考研一年计划',startDate:TODAY,targetDate:'2027-09-18',timeBudget:5,foundation:'英语基础一般，数学较弱',status:'active',baseGrowth:12}); goal.months=createPlan(goal);goal.research={step:6,status:'completed',sources:[]};
  const fitness=makeGoal({id:'fitness',title:'找回轻盈的身体',startDate:'2026-08-08',targetDate:'2026-12-31',growthModeId:'planet',status:'active',baseGrowth:8});
  const product=makeGoal({id:'product',title:'成为更好的产品设计师',startDate:'2026-06-01',targetDate:'2026-12-31',growthModeId:'city',status:'active',baseGrowth:16});
  const week=goal.months[0].weeks[0];const {templates,tasks}=generateWeekTasks(goal,week);week.generated=true;goal.generatedThrough=week.endDate;
  tasks[0]={...tasks[0],scheduledStart:540,scheduledEnd:570};tasks[1]={...tasks[1],scheduledStart:630,scheduledEnd:690};
  tasks.push({id:'walk',goalId:'fitness',date:TODAY,title:'户外散步，让注意力休息一下',description:'不追求速度，感受身体和呼吸。',estimatedDuration:30,scheduledStart:null,scheduledEnd:null,executionStatus:'pending'});
  tasks.push({id:'read',goalId:'product',date:TODAY,title:'阅读一个优秀产品案例',description:'记录一个值得借鉴的交互细节。',estimatedDuration:45,scheduledStart:840,scheduledEnd:885,executionStatus:'pending'});
  return {goals:[goal,fitness,product],templates,tasks,events:[]};
}
