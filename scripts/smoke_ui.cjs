const puppeteer=require('puppeteer-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle2'});
  await page.click('.demo-roles button:first-child');
  await page.click('.auth-submit');
  await page.waitForSelector('.ops-nav');
  await page.evaluate(()=>window.openTask('task_demo1'));
  await page.waitForSelector('.sponsor-rail .rail-brand');
  assert.ok(await page.$$('.sponsor-rail .rail-brand').then(a=>a.length)>=3);
  assert.ok(await page.$('.video-box'));
  assert.ok(await page.$('.event-chip'));
  await page.click('.rail-brand');
  assert.equal(await page.$eval('.rail-brand',e=>e.getAttribute('aria-pressed')),'true');
  await page.click('#seekstep-10');
  await page.click('#skipForward');
  assert.ok((await page.$eval('#vidtime',e=>e.textContent)).includes('00:10'));
  await page.click('.rail-brand');
  assert.equal(await page.$eval('.rail-brand',e=>e.getAttribute('aria-pressed')),'false');
  await page.click('.event-chip');
  await page.click('#skipForward');
  await page.click('.event-chip');
  console.log('DEBUG EVENT TIME',await page.$eval('#vidtime',e=>e.textContent),'LOGS',await page.$eval('#logBody',e=>e.textContent),'CHIPS',await page.$eval('.event-chip',xs=>xs.slice(0,2).map(x=>({name:x.textContent,pressed:x.getAttribute('aria-pressed')}))));
  assert.ok((await page.$eval('#logBody',e=>e.textContent)).includes('00:20'));
  await page.click('.camera-chip');
  await page.click('#skipForward');
  await page.click('.camera-chip:nth-child(2)');
  await page.click('#skipForward');
  await page.click('.camera-chip:nth-child(2)');
  const output=await page.evaluate(()=>{
   const log=document.querySelector('#logBody').textContent;
   const video=document.querySelector('.video-box').getBoundingClientRect();
   const side=document.querySelector('.sponsor-rail').getBoundingClientRect();
   return {eventLogs:log.includes('00:10')&&log.includes('00:20'),cameraLogs:log.includes('00:30')&&log.includes('00:40'),videoWidth:video.width,sidebarWidth:side.width};
  });
  assert.ok(output.eventLogs&&output.cameraLogs,JSON.stringify(output));
  assert.ok(output.videoWidth>400&&output.sidebarWidth>200,JSON.stringify(output));
  assert.deepEqual(errors,[]);
  console.log('PASS: login, grouped logo rail, 10-second seek, sponsor start/end, event intervals, camera switching and stop',output);
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
