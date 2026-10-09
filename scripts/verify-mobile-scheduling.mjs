// Run against a local V3 server; browser data stays in isolated test contexts.
// Uses an installed Playwright or the optional PLAYWRIGHT_MODULE module path.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const baseUrl=process.env.BASE_URL||'http://127.0.0.1:5183/';
const output=process.env.QA_OUTPUT;
if(output)await mkdir(output,{recursive:true});
const key='mingrifu-v3-demo-1';
const read=page=>page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),key);
const snapshot=page=>page.evaluate(key=>sessionStorage.getItem(key),key);
const taskOf=(state,id)=>state.tasks.find(task=>task.id===id);
const errors=[];
const browsers=[];
async function capture(page,name){if(output)await page.screenshot({path:`${output}/${name}.png`});}
async function mobileChecks(browser,label,width){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,locale:'zh-CN',timezoneId:'Asia/Shanghai'});
 try{
  const page=await context.newPage();page.on('pageerror',error=>errors.push(`${label}: ${error.message}`));
  await page.goto(baseUrl);
  await page.getByRole('button',{name:'创建新目标',exact:true}).click();
  await page.getByPlaceholder('例如：考研一年计划',{exact:true}).fill('考研移动排程验收');
  await page.getByLabel('让目标更具体一点').fill('完成基础复习，每周检查学习成果。');
  await page.getByLabel('完成日期',{exact:true}).fill('2026-09-30');
  await page.getByLabel('每天可以投入').fill('1.5');
  await page.getByRole('button',{name:'使用 Copilot 拆解'}).click();
  await page.getByRole('button',{name:'查看月度与周度计划'}).click({timeout:20000});
  await page.getByRole('button',{name:'确认计划并生成每日任务'}).click();
  await page.locator('.mobile-tabs').waitFor();
  await page.getByRole('button',{name:'关闭提示'}).click();
  const state=await read(page);const goal=state.goals.find(g=>g.title==='考研移动排程验收');
  assert.ok(goal);const task=state.tasks.find(t=>t.goalId===goal.id&&t.date===goal.startDate);
  assert.ok(task);assert.equal(task.scheduledStart,null);
  const row=page.locator('.task-row').filter({hasText:goal.title}).filter({has:page.getByRole('button',{name:task.title,exact:true})});
  const arrange=row.getByRole('button',{name:`安排时间：${task.title}`,exact:true});
  assert.equal((await arrange.innerText()).trim(),'安排');
  await arrange.click();
  const panel=page.getByRole('dialog',{name:'行动详情'});
  await panel.waitFor();assert.ok((await panel.innerText()).includes(task.title));
  assert.ok((await panel.innerText()).includes(`预计 ${task.estimatedDuration} 分钟`));
  await panel.getByLabel('开始时间',{exact:true}).fill('12:00');
  await panel.getByLabel('持续时间（分钟）').fill('45');
  await capture(page,`${label}-arrange`);
  const beforeCancel=await snapshot(page);
  await panel.getByRole('button',{name:'取消',exact:true}).click();
  assert.equal(await snapshot(page),beforeCancel);
  await arrange.click();
  assert.equal(await panel.getByLabel('持续时间（分钟）').inputValue(),String(task.estimatedDuration));
  await panel.getByRole('button',{name:'关闭行动详情'}).click();
  assert.equal(await snapshot(page),beforeCancel);
  await arrange.click();
  await panel.getByLabel('开始时间',{exact:true}).fill('23:45');
  await panel.getByLabel('持续时间（分钟）').fill('30');
  await panel.getByRole('button',{name:'确认安排',exact:true}).click();
  await panel.getByRole('alert').waitFor();
  assert.equal(await snapshot(page),beforeCancel);
  await panel.getByLabel('开始时间',{exact:true}).fill('12:00');
  await panel.getByLabel('持续时间（分钟）').fill('45');
  await panel.getByRole('button',{name:'确认安排',exact:true}).click();
  await panel.waitFor({state:'detached'});
  const after=await read(page);const saved=taskOf(after,task.id);
  assert.equal(saved.scheduledStart,720);assert.equal(saved.scheduledEnd,765);assert.equal(saved.estimatedDuration,45);
  assert.equal(saved.executionStatus,task.executionStatus);assert.deepEqual(after.events,state.events);
  await page.locator('.mobile-tabs').getByRole('button',{name:'时间流',exact:true}).click();
  const block=page.locator('.time-block').filter({hasText:task.title}).last();
  await block.scrollIntoViewIfNeeded();assert.ok((await block.innerText()).includes('12:00 — 12:45'));
  await capture(page,`${label}-timeline`);
  await page.reload();assert.deepEqual(taskOf(await read(page),task.id),saved);
  await page.locator('.mobile-tabs').getByRole('button',{name:'时间流',exact:true}).click();
  await page.locator('.time-block').filter({hasText:task.title}).last().locator('.block-content').click();
  await panel.getByLabel('开始时间',{exact:true}).fill('09:00');
  await panel.getByRole('button',{name:'确认安排',exact:true}).click();
  await page.locator('.conflict-banner').waitFor();
  assert.equal(taskOf(await read(page),task.id).scheduledStart,540);
  assert.ok((await page.locator('.conflict-banner').innerText()).includes('时段重叠'));
  await page.getByRole('button',{name:'后一天',exact:true}).click();
  const nextTask=(await read(page)).tasks.find(t=>t.goalId===goal.id&&t.date>goal.startDate);
  assert.ok(nextTask);
  await page.locator('.mobile-tabs').getByRole('button',{name:'待安排',exact:true}).click();
  await page.locator('.task-row').filter({hasText:goal.title}).getByRole('button',{name:`安排时间：${nextTask.title}`,exact:true}).click();
  await panel.getByLabel('开始时间',{exact:true}).fill('11:00');
  await panel.getByLabel('持续时间（分钟）').fill('30');
  await panel.getByRole('button',{name:'确认安排',exact:true}).click();
  const nextSaved=taskOf(await read(page),nextTask.id);
  assert.equal(nextSaved.date,nextTask.date);assert.equal(nextSaved.scheduledStart,660);assert.equal(nextSaved.scheduledEnd,690);
  assert.equal(taskOf(await read(page),task.id).scheduledStart,540);
  await page.locator('.mobile-tabs').getByRole('button',{name:'时间流',exact:true}).click();
  await page.locator('.time-block').filter({hasText:nextTask.title}).locator('.block-content').waitFor();
  const sizes=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  assert.equal(sizes.client,sizes.scroll,`${label}: horizontal overflow`);
  console.log(`${label} PASS: create → generate → arrange → cancel/close → cross-midnight rejected → 45-minute save → timeline → refresh → conflict → next-day schedule`);
 }finally{await context.close();}
}
async function desktopChecks(browser){
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 try{
  const page=await context.newPage();page.on('pageerror',error=>errors.push(`desktop: ${error.message}`));
  await page.goto(baseUrl);await page.getByRole('button',{name:'专注排程',exact:true}).click();
  const row=page.locator('.task-row').filter({hasText:'户外散步，让注意力休息一下'});
  assert.equal((await row.locator('.task-schedule').innerText()).trim(),'');
  const source=await row.boundingBox(),target=await page.locator('.timeline').boundingBox();assert.ok(source&&target);
  await page.mouse.move(source.x+source.width/2,source.y+source.height/2);await page.mouse.down();
  await page.mouse.move(target.x+target.width/2,target.y+208,{steps:20});await page.mouse.up();
  const walk=taskOf(await read(page),'walk');assert.equal(walk.scheduledStart,600);assert.equal(walk.scheduledEnd,630);
  await page.locator('.time-block').filter({hasText:'户外散步，让注意力休息一下'}).locator('.block-content').click();
  const panel=page.getByRole('dialog',{name:'行动详情'});await panel.getByRole('button',{name:'保存时间',exact:true}).waitFor();
  assert.equal(await panel.getByRole('button',{name:'取消',exact:true}).isVisible(),false);
  await panel.getByRole('button',{name:'关闭行动详情'}).click();
  await capture(page,'desktop-drag');console.log('desktop PASS: real mouse drag → 10:00–10:30; existing save-time panel retained');
 }finally{await context.close();}
}
try{
 const chrome=await chromium.launch({channel:'chrome',headless:true});browsers.push(chrome);
 await mobileChecks(chrome,'chromium-mobile-390',390);
 await mobileChecks(chrome,'chromium-mobile-320',320);
 await desktopChecks(chrome);
 let safari;
 try{safari=await webkit.launch({headless:true});browsers.push(safari);}catch(error){console.log('WebKit unavailable:',error.message.split('\n')[0]);}
 if(safari)await mobileChecks(safari,'webkit-mobile-390',390);
 assert.deepEqual(errors,[]);console.log('No page errors. These are browser-engine/viewport tests, not real-device or WeChat tests.');
}finally{await Promise.all(browsers.map(browser=>browser.close()));}
