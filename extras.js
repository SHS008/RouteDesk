/* RouteDesk preview tools: OCR is on-device; map/routing requests are opt-in. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id), rd=()=>window.RouteDesk, esc=x=>rd().esc(x);
  let worker=null, planDraft=null, scanBusy=false;
  let apiKey=sessionStorage.getItem('routedesk-ors-session')||'';
  function dialog(title,body){
    let d=$('toolsDialog');if(!d){d=document.createElement('dialog');d.id='toolsDialog';d.className='tools-dialog';document.body.appendChild(d);}
    d.innerHTML=`<header><div><span class="tools-eyebrow">ROUTEDESK / ROUTE TOOLS</span><h2>${title}</h2></div><button type="button" data-tool="close" aria-label="Close">✕</button></header><div class="tools-body">${body}</div>`;
    if(!d.open)d.showModal();return d;
  }
  function status(message){const el=$('toolsStatus');if(el)el.textContent=message;}
  function keyField(){return `<label>Free openrouteservice API key <input id="orsKey" type="password" autocomplete="off" value="${esc(apiKey)}" placeholder="Optional for scan; required for address lookup & planning"></label><p class="tools-help">Create a free Standard key at <a href="https://account.heigit.org/" target="_blank" rel="noopener">HeiGIT / openrouteservice</a>. No paid API is configured. Key stays in this browser tab’s session, not in route exports. Requests share selected addresses or coordinates with the provider. <button type="button" data-tool="forget-key">Forget key</button></p>`;}
  function readKey(){apiKey=$('orsKey')?.value.trim()||apiKey;if(!apiKey)throw new Error('Enter your free openrouteservice key first.');sessionStorage.setItem('routedesk-ors-session',apiKey);return apiKey;}
  async function api(path,body){
    if(!navigator.onLine)throw new Error('You’re offline. Logging still works; try planning when connected.');
    const key=readKey();const response=await fetch('https://api.openrouteservice.org/'+path,{method:body?'POST':'GET',headers:body?{'Authorization':key,'Content-Type':'application/json'}:{'Authorization':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(response.status===429?'Free API quota/rate limit reached. Try later; no changes applied.':`Routing service rejected the request (${response.status}). Check your key and provider limits.`);
    return response.json();
  }
  function stopMap(stop){
    if(!rd().hasValidCoordinates(stop))return `<section class="stop-map"><div class="map-empty">⌖ Stop pin not set <small>Confirm the location once while online. Logging works without a map.</small></div><button data-extra="locate" data-stop="${esc(stop.id)}">Set / look up stop pin</button></section>`;
    const lat=Number(stop.lat),lon=Number(stop.lon),box=[lon-.006,lat-.004,lon+.006,lat+.004].join(',');
    return `<section class="stop-map">${navigator.onLine?`<iframe title="Current stop location — OpenStreetMap" loading="lazy" referrerpolicy="no-referrer" src="https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(box)}&layer=mapnik&marker=${lat}%2C${lon}"></iframe>`:'<div class="map-empty">⌖ Map unavailable offline<small>Your saved coordinates and all logging controls still work.</small></div>'}<div class="map-caption"><span>⌖ ${lat.toFixed(5)}, ${lon.toFixed(5)} · <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}" target="_blank" rel="noopener">© OpenStreetMap contributors</a></span><button data-extra="locate" data-stop="${esc(stop.id)}">Edit pin</button></div></section>`;
  }
  function scan(){
    dialog('Scan an address list',`<p class="tools-intro">Photo → editable addresses → route. Text recognition runs on this device, not a paid AI service.</p><div class="tools-callout">Printed lists work best. Check every address: handwriting, columns, and blurry photos can produce mistakes. No stops are saved until you approve them.</div><label class="scan-picker">▣ Take a photo / choose image<input type="file" id="scanImage" accept="image/*" capture="environment"></label><p class="tools-help">First scan downloads the local recognition engine and English model from this app. Later scans may work offline if the browser retains them. Images aren’t uploaded.</p><p id="toolsStatus" role="status" aria-live="polite"></p><label>Route name<input id="scanName" value="Scanned route"></label><label>Review addresses — one complete address per line<textarea id="scanText" rows="8" placeholder="Recognized text appears here. Remove headings and combine wrapped lines before creating stops."></textarea></label><div class="tools-row"><button data-tool="create-scan" class="tools-primary">Create new route from reviewed lines</button><button data-tool="append-scan" ${rd().getActiveRoute()?.status==='complete'||!rd().getActiveRoute()?'disabled':''}>Add to current route</button></div>`);
    $('scanImage').addEventListener('change',e=>recognize(e.target.files[0]));
  }
  async function script(src){if(window.Tesseract)return;await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('Recognition engine not available. Connect once to load it.'));document.head.appendChild(s);});}
  async function recognize(file){
    if(!file||scanBusy)return;scanBusy=true;$('scanImage').disabled=true;
    try{
      if(file.size>20*1024*1024)throw new Error('Choose an image smaller than 20 MB.');
      status('Loading recognition engine…');await script('./vendor/tesseract.min.js');
      if(!worker)worker=await Tesseract.createWorker('eng',1,{workerPath:'./vendor/worker.min.js',corePath:'./vendor/core',langPath:'./vendor/lang',logger:m=>{if(m.status)status(`${m.status} ${Math.round((m.progress||0)*100)}%`);}});
      const {data}=await worker.recognize(file);
      if($('scanText'))$('scanText').value=data.text.split('\n').map(l=>l.trim()).filter(Boolean).join('\n');
      status(`Text recognized (${Math.round(data.confidence)}% confidence). Review each line before saving.`);
    }catch(e){status(e.message);if(worker){await worker.terminate().catch(()=>{});worker=null;}}
    finally{scanBusy=false;if($('scanImage'))$('scanImage').disabled=false;}
  }
  function createScan(append){
    const lines=$('scanText').value.split('\n').map(l=>l.trim()).filter(Boolean);if(!lines.length){status('Add or recognize at least one address.');return;}
    const stops=lines.map(address=>rd().normalizeStop({address}));const route=rd().getActiveRoute();
    if(append){if(!route||route.status==='complete'){status('Choose an unfinished route first.');return;}route.stops.push(...stops);route.updatedAt=new Date().toISOString();if(!rd().saveState()){route.stops.splice(-stops.length);status('Could not save stops. Free browser storage and retry.');return;}rd().render();}
    else rd().createRoute({name:$('scanName').value.trim()||'Scanned route',driver:rd().state.settings.defaultDriver,date:`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`,stops});
    $('toolsDialog').close();rd().showToast(`${stops.length} reviewed stops saved.`);
  }
  function locate(id){
    const route=rd().getActiveRoute(),stop=route?.stops.find(s=>s.id===id);if(!stop)return;
    dialog('Confirm stop location',`<p class="tools-intro">${esc(stop.name||stop.address)}</p>${keyField()}<label>Full address (include city / state)<input id="geoQuery" value="${esc(stop.address)}"></label><button class="tools-primary" data-tool="search-pin">Search address online</button><div id="geoResults"></div><p class="tools-help">Choose the correct result. A building pin is not a guarantee of the correct driveway or approach side.</p><div class="tools-row"><label>Latitude<input id="pinLat" type="number" step="any" min="-90" max="90" value="${stop.lat??''}"></label><label>Longitude<input id="pinLon" type="number" step="any" min="-180" max="180" value="${stop.lon??''}"></label></div><p class="tools-help">You can also enter surveyed coordinates manually, without a key or internet.</p><p id="toolsStatus" role="status"></p><button data-tool="save-pin" class="tools-primary">Confirm & save pin</button>`);
    $('toolsDialog').dataset.stopId=id;
  }
  async function searchPin(){
    const q=$('geoQuery').value.trim();if(!q)throw new Error('Enter a full address.');status('Looking up candidates…');
    const data=await api('geocode/search?text='+encodeURIComponent(q)+'&size=5');
    if(!$('geoResults'))return;
    $('geoResults').innerHTML=(data.features||[]).map(f=>`<button class="geo-result" data-tool="pick-pin" data-lon="${Number(f.geometry.coordinates[0])}" data-lat="${Number(f.geometry.coordinates[1])}">${esc(f.properties.label)}</button>`).join('')||'<p>No matches. Try adding city and state, or enter coordinates manually.</p>';status('Choose a result, then confirm the pin.');
  }
  function savePin(){
    const lat=$('pinLat').value.trim(),lon=$('pinLon').value.trim();const v={lat,lon};if(!lat||!lon||!rd().hasValidCoordinates(v))throw new Error('Enter valid latitude and longitude.');
    const stop=rd().getActiveRoute()?.stops.find(s=>s.id===$('toolsDialog').dataset.stopId);if(!stop)throw new Error('This route is no longer active.');const before={lat:stop.lat,lon:stop.lon};stop.lat=Number(lat);stop.lon=Number(lon);if(!rd().saveState()){Object.assign(stop,before);throw new Error('Could not save pin. Free browser storage and retry.');}rd().render();$('toolsDialog').close();rd().showToast('Stop pin saved on this device.');
  }
  function planner(){
    const route=rd().getActiveRoute();if(!route||route.status==='complete'){rd().showToast('Choose an unfinished route first.');return;}planDraft=null;
    const stops=route.stops.filter(s=>s.status==='pending');
    dialog('Plan a driving order',`<p class="tools-intro">Estimated quickest order, using a road-time matrix—not straight-line distance. Only pending stops are reordered.</p><div class="tools-callout">Free-tier preview: 2–40 pending stops with confirmed coordinates. No live traffic. Heuristic optimization is not a guarantee of the global fastest route. The original order stays unchanged until you apply.</div>${keyField()}<label>Start<select id="planStart"><option value="first">Keep first pending stop as start</option><option value="custom">Custom starting coordinates</option></select></label><div class="tools-row"><label>Start latitude<input id="startLat" type="number" step="any"></label><label>Start longitude<input id="startLon" type="number" step="any"></label></div><label>End<select id="planEnd"><option value="any">Finish at any stop</option><option value="start">Return to start</option><option value="custom">Custom ending coordinates</option></select></label><div class="tools-row"><label>End latitude<input id="endLat" type="number" step="any"></label><label>End longitude<input id="endLon" type="number" step="any"></label></div><label>Service / passenger approach side<select id="approachSide"><option value="either">Either side</option><option value="right">Right side preferred</option><option value="left">Left side preferred</option></select></label><p class="tools-warning">Approach side is advisory only in this free planner: it does NOT enforce curb-side arrival or change travel times. Confirm safe/legal access yourself. We will not label a route curb-side optimized.</p><details><summary>Stop coordinates (${stops.filter(s=>rd().hasValidCoordinates(s)).length}/${stops.length} ready)</summary>${stops.map(s=>`<div class="plan-stop"><span>${esc(s.name||s.address)}<small>${rd().hasValidCoordinates(s)?`${Number(s.lat).toFixed(4)}, ${Number(s.lon).toFixed(4)}`:'Needs a confirmed pin'}</small></span><button data-extra="locate" data-stop="${esc(s.id)}">Set pin</button></div>`).join('')}</details><p class="tools-help">Setting a pin closes this planner; reopen Plan route afterwards. A matrix request sends stop coordinates to openrouteservice. Service quotas apply; errors leave your route unchanged.</p><p id="toolsStatus" role="status" aria-live="polite"></p><div id="planResult"></div><div class="tools-row"><button data-tool="calculate" class="tools-primary">Generate proposed order</button><button data-tool="apply-plan" disabled id="applyPlan">Apply proposed order</button></div>`);
    $('approachSide').value=route.approachSide||'either';
  }
  function coordinate(a,b){const x=$(a).value.trim(),y=$(b).value.trim();if(!x||!y||!rd().hasValidCoordinates({lat:x,lon:y}))throw new Error('Enter valid start/end coordinates.');return [Number(y),Number(x)];}
  function solve(matrix,n,start,end,anchored){
    const path=[];let left=Array.from({length:n},(_,i)=>i),current=start;
    if(anchored){path.push(0);left.shift();current=0;}
    while(left.length){let best=left.reduce((a,b)=>matrix[current][a]<=matrix[current][b]?a:b);path.push(best);left=left.filter(x=>x!==best);current=best;}
    const cost=p=>{let t=start===null?0:matrix[start][p[0]];for(let i=1;i<p.length;i++)t+=matrix[p[i-1]][p[i]];if(end!==null)t+=matrix[p[p.length-1]][end];return t;};
    let bestCost=cost(path);for(let pass=0;pass<8;pass++){let changed=false;for(let i=anchored?1:0;i<n-1;i++)for(let j=i+1;j<n;j++){const p=[...path.slice(0,i),...path.slice(i,j+1).reverse(),...path.slice(j+1)],c=cost(p);if(c+0.1<bestCost){path.splice(0,n,...p);bestCost=c;changed=true;}}if(!changed)break;}
    const original=cost(Array.from({length:n},(_,i)=>i));if(bestCost>original){return {path:Array.from({length:n},(_,i)=>i),seconds:original,original};}
    return {path,seconds:bestCost,original};
  }
  async function calculate(){
    const route=rd().getActiveRoute(),stops=route.stops.filter(s=>s.status==='pending');planDraft=null;$('applyPlan').disabled=true;
    if(stops.length<2||stops.length>40)throw new Error('This free planner supports 2–40 pending stops. Larger routes remain unchanged.');
    if(stops.some(s=>!rd().hasValidCoordinates(s)))throw new Error('Confirm a pin for every pending stop first. Expand Stop coordinates to set them.');
    const locations=stops.map(s=>[Number(s.lon),Number(s.lat)]),anchored=$('planStart').value==='first';let start=0,end=null;
    if(!anchored){start=locations.length;locations.push(coordinate('startLat','startLon'));}
    if($('planEnd').value==='start')end=start;
    if($('planEnd').value==='custom'){end=locations.length;locations.push(coordinate('endLat','endLon'));}
    const side=$('approachSide').value,signature=JSON.stringify(route.stops);status('Calculating road travel times…');
    const data=await api('v2/matrix/driving-car',{locations,metrics:['duration']});
    if(!$('planResult'))return;
    if(!Array.isArray(data.durations)||data.durations.length!==locations.length||data.durations.some(r=>r.length!==locations.length||r.some(x=>typeof x!=='number'||!Number.isFinite(x))))throw new Error('Some stops are unreachable by road. Check pins; route was not changed.');
    const solution=solve(data.durations,stops.length,start,end,anchored);
    planDraft={routeId:route.id,signature,ids:solution.path.map(i=>stops[i].id),side};
    $('planResult').innerHTML=`<div class="tools-callout"><strong>${Math.round(solution.seconds/60)} min estimated driving</strong> · original order ${Math.round(solution.original/60)} min<br>Excludes service time, live traffic, and enforced approach-side constraints.</div><ol>${solution.path.map(i=>`<li>${esc(stops[i].name||stops[i].address)}</li>`).join('')}</ol>`;$('applyPlan').disabled=false;status('Proposal ready. Review before applying.');
  }
  function applyPlan(){
    const route=rd().getActiveRoute();if(!planDraft||route?.id!==planDraft.routeId||JSON.stringify(route.stops)!==planDraft.signature)throw new Error('Route changed. Generate a fresh proposal first.');
    const pending=new Map(route.stops.filter(s=>s.status==='pending').map(s=>[s.id,s]));let i=0;
    route.previousStopOrder=route.stops.map(s=>s.id);route.stops=route.stops.map(s=>s.status==='pending'?pending.get(planDraft.ids[i++]):s);route.approachSide=planDraft.side;route.orderMethod='Estimated road-time order (approach side not enforced)';route.updatedAt=new Date().toISOString();rd().saveState();rd().render();$('toolsDialog').close();rd().showToast('Proposed order applied. Original order is available under Undo planned order.');
  }
  function undoPlan(){const route=rd().getActiveRoute();if(!route?.previousStopOrder){rd().showToast('No previous planned order to restore.');return;}const byId=new Map(route.stops.map(s=>[s.id,s]));route.stops=[...route.previousStopOrder.map(id=>byId.get(id)).filter(Boolean),...route.stops.filter(s=>!route.previousStopOrder.includes(s.id))];delete route.previousStopOrder;route.orderMethod='Original order restored';rd().saveState();rd().render();rd().showToast('Original order restored. Stop logs are unchanged.');}
  document.addEventListener('click',async e=>{
    const extra=e.target.closest('[data-extra]');if(extra){if(extra.dataset.extra==='scan')scan();if(extra.dataset.extra==='plan')planner();if(extra.dataset.extra==='locate')locate(extra.dataset.stop);if(extra.dataset.extra==='undo-plan')undoPlan();return;}
    const tool=e.target.closest('[data-tool]');if(!tool)return;
    try{switch(tool.dataset.tool){case 'close':$('toolsDialog').close();break;case 'forget-key':apiKey='';sessionStorage.removeItem('routedesk-ors-session');if($('orsKey'))$('orsKey').value='';break;case 'create-scan':createScan(false);break;case 'append-scan':createScan(true);break;case 'search-pin':await searchPin();break;case 'pick-pin':$('pinLat').value=tool.dataset.lat;$('pinLon').value=tool.dataset.lon;status('Candidate selected. Confirm the location before saving.');break;case 'save-pin':savePin();break;case 'calculate':tool.disabled=true;await calculate();break;case 'apply-plan':applyPlan();break;}}
    catch(err){status(err.name==='TimeoutError'?'Service timed out. No route changes applied.':err.message);}
    finally{if(tool.dataset.tool==='calculate')tool.disabled=false;}
  });
  window.RouteDeskExtras={stopMap,solve};
})();
