import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const css=await readFile(new URL('../styles.css',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('function revealCard('),source.indexOf('// Only deliberate page changes'));
const listener=source.slice(source.indexOf("appContent.addEventListener('click', event => {\n  const summary"),source.indexOf("appContent.addEventListener('toggle', event => {"));
const browser=await chromium.launch();
try { for(const width of [390,1440]) {
 const page=await browser.newPage({viewport:{width,height:900}});
 await page.setContent(`<style>${css}</style><header class="app-banner">Banner</header><header class="topbar">Page title</header><main id="appContent"><div style="height:700px"></div><details class="panel"><summary>Open card</summary><input aria-label="Name"><div style="height:1400px"></div></details><div style="height:1600px"></div></main>`);
 await page.addScriptTag({content:`const appContent=document.querySelector('#appContent');${helper}${listener}`});
 await page.locator('summary').click();
 await page.waitForFunction(()=>{const expected=Math.max(...[...document.querySelectorAll('.app-banner,.topbar')].map(e=>parseFloat(getComputedStyle(e).top)+e.getBoundingClientRect().height))+12;return Math.abs(document.querySelector('details').getBoundingClientRect().top-expected)<2;});
 assert.notEqual(await page.evaluate(()=>document.activeElement.tagName),'INPUT');
 await page.locator('summary').click();const closed=await page.evaluate(()=>scrollY);await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>scrollY),closed);
 // Realtime/programmatic restoration of an open card must not trigger scrolling.
 await page.evaluate(()=>document.querySelector('details').open=true);await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>scrollY),closed);
 await page.locator('summary').focus();await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.waitForTimeout(80);
 assert(await page.locator('details').evaluate(e=>e.open));
 await page.close();console.log(width,'card alignment, keyboard, no input focus, close/refresh stability passed');
}}finally{await browser.close();}
