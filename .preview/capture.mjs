import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1560, height: 900 }, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:4173/preview-insights.html',{waitUntil:'networkidle'});
await page.screenshot({path:'sponsor-studio-insights-full.png',fullPage:true,animations:'disabled'});
await page.screenshot({path:'sponsor-studio-insights-top.png',clip:{x:0,y:0,width:1560,height:1500},animations:'disabled'});
await browser.close();
