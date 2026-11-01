const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3000');await page.evaluate(()=>document.getElementById('loadDemoButton').click());
 await page.locator('#startRouteButton').click();
 await page.locator('[data-driver=exit]').first().click();assert.equal(await page.locator('#startRouteButton').textContent(),'Continue route');await page.locator('#startRouteButton').click();
 // Manual pin and map embedding, without geocoding or a paid API.
 await page.locator('[data-extra=locate]').click();await page.locator('#pinLat').fill('45.7452');await page.locator('#pinLon').fill('-87.0646');await page.locator('[data-tool=save-pin]').click();assert.equal(await page.locator('.stop-map iframe').count(),1);
 // Last skipped stop archives immediately without confirmation dialog.
 await page.evaluate(()=>{const r=RouteDesk.getActiveRoute();r.stops=r.stops.slice(0,1);RouteDesk.saveState();RouteDesk.render();});
 assert.match(await page.locator('[data-driver=service]').textContent(),/Finish & save/);
 await page.locator('[data-driver=issue]').click();await page.locator('#driverDetail').fill('Need to return');await page.locator('#driverOutcome').selectOption('pending');assert.match(await page.locator('#driverLogForm [type=submit]').textContent(),/keep pending/);await page.locator('#driverLogForm [type=submit]').click();assert.equal(await page.evaluate(()=>RouteDesk.getActiveRoute().status),'active');
 await page.context().setOffline(true);await page.locator('[data-driver=skip]').click();await page.locator('#driverLogForm [type=submit]').click();
 assert.equal(await page.evaluate(()=>RouteDesk.state.routes[0].status),'complete');assert.equal(await page.locator('#driverMode').isVisible(),false);await page.context().setOffline(false);
 // Camera/photo OCR: real local model recognizes a generated address image.
 await page.evaluate(()=>RouteDesk.setScreen('today'));await page.locator('[data-extra=scan]:visible').first().click();await page.locator('#scanImage').setInputFiles(require('node:path').join(__dirname,'ocr-fixture.png'));
 await page.waitForFunction(()=>document.querySelector('#toolsStatus')?.textContent.startsWith('Text recognized'),{},{timeout:120000});
 const text=await page.locator('#scanText').inputValue();assert.match(text,/123 Main Street/i);assert.match(text,/456 Oak Avenue/i);
 await page.locator('#scanText').fill('123 Main Street, Escanaba, MI\n456 Oak Avenue, Escanaba, MI');await page.locator('[data-tool=create-scan]').click();assert.equal(await page.evaluate(()=>RouteDesk.getActiveRoute().stops.length),2);
 // Route matrix fixture verifies generation, review, apply and undo. No real API key used.
 await page.evaluate(()=>{const r=RouteDesk.getActiveRoute();r.stops.push(RouteDesk.normalizeStop({address:'789 Pine Road',lat:45.75,lon:-87.07}));r.stops[0].lat=45.74;r.stops[0].lon=-87.06;r.stops[1].lat=45.76;r.stops[1].lon=-87.08;RouteDesk.saveState();RouteDesk.render();});
 await page.route('https://api.openrouteservice.org/v2/matrix/driving-car',route=>route.fulfill({json:{durations:[[0,100,10],[100,0,10],[10,10,0]]}}));
 await page.locator('[data-extra=plan]').click();await page.locator('#orsKey').fill('test-key-not-a-real-credential');await page.locator('#approachSide').selectOption('left');await page.locator('[data-tool=calculate]').click();await page.locator('#applyPlan:not([disabled])').waitFor();await page.locator('#applyPlan').click();assert.equal(await page.evaluate(()=>RouteDesk.getActiveRoute().stops[1].address),'789 Pine Road');
 await page.locator('[data-extra=undo-plan]').click();assert.equal(await page.evaluate(()=>RouteDesk.getActiveRoute().stops[1].address),'456 Oak Avenue, Escanaba, MI');
 // Actual service-worker offline reload plus final serviced -> archived.
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await page.context().setOffline(true);await page.reload();await page.locator('#startRouteButton').click();
 for(let i=0;i<3;i++)await page.locator('[data-driver=service]').click();assert.equal(await page.evaluate(()=>RouteDesk.state.routes[0].status),'complete');
 assert.deepEqual(errors,[]);console.log('PASS: exit/resume, manual pin/map, pending issue, offline final skip/archive, real OCR, scan review/create, matrix proposal/apply/undo (mocked), offline reload/final service archive.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
