(() => {
  'use strict';
  const STORAGE_KEY = 'routedesk-free-workspace-v1';
  const OUTBOX_KEY = 'routedesk-outbox-v1';
  const APP_VERSION = '1.3';
  const $ = (id) => document.getElementById(id);
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `rd-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
  const freshState = () => ({
    version: APP_VERSION,
    templates: [],
    routes: [],
    activeRouteId: null,
    settings: {
      defaultDriver: 'Driver 1',
      navigation: 'google',
      navMode: 'app',        // 'app' opens a map app, 'copy' copies the address
      tripStops: 'auto',     // stops per navigation trip: auto | 3 | 5 | 9
      sync: { url: '', anonKey: '', teamCode: '', device: '', autoSubmit: true },
      noticeDismissed: false
    }
  });
  let state = loadState();
  let screen = 'today';
  let stopFilter = 'all';
  let stopSearch = '';
  let reportSearch = '';
  let skipTargetId = null;
  let editingStopId = null;
  let toastTimer = null;
  let installPrompt = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.routes)) return freshState();
      const legacy = !Array.isArray(parsed.templates);
      parsed.settings = Object.assign(freshState().settings, parsed.settings || {});
      parsed.routes = Array.isArray(parsed.routes) ? parsed.routes.map(normalizeRoute) : [];
      parsed.templates = Array.isArray(parsed.templates) ? parsed.templates.map(normalizeTemplate) : [];
      if (legacy) {
        // First open after upgrading: persist the migrated shape so route data is
        // not re-normalized on every load, and stamp the new version.
        parsed.version = APP_VERSION;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed)); } catch (_) {}
      }
      return parsed;
    } catch (_) { return freshState(); }
  }
  function normalizeRoute(route) {
    const safe = Object.assign({ id: uid(), name: 'Untitled route', date: todayISO(), driver: 'Driver 1', status: 'planned', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), startedAt: null, completedAt: null, templateId: null, stops: [] }, route || {});
    safe.stops = Array.isArray(safe.stops) ? safe.stops.map(normalizeStop) : [];
    return safe;
  }
  function normalizeTemplate(template) {
    const safe = Object.assign({ id: uid(), name: 'Untitled list', driver: '', notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastRunAt: null, stops: [] }, template || {});
    safe.stops = Array.isArray(safe.stops) ? safe.stops.map(normalizeStop) : [];
    return safe;
  }
  function normalizeStop(stop) {
    return Object.assign({ id: uid(), name: '', address: '', lat: null, lon: null, notes: '', status: 'pending', completedAt: null, skipReason: '' }, stop || {});
  }
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const indicator = document.querySelector('.local-pill');
      if (indicator) indicator.title = `Saved locally at ${new Date().toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}`;
    } catch (err) {
      showToast('Could not save. This browser may be out of storage space.');
    }
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function prettyDate(value, options={weekday:'short',month:'short',day:'numeric'}) {
    if (!value) return 'No date';
    const d = new Date(`${value}T12:00:00`);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, options);
  }
  function timestampLabel(value) {
    if (!value) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  }
  function getRoute(id=state.activeRouteId) { return state.routes.find(r => r.id === id) || null; }
  function getActiveRoute() {
    let route = getRoute();
    if (!route && state.routes.length) {
      route = state.routes.find(r => r.date === todayISO() && r.status !== 'complete') || state.routes[0];
      state.activeRouteId = route.id;
      saveState();
    }
    return route;
  }
  function counts(route) {
    const out = {total:0,pending:0,serviced:0,skipped:0};
    if (!route) return out;
    out.total = route.stops.length;
    route.stops.forEach(s => { if (s.status === 'serviced') out.serviced++; else if (s.status === 'skipped') out.skipped++; else out.pending++; });
    return out;
  }
  function showToast(message) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2700);
  }
  function openDialog(id) { const dialog=$(id); if (dialog && !dialog.open) dialog.showModal(); }
  function closeDialog(id) { const dialog=$(id); if (dialog && dialog.open) dialog.close(); }

  function setScreen(next) {
    screen = next;
    document.querySelectorAll('.screen').forEach(el => el.classList.toggle('active', el.id === `screen-${next}`));
    document.querySelectorAll('[data-screen]').forEach(el => el.classList.toggle('active', el.dataset.screen === next));
    const labels = {today:'Today',library:'Master lists',routes:'Routes',completed:'Completed jobs',reports:'Service log',settings:'Settings'};
    $('screenCrumb').textContent = labels[next] || 'Today';
    render();
    // The manager view must never show a cached team's rows.
    if (next === 'completed' && syncReady()) fetchCompletedRuns({ quiet: true });
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function render() {
    $('headerDate').textContent = new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
    $('navTodayCount').textContent = String(state.routes.filter(r => r.date === todayISO() && r.status !== 'complete').length);
    renderToday();
    renderLibrary();
    renderRoutes();
    renderCompletedJobs();
    renderReports();
    renderSettings();
    $('dismissNotice').hidden = !!state.settings.noticeDismissed;
    document.querySelector('.free-notice').hidden = !!state.settings.noticeDismissed;
  }
  function renderToday() {
    const route = getActiveRoute();
    const empty = $('todayEmpty');
    const content = $('todayRouteContent');
    if (!route) {
      empty.hidden = false; content.hidden = true;
      $('todayTitle').textContent = 'Your route, at a glance.';
      $('todaySubtitle').textContent = 'Import a stop list to get started. Mark outcomes as you go and export the finished log.';
      return;
    }
    empty.hidden = true; content.hidden = false;
    $('todayTitle').textContent = `Good day, ${route.driver || state.settings.defaultDriver || 'driver'}.`;
    $('todaySubtitle').textContent = 'Your route sequence and service outcomes are saved on this device.';
    $('routeNameHeading').textContent = route.name || 'Untitled route';
    $('routeDateLabel').textContent = prettyDate(route.date);
    $('routeDriverLabel').textContent = route.driver || 'Unassigned';
    $('routeStopCountLabel').textContent = `${route.stops.length} stops`;
    const firstAddress = route.startAddress ? `Starts: ${route.startAddress}` : route.orderMethod === 'Approximate straight-line distance' ? 'Approximate straight-line order · first stop anchored' : route.orderMethod === 'Manual reorder' ? 'Manually reordered · edit stops any time' : 'Imported sequence · edit stops any time';
    $('routeOriginSummary').textContent = firstAddress;
    $('sequenceNote').innerHTML = route.orderMethod === 'Approximate straight-line distance' ? '<span class="note-icon">↕</span><span>Approximate straight-line order is active. It is not road-time or traffic-aware. Use the arrows to adjust stops.</span>' : route.orderMethod === 'Manual reorder' ? '<span class="note-icon">↕</span><span>Stops were manually reordered. Use the arrows to keep adjusting the sequence.</span>' : '<span class="note-icon">↕</span><span>Imported order is preserved. Use the arrows to reorder, or include <code>lat</code>/<code>lon</code> columns for an approximate distance sort.</span>';
    $('routeStatusDot').className = `route-status-dot ${route.status === 'active' ? 'active' : route.status === 'complete' ? 'complete' : ''}`;
    $('startRouteButton').textContent = route.status === 'complete' ? 'Route completed' : 'Start route';
    $('startRouteButton').disabled = route.status === 'complete';
    // Once a run is under way the explicit Finish route button covers the action.
    $('startRouteButton').hidden = route.status !== 'planned';
    const c = counts(route);
    $('summaryTotal').textContent = c.total;
    $('summaryPending').textContent = `${c.pending} pending`;
    $('summaryServiced').textContent = c.serviced;
    $('summarySkipped').textContent = c.skipped;
    const closed = c.serviced+c.skipped;
    const pct = c.total ? Math.round(closed/c.total*100) : 0;
    $('progressPercent').textContent = `${pct}%`;
    $('progressFill').style.width = `${pct}%`;
    $('progressText').textContent = `${closed} of ${c.total} stops closed`;
    $('filterAllCount').textContent = c.total;
    $('filterPendingCount').textContent = c.pending;
    $('filterServicedCount').textContent = c.serviced;
    $('filterSkippedCount').textContent = c.skipped;
    $('navChoiceLabel').textContent = navName(state.settings.navigation);
    renderStops(route);
    renderNextStop(route);
    const allCoords = route.stops.length > 1 && route.stops.every(hasValidCoordinates);
    $('approxOptimizeButton').disabled = !allCoords || route.stops.length < 3;
    $('approxOptimizeButton').title = allCoords ? 'Approximate order by straight-line distance; not traffic-aware.' : 'Requires latitude and longitude for every stop. This app does not geocode addresses.';
    const finish=$('finishRouteButton');
    if (finish) { finish.hidden = route.status === 'complete' || route.stops.length === 0; }
    const routeNav=$('navigateRouteButton');
    if (routeNav) {
      routeNav.disabled = c.pending === 0;
      const cfg=navProviderConfig();
      routeNav.textContent = cfg.max<=1 ? '↗ Open next stop' : `↗ Open next ${Math.min(cfg.max, c.pending)} pending stops`;
    }
  }
  function navName(value) {
    return ({google:'Google Maps',apple:'Apple Maps',waze:'Waze'})[value] || 'Google Maps';
  }
  function renderStops(route) {
    const q = stopSearch.trim().toLowerCase();
    let rows = route.stops.filter(s => stopFilter === 'all' || s.status === stopFilter);
    if (q) rows = rows.filter(s => `${s.name} ${s.address} ${s.notes} ${s.skipReason}`.toLowerCase().includes(q));
    $('shownStopsLabel').textContent = `Showing ${rows.length} of ${route.stops.length} stops`;
    if (!rows.length) {
      $('stopList').innerHTML = `<div class="stop-list-empty">${route.stops.length ? 'No stops match this filter.' : 'This route has no stops yet.'}</div>`;
      return;
    }
    $('stopList').innerHTML = rows.map(stop => {
      const realIndex = route.stops.findIndex(s => s.id === stop.id);
      const statusClass = stop.status === 'serviced' ? 'serviced' : stop.status === 'skipped' ? 'skipped' : 'pending';
      const statusLabel = stop.status === 'serviced' ? 'Serviced' : stop.status === 'skipped' ? 'Skipped' : 'Pending';
      const time = stop.completedAt ? `<span class="status-time">${esc(timestampLabel(stop.completedAt))}</span>` : '';
      const reason = stop.skipReason ? `<span>Reason: ${esc(stop.skipReason)}</span>` : '';
      const notes = stop.notes ? `<span>Note: ${esc(stop.notes)}</span>` : '';
      let statusActions = '';
      if (stop.status === 'pending') {
        statusActions = `<button class="mini-button served-action" data-action="service" data-id="${esc(stop.id)}" title="Mark serviced">✓ Serviced</button><button class="mini-button skip-action" data-action="skip" data-id="${esc(stop.id)}" title="Mark skipped">↷ Skip</button>`;
      } else {
        statusActions = `<button class="mini-button" data-action="undo" data-id="${esc(stop.id)}" title="Reopen stop">↶ Undo</button>`;
      }
      const navAction = stop.address ? `<button class="mini-button nav-action" data-action="navigate" data-id="${esc(stop.id)}" title="Open navigation">↗ Navigate</button>` : '';
      return `<article class="stop-card ${stop.status === 'serviced' ? 'is-serviced' : stop.status === 'skipped' ? 'is-skipped' : ''}">
        <div class="sequence-badge">${String(realIndex+1).padStart(2,'0')}</div>
        <div class="stop-main"><div class="stop-title-row"><strong class="stop-title">${esc(stop.name || `Stop ${realIndex+1}`)}</strong><span class="status-chip ${statusClass}">${statusLabel}</span></div><div class="stop-address">${esc(stop.address || 'No address entered')}</div>${(time||reason||notes)?`<div class="stop-meta">${time}${reason}${notes}</div>`:''}</div>
        <div class="stop-actions"><button class="mini-button text-only" data-action="up" data-id="${esc(stop.id)}" title="Move stop up" aria-label="Move stop up">↑</button><button class="mini-button text-only" data-action="down" data-id="${esc(stop.id)}" title="Move stop down" aria-label="Move stop down">↓</button><button class="mini-button text-only" data-action="edit" data-id="${esc(stop.id)}" title="Edit stop" aria-label="Edit stop">⋯</button>${navAction}${statusActions}</div>
      </article>`;
    }).join('');
  }
  function renderNextStop(route) {
    const next = route.stops.find(s => s.status === 'pending');
    if (!next) {
      $('nextStopTitle').textContent = route.stops.length ? 'All stops closed' : 'No pending stops';
      $('nextStopAddress').textContent = route.stops.length ? 'Export the service log or reopen a stop if needed.' : 'Add or import a route to see the next stop.';
      $('nextStopNumber').textContent = '✓';
      $('navigateNextButton').disabled = true;
      $('serviceNextButton').disabled = true;
      return;
    }
    const index = route.stops.indexOf(next);
    $('nextStopTitle').textContent = next.name || `Stop ${index+1}`;
    $('nextStopAddress').textContent = next.address || 'No address entered';
    $('nextStopNumber').textContent = String(index+1).padStart(2,'0');
    $('navigateNextButton').disabled = !next.address;
    $('serviceNextButton').disabled = false;
    $('navigateNextButton').dataset.stopId = next.id;
    $('serviceNextButton').dataset.stopId = next.id;
  }
  function routeCard(route) {
    const c = counts(route); const pct = c.total ? Math.round((c.serviced+c.skipped)/c.total*100) : 0;
    const badge = route.status === 'complete' ? 'complete' : route.status === 'active' ? 'active' : 'planned';
    const label = route.status === 'complete' ? 'Complete' : route.status === 'active' ? 'In progress' : 'Planned';
    const fromList = route.templateId ? state.templates.find(t => t.id === route.templateId) : null;
    const source = fromList ? `<span class="list-tag">▦ ${esc(fromList.name)}</span>` : '';
    const restart = route.status === 'complete' ? `<button class="button button-quiet" data-restart-route="${esc(route.id)}">↺ Restart</button>` : '';
    return `<article class="route-list-card" data-open-route="${esc(route.id)}"><div class="route-card-top"><div><span class="badge badge-${badge}">${label}</span><h3>${esc(route.name)}</h3><div class="route-card-meta">${esc(prettyDate(route.date))} · ${esc(route.driver||'Unassigned')} · ${c.total} stops</div>${source}</div><button class="icon-button" data-route-card-menu="${esc(route.id)}" aria-label="Route actions">•••</button></div><div class="route-card-bottom"><div class="route-mini-progress"><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><span>${pct}% closed</span></div><div class="route-card-buttons">${restart}<button class="button button-quiet" data-open-route="${esc(route.id)}">Open route</button><button class="button button-quiet" data-route-card-export="${esc(route.id)}">Export</button></div></div></article>`;
  }
  function routeSection(title, note, routes) {
    const sorted = [...routes].sort((a,b) => (b.date||'').localeCompare(a.date||'') || (b.updatedAt||'').localeCompare(a.updatedAt||''));
    const body = sorted.length
      ? `<div class="routes-grid">${sorted.map(routeCard).join('')}</div>`
      : `<div class="route-section-empty">${esc(note)}</div>`;
    return `<div class="route-section-head"><div><p class="eyebrow">${esc(title)}</p></div><span class="route-section-count">${sorted.length}</span></div>${body}`;
  }
  function renderRoutes() {
    const list = $('routesList'); const empty = $('routesEmpty');
    if (!list) return;
    if (!state.routes.length) { list.innerHTML=''; empty.hidden=false; return; }
    empty.hidden=true;
    const current = state.routes.filter(r => r.status !== 'complete');
    const past = state.routes.filter(r => r.status === 'complete');
    list.innerHTML =
      routeSection('IN PROGRESS & UPCOMING', 'No open runs. Start one from a master list.', current) +
      routeSection('PAST ROUTES', 'Completed runs are kept here for reporting. Restart one to drive the same stops again.', past);
  }
  function renderLibrary() {
    const list = $('libraryList'); const empty = $('libraryEmpty');
    if (!list) return;
    if (!state.templates.length) { list.innerHTML=''; empty.hidden=false; return; }
    empty.hidden=true;
    const sorted = [...state.templates].sort((a,b) => (a.name||'').localeCompare(b.name||''));
    list.innerHTML = sorted.map(t => {
      const runs = state.routes.filter(r => r.templateId === t.id);
      const lastRun = runs.map(r => r.date).sort().pop();
      const openRun = runs.filter(r => r.status !== 'complete').length;
      return `<article class="list-card">
        <div class="list-card-top">
          <div><h3>${esc(t.name)}</h3><div class="list-card-meta">${t.stops.length} stops${t.driver ? ` · ${esc(t.driver)}` : ''}</div></div>
          <span class="list-count">${t.stops.length}</span>
        </div>
        <div class="list-card-foot">
          <span class="list-last">${lastRun ? `Last run ${esc(prettyDate(lastRun))}` : 'Never run yet'}${openRun ? ' · open run' : ''}</span>
          <div class="list-card-buttons">
            <button class="button button-primary" data-start-template="${esc(t.id)}">▶ Start run</button>
            <button class="button button-quiet" data-edit-template="${esc(t.id)}">Edit</button>
            <button class="button button-quiet danger-text" data-delete-template="${esc(t.id)}">Delete</button>
          </div>
        </div>
      </article>`;
    }).join('');
  }
  function renderReports() {
    const routes = [...state.routes].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    const allStops = routes.flatMap(r => r.stops.map(s => ({route:r,stop:s})));
    const serviced = allStops.filter(x=>x.stop.status==='serviced').length;
    const skipped = allStops.filter(x=>x.stop.status==='skipped').length;
    const pending = allStops.filter(x=>x.stop.status==='pending').length;
    $('reportSummary').innerHTML = `<div class="report-summary-card"><span>TOTAL STOPS</span><strong>${allStops.length}</strong></div><div class="report-summary-card"><span>SERVICED</span><strong>${serviced}</strong></div><div class="report-summary-card"><span>SKIPPED / PENDING</span><strong>${skipped} / ${pending}</strong></div>`;
    const q = reportSearch.trim().toLowerCase();
    const filtered = routes.filter(r => !q || `${r.name} ${r.driver} ${r.date} ${r.stops.map(s=>s.address).join(' ')}`.toLowerCase().includes(q));
    $('reportEmpty').hidden = filtered.length > 0;
    $('reportRows').innerHTML = filtered.map(route => {
      const c=counts(route);const status=route.status==='complete'?'complete':route.status==='active'?'active':'planned';const label=route.status==='complete'?'Complete':route.status==='active'?'In progress':'Planned';
      return `<tr><td><div class="table-route-name">${esc(route.name)}</div><div class="table-route-driver">${esc(route.driver||'Unassigned')}</div></td><td>${esc(prettyDate(route.date,{month:'short',day:'numeric',year:'numeric'}))}</td><td>${c.total}</td><td>${c.serviced}</td><td>${c.skipped}</td><td class="table-status"><span class="badge badge-${status}">${label}</span></td><td><button class="mini-button" data-report-export="${esc(route.id)}">CSV</button><button class="mini-button" data-open-route="${esc(route.id)}">Open</button></td></tr>`;
    }).join('');
  }
  function renderSettings() {
    const driver=$('defaultDriverInput'), nav=$('navSelect'), mode=$('navModeSelect'), trip=$('tripStopsSelect');
    if (driver && document.activeElement !== driver) driver.value=state.settings.defaultDriver||'Driver 1';
    if (nav && document.activeElement !== nav) nav.value=state.settings.navigation||'google';
    if (mode && document.activeElement !== mode) mode.value=state.settings.navMode||'app';
    if (trip && document.activeElement !== trip) trip.value=state.settings.tripStops||'auto';
    const version=$('appVersion'); if(version) version.textContent=`RouteDesk V${APP_VERSION}`;
    const tag=$('versionTag'); if(tag) tag.textContent=`V${APP_VERSION}`;
    renderSyncSettings();
  }
  function setActiveRoute(id) {
    if (!state.routes.some(r=>r.id===id)) return;
    state.activeRouteId=id; saveState(); setScreen('today');
  }
  function createRoute({name,driver,date,stops,startAddress='',templateId=null}) {
    const route=normalizeRoute({id:uid(),name:name||'Untitled route',driver:driver||state.settings.defaultDriver||'Driver 1',date:date||todayISO(),startAddress,templateId,status:'planned',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),stops:stops||[]});
    state.routes.unshift(route);state.activeRouteId=route.id;saveState();render();setScreen('today');showToast(`${route.stops.length} stops added to ${route.name}.`);return route;
  }
  function parseAddressLines(text) {
    return String(text||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map((line,i)=>normalizeStop({id:uid(),name:'',address:line,sequence:i+1}));
  }
  function parseCSV(text) {
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(ch==='"'){
        if(quoted && text[i+1]==='"'){cell+='"';i++;}
        else quoted=!quoted;
      } else if(ch===','&&!quoted){row.push(cell);cell='';}
      else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>String(v).trim()!==''))rows.push(row);row=[];cell='';}
      else cell+=ch;
    }
    row.push(cell);if(row.some(v=>String(v).trim()!==''))rows.push(row);
    return rows;
  }
  function normHeader(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');}
  function parseCoordinate(raw,limit){if(raw===null||raw===undefined||String(raw).trim()==='')return null;const value=Number(raw);return Number.isFinite(value)&&Math.abs(value)<=limit?value:null;}
  function csvRowsToStops(rows) {
    if(!rows.length)return [];
    const first=rows[0].map(normHeader);
    const aliases={address:['address','fulladdress','stopaddress','deliveryaddress','location','streetaddress','destination'],name:['name','stopname','customer','client','label','company'],lat:['lat','latitude'],lon:['lon','lng','longitude','long'],notes:['notes','note','instructions','details'],status:['status','outcome'],reason:['skipreason','reason'],completed:['completedat','completedatutc','timestamp','servicedat','visitedat']};
    const findIndex=(keys)=>{for(const k of keys){const i=first.indexOf(k);if(i>=0)return i;}return -1;};
    const addressI=findIndex(aliases.address);const hasHeader=addressI>=0||first.some(v=>['name','stopname','lat','latitude','lon','lng','status'].includes(v));
    const headers=hasHeader?first:null;const data=hasHeader?rows.slice(1):rows;
    const idx=(keys)=>headers?findIndex(keys):-1;
    const iAddress=idx(aliases.address),iName=idx(aliases.name),iLat=idx(aliases.lat),iLon=idx(aliases.lon),iNotes=idx(aliases.notes),iStatus=idx(aliases.status),iReason=idx(aliases.reason),iCompleted=idx(aliases.completed);
    return data.map((r,i)=>{
      const address=hasHeader?(r[iAddress>=0?iAddress:0]||''):(r[0]||'');
      if(!String(address).trim())return null;
      const statusRaw=hasHeader&&iStatus>=0?String(r[iStatus]||'').toLowerCase():'';
      const status=statusRaw.includes('serv')||statusRaw==='done'||statusRaw==='success'?'serviced':statusRaw.includes('skip')||statusRaw.includes('fail')||statusRaw==='cancelled'?'skipped':'pending';
      const latValue=hasHeader&&iLat>=0?parseCoordinate(r[iLat],90):null;const lonValue=hasHeader&&iLon>=0?parseCoordinate(r[iLon],180):null;
      const importedTime=hasHeader&&iCompleted>=0?Date.parse(r[iCompleted]||''):NaN;
      const completedAt=status==='pending'?null:Number.isFinite(importedTime)?new Date(importedTime).toISOString():new Date().toISOString();
      return normalizeStop({id:uid(),name:hasHeader&&iName>=0?r[iName]||'':'',address:String(address).trim(),lat:latValue,lon:lonValue,notes:hasHeader&&iNotes>=0?r[iNotes]||'':'',status,skipReason:hasHeader&&iReason>=0?r[iReason]||'':'',completedAt});
    }).filter(Boolean);
  }
  function csvRouteMetadata(rows,fallbackName){
    if(rows.length<2)return {name:fallbackName||'Imported route',driver:state.settings.defaultDriver,date:todayISO()};
    const headers=rows[0].map(normHeader),values=rows[1];
    const value=(keys)=>{for(const key of keys){const i=headers.indexOf(key);if(i>=0&&String(values[i]||'').trim())return String(values[i]).trim();}return '';};
    const importedName=value(['routename','route']);
    const importedDriver=value(['driver','drivername']);
    const importedDate=value(['routedate','date']);
    const date=/^\d{4}-\d{2}-\d{2}$/.test(importedDate)?importedDate:todayISO();
    return {name:importedName||fallbackName||'Imported route',driver:importedDriver||state.settings.defaultDriver,date};
  }
  let csvTarget = 'run';
  function handleCSVFile(file) {
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const rows=parseCSV(String(reader.result||''));const stops=csvRowsToStops(rows);
        if(!stops.length){showToast('No addresses found. Add an address column or one address per row.');return;}
        const base=file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim();
        const meta=csvRouteMetadata(rows,base);
        if(csvTarget==='library'){
          const {template,updated}=upsertTemplate({name:meta.name||base,driver:meta.driver,stops});
          saveState();render();setScreen('library');
          showToast(updated?`Updated master list "${template.name}" — ${template.stops.length} stops.`:`Master list "${template.name}" saved — ${template.stops.length} stops.`);
          csvTarget='run';
          return;
        }
        // A run started from an upload also saves the list, so it can be reused
        // without uploading the spreadsheet again.
        const {template,updated}=upsertTemplate({name:meta.name||base,driver:meta.driver,stops});
        createRoute({...meta,templateId:template.id,stops});
        showToast(updated?`Route created. Master list "${template.name}" refreshed for reuse.`:`Route created. Saved "${template.name}" to master lists for reuse.`);
        csvTarget='run';
      }catch(err){console.error(err);showToast('Could not read that CSV file.');csvTarget='run';}
    };
    reader.onerror=()=>{showToast('The file could not be opened.');csvTarget='run';};reader.readAsText(file);
  }
  function openRouteDialog() {
    $('routeNameInput').value='';$('routeDriverInput').value=state.settings.defaultDriver||'Driver 1';$('routeDateInput').value=todayISO();$('routeStopsInput').value='';openDialog('routeDialog');
  }
  function openStopDialog(stop=null) {
    editingStopId=stop?stop.id:null;
    $('stopDialogEyebrow').textContent=stop?'EDIT STOP':'ADD STOP';$('stopDialogTitle').textContent=stop?'Edit stop':'Add a stop';
    $('stopNameInput').value=stop?.name||'';$('stopAddressInput').value=stop?.address||'';$('stopLatInput').value=stop?.lat??'';$('stopLonInput').value=stop?.lon??'';$('stopNotesInput').value=stop?.notes||'';
    openDialog('stopDialog');
  }
  function openSkipDialog(stop) {
    skipTargetId=stop.id;$('skipStopAddress').textContent=stop.name?`${stop.name} — ${stop.address}`:stop.address;
    $('skipReasonInput').value=stop.skipReason||'';$('skipNotesInput').value=stop.notes||'';openDialog('skipDialog');
  }
  function saveStopForm(event) {
    event.preventDefault();const route=getActiveRoute();if(!route)return;
    const lat=parseCoordinate($('stopLatInput').value,90),lon=parseCoordinate($('stopLonInput').value,180);
    const stopData={name:$('stopNameInput').value.trim(),address:$('stopAddressInput').value.trim(),lat,lon,notes:$('stopNotesInput').value.trim()};
    if(editingStopId){const stop=route.stops.find(s=>s.id===editingStopId);if(stop)Object.assign(stop,stopData);}
    else route.stops.push(normalizeStop(Object.assign({id:uid()},stopData)));
    route.updatedAt=new Date().toISOString();saveState();closeDialog('stopDialog');render();showToast(editingStopId?'Stop updated.':'Stop added.');editingStopId=null;
  }
  function changeStopStatus(stopId,status,extra={}) {
    const route=getActiveRoute();if(!route)return;const stop=route.stops.find(s=>s.id===stopId);if(!stop)return;
    stop.status=status;stop.completedAt=status==='pending'?null:new Date().toISOString();
    if(status==='skipped'){stop.skipReason=extra.reason||'';if(extra.notes!==undefined)stop.notes=extra.notes;}
    if(status==='serviced'||status==='pending')stop.skipReason='';
    route.updatedAt=new Date().toISOString();
    if(status==='pending'&&route.status==='complete'){route.status='active';route.completedAt=null;}
    if(status!=='pending'&&route.status==='planned')route.status='active';
    const c=counts(route);if(c.total>0&&c.pending===0&&route.status!=='complete')route.status='active';
    saveState();render();showToast(status==='serviced'?'Stop marked serviced.':status==='skipped'?'Skip recorded.':'Stop reopened.');
  }
  function startOrCompleteRoute() {
    const route=getActiveRoute();if(!route)return;const c=counts(route);
    if(route.status==='complete')return;
    if(c.total>0&&c.pending===0){openCompleteDialog();return;}
    route.status='active';route.startedAt=route.startedAt||new Date().toISOString();
    route.updatedAt=new Date().toISOString();saveState();render();showToast('Route started.');
  }
  function openCompleteDialog() {
    const route=getActiveRoute();if(!route)return;
    const c=counts(route);
    const summary=$('completeSummary');
    if(summary)summary.textContent=`${route.name} — ${c.serviced} serviced, ${c.skipped} skipped, ${c.pending} still pending.`;
    openDialog('completeDialog');
  }
  function freshRunFrom(route) {
    const copy=normalizeRoute({
      id:uid(),name:route.name,driver:route.driver,date:todayISO(),
      templateId:route.templateId||null,status:'planned',orderMethod:'',
      stops:route.stops.map(s=>normalizeStop({id:uid(),name:s.name,address:s.address,lat:s.lat,lon:s.lon,notes:s.notes,status:'pending',completedAt:null,skipReason:''}))
    });
    state.routes.unshift(copy);
    if(copy.templateId){const t=state.templates.find(x=>x.id===copy.templateId);if(t)t.lastRunAt=new Date().toISOString();}
    return copy;
  }
  function finishRoute(mode) {
    const route=getActiveRoute();if(!route)return;
    const now=new Date().toISOString();
    route.status='complete';route.completedAt=now;route.updatedAt=now;
    const submitted=route;
    closeDialog('completeDialog');
    // Automatic hand-off to the manager portal (queued when offline).
    submitCompletedRun(submitted);
    if(mode==='restart'){
      const next=freshRunFrom(route);
      state.activeRouteId=next.id;saveState();render();setScreen('today');
      showToast('Run archived to past routes. A fresh run is ready.');
      return;
    }
    const open=state.routes.filter(r=>r.status!=='complete');
    state.activeRouteId=open.length?open[0].id:null;
    saveState();render();setScreen('routes');
    showToast('Run archived to past routes. Its service log is unchanged.');
  }
  function restartRoute(routeId) {
    const route=getRoute(routeId);if(!route)return;
    const next=freshRunFrom(route);
    state.activeRouteId=next.id;saveState();render();setScreen('today');
    showToast('Restarted. Previous run is kept in past routes.');
  }
  function moveStop(stopId,delta) {
    const route=getActiveRoute();if(!route)return;const i=route.stops.findIndex(s=>s.id===stopId);const j=i+delta;if(i<0||j<0||j>=route.stops.length)return;
    [route.stops[i],route.stops[j]]=[route.stops[j],route.stops[i]];route.orderMethod='Manual reorder';route.updatedAt=new Date().toISOString();saveState();render();
  }
  function isFiniteCoord(v, limit=180){return v!==null&&v!==''&&Number.isFinite(Number(v))&&Math.abs(Number(v))<=limit;}
  function hasValidCoordinates(stop){return isFiniteCoord(stop.lat,90)&&isFiniteCoord(stop.lon,180);}
  function dist(a,b){const rad=x=>x*Math.PI/180;const lat1=rad(Number(a.lat)),lat2=rad(Number(b.lat)),dLat=lat2-lat1,dLon=rad(Number(b.lon)-Number(a.lon));const z=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;return 6371*2*Math.asin(Math.sqrt(z));}
  function routeDistance(points){let total=0;for(let i=1;i<points.length;i++)total+=dist(points[i-1],points[i]);return total;}
  function optimizeApproximate() {
    const route=getActiveRoute();if(!route)return;const points=route.stops.filter(hasValidCoordinates);if(points.length!==route.stops.length||points.length<3){showToast('Add valid lat/lon columns for every stop before using approximate order.');return;}
    const remaining=[...points];const ordered=[remaining.shift()];
    while(remaining.length){let best=0,bestD=Infinity;for(let i=0;i<remaining.length;i++){const d=dist(ordered[ordered.length-1],remaining[i]);if(d<bestD){bestD=d;best=i;}}ordered.push(remaining.splice(best,1)[0]);}
    let improved=true,pass=0;
    while(improved&&pass<8){improved=false;pass++;for(let i=1;i<ordered.length-1;i++){for(let k=i+1;k<ordered.length;k++){const before=dist(ordered[i-1],ordered[i])+(k+1<ordered.length?dist(ordered[k],ordered[k+1]):0);const after=dist(ordered[i-1],ordered[k])+(k+1<ordered.length?dist(ordered[i],ordered[k+1]):0);if(after+0.01<before){const reversed=ordered.slice(i,k+1).reverse();ordered.splice(i,k-i+1,...reversed);improved=true;}}}}
    route.stops=ordered.concat(route.stops.filter(s=>!hasValidCoordinates(s)));route.updatedAt=new Date().toISOString();route.orderMethod='Approximate straight-line distance';saveState();render();showToast('Approximate distance order created. It is not road-time or traffic optimization.');
  }
  function navUrl(stop) {
    const destination=stop.lat!==null&&stop.lon!==null?`${stop.lat},${stop.lon}`:stop.address;
    const encoded=encodeURIComponent(destination);
    switch(state.settings.navigation){
      case 'apple': return `https://maps.apple.com/?daddr=${encoded}&dirflg=d`;
      case 'waze': return `https://waze.com/ul?q=${encoded}&navigate=yes`;
      default: return `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`;
    }
  }
  async function copyText(text, message) {
    try { await navigator.clipboard.writeText(text); showToast(message); return; }
    catch (_) {}
    const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();
    try { document.execCommand('copy'); showToast(message); } catch (_) { showToast('Could not copy automatically. Select the address to copy it.'); }
    ta.remove();
  }
  // Each map app accepts a limited number of stops per link, so a long route is
  // driven in groups. Google documents 3 waypoints in mobile browsers (four
  // points including the destination). Apple Maps joins repeated daddr values
  // into one comma-separated destination, so it only takes a single stop, and
  // Waze likewise takes one. Both therefore navigate stop by stop.
  function navProviderConfig() {
    const provider = state.settings.navigation || 'google';
    const ceiling = { google: 4, apple: 1, waze: 1 }[provider] || 4;
    let max = ceiling;
    const pref = state.settings.tripStops || 'auto';
    if (pref !== 'auto') { const n = parseInt(pref, 10); if (n > 0) max = Math.min(ceiling, n); }
    return { provider, max };
  }
  function stopTarget(stop) {
    return (stop.lat !== null && stop.lon !== null && stop.lat !== '' && stop.lon !== '') ? `${stop.lat},${stop.lon}` : stop.address;
  }
  function routeNavUrl(stops) {
    const { provider, max } = navProviderConfig();
    let chunk = stops.slice(0, max);
    if (!chunk.length) return null;
    if (provider === 'waze') {
      return { url: `https://waze.com/ul?q=${encodeURIComponent(stopTarget(chunk[0]))}&navigate=yes`, count: 1, total: stops.length };
    }
    if (provider === 'apple') {
      let parts = chunk.map(s => `daddr=${encodeURIComponent(stopTarget(s))}`);
      const build = () => `https://maps.apple.com/?${parts.join('&')}&dirflg=d`;
      while (build().length > 1900 && parts.length > 1) parts.pop();
      return { url: build(), count: parts.length, total: stops.length };
    }
    let waypoints = chunk.slice(0, -1);
    const destination = chunk[chunk.length - 1];
    const build = () => {
      const base = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stopTarget(destination))}&travelmode=driving`;
      return waypoints.length ? `${base}&waypoints=${waypoints.map(s => encodeURIComponent(stopTarget(s))).join('%7C')}` : base;
    };
    while (build().length > 1900 && waypoints.length > 1) waypoints.pop();
    return { url: build(), count: waypoints.length + 1, total: stops.length };
  }
  function openNavigation(stopId) {
    const route=getActiveRoute();const stop=route?.stops.find(s=>s.id===stopId);if(!stop||!stop.address){showToast('Add an address before opening navigation.');return;}
    if(/demo only|replace before navigation/i.test(stop.address)){showToast('Replace this demo address before navigating.');return;}
    if(state.settings.navMode==='copy'){copyText(stop.address,'Address copied. Paste it into your navigation app.');return;}
    const win=window.open(navUrl(stop),'_blank','noopener,noreferrer');if(!win)showToast('Navigation link is ready. Allow pop-ups to open it.');
  }
  function openNextStops() {
    const route=getActiveRoute();if(!route)return;
    const pending=route.stops.filter(s=>s.status==='pending'&&s.address&&!/demo only|replace before navigation/i.test(s.address));
    if(!pending.length){showToast('No pending stops with an address to navigate.');return;}
    if(state.settings.navMode==='copy'){
      copyText(pending.slice(0,5).map(s=>s.address).join('\n'),'Next addresses copied. Paste them into your navigation app.');
      return;
    }
    const trip=routeNavUrl(pending);
    if(!trip){showToast('Nothing to navigate yet.');return;}
    const win=window.open(trip.url,'_blank','noopener,noreferrer');
    if(!win){showToast('Navigation link is ready. Allow pop-ups to open it.');return;}
    if(trip.total>trip.count)showToast(`Opening ${trip.count} of ${trip.total} pending stops in ${navName(state.settings.navigation)}. Tap again after you finish this group.`);
    else showToast(`Opening ${trip.count} stop${trip.count===1?'':'s'} in ${navName(state.settings.navigation)}.`);
  }
  function openWholeRoute() {
    const route=getActiveRoute();if(!route)return;
    const pending=route.stops.filter(s=>s.status==='pending'&&s.address);
    if(!pending.length){showToast('Every stop is already closed.');return;}
    if(state.settings.navMode==='copy'){copyText(route.stops.map(s=>s.address).filter(Boolean).join('\n'),'Full stop list copied.');return;}
    const trip=routeNavUrl(pending);
    const win=window.open(trip.url,'_blank','noopener,noreferrer');
    if(!win)showToast('Navigation link is ready. Allow pop-ups to open it.');
    else if(trip.total>trip.count)showToast(`${navName(state.settings.navigation)} accepts ${trip.count} stops per trip. Sent the next ${trip.count}; ${trip.total-trip.count} still pending.`);
  }
  function routeToCSV(route) {
    const headers=['route_name','route_date','driver','sequence','stop_name','address','latitude','longitude','status','completed_at','skip_reason','notes'];
    const rows=[headers,...route.stops.map((s,i)=>[route.name,route.date,route.driver,i+1,s.name,s.address,s.lat??'',s.lon??'',s.status,s.completedAt||'',s.skipReason||'',s.notes||''])];
    return '\ufeff'+rows.map(row=>row.map(csvEscape).join(',')).join('\r\n');
  }
  function csvEscape(value){const s=String(value??'');return /[",\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
  function downloadText(filename,text,type='text/plain;charset=utf-8') {
    const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function safeFileName(name){return String(name||'route').normalize('NFKD').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'route';}
  function routePackage(route) { return {app:'RouteDesk',version:APP_VERSION,exportedAt:new Date().toISOString(),route:JSON.parse(JSON.stringify(route))}; }
  async function shareRoute(route=getActiveRoute()) {
    if(!route){showToast('Create a route first.');return;}
    const filename=`${safeFileName(route.name)}-route.json`;const text=JSON.stringify(routePackage(route),null,2);
    try{
      const file=new File([text],filename,{type:'application/json'});
      if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({title:`Route: ${route.name}`,text:'Route package from RouteDesk',files:[file]});return;}
    }catch(err){if(err.name==='AbortError')return;}
    downloadText(filename,text,'application/json');showToast('Route package downloaded. Share it with your driver using company-approved storage.');
  }
  function exportRouteCSV(route=getActiveRoute()) {if(!route)return;downloadText(`${safeFileName(route.name)}-service-log.csv`,routeToCSV(route),'text/csv;charset=utf-8');showToast('Service log downloaded as CSV.');}
  function exportAllCSV() {
    const headers=['route_name','route_date','driver','sequence','stop_name','address','latitude','longitude','status','completed_at','skip_reason','notes'];
    const rows=[headers];state.routes.forEach(r=>r.stops.forEach((s,i)=>rows.push([r.name,r.date,r.driver,i+1,s.name,s.address,s.lat??'',s.lon??'',s.status,s.completedAt||'',s.skipReason||'',s.notes||''])));
    if(rows.length===1){showToast('No stops to export yet.');return;}downloadText(`routedesk-service-log-${todayISO()}.csv`,'\ufeff'+rows.map(r=>r.map(csvEscape).join(',')).join('\r\n'),'text/csv;charset=utf-8');showToast('All service logs downloaded.');
  }
  function importPackageFile(file) {
    if(!file)return;const reader=new FileReader();reader.onload=()=>{
      try{const data=JSON.parse(String(reader.result||''));const imported=data.route||data;if(!imported||!Array.isArray(imported.stops))throw new Error('Not a RouteDesk route package');const route=normalizeRoute(imported);const existing=state.routes.findIndex(r=>r.id===route.id);if(existing>=0){state.routes[existing]=route;showToast('Route package merged by replacing the saved route.');}else{state.routes.unshift(route);showToast('Route package imported.');}state.activeRouteId=route.id;route.updatedAt=new Date().toISOString();saveState();setScreen('today');}catch(err){console.error(err);showToast('That file is not a RouteDesk route package. Import a CSV route list instead.');}
    };reader.onerror=()=>showToast('Could not read that package.');reader.readAsText(file);
  }
  function exportWorkspace() {
    const content=JSON.stringify({app:'RouteDesk',version:APP_VERSION,exportedAt:new Date().toISOString(),workspace:state},null,2);
    downloadText(`routedesk-backup-${todayISO()}.json`,content,'application/json');showToast('Workspace backup downloaded.');
  }
  function importWorkspace(file) {
    if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(String(reader.result||''));const incoming=data.workspace||data;if(!Array.isArray(incoming.routes))throw new Error('bad workspace');state={...freshState(),...incoming,settings:{...freshState().settings,...incoming.settings}};state.routes=state.routes.map(normalizeRoute);saveState();render();showToast('Workspace backup restored.');}catch(err){showToast('That file is not a RouteDesk workspace backup.');}};reader.readAsText(file);
  }
  function deleteRoute(routeId) {
    const route=state.routes.find(r=>r.id===routeId);if(!route)return;
    if(!window.confirm(`Delete “${route.name}” from this browser? Export a copy first if you need it.`))return;
    state.routes=state.routes.filter(r=>r.id!==routeId);if(state.activeRouteId===routeId)state.activeRouteId=state.routes[0]?.id||null;saveState();render();showToast('Route deleted from this device.');
  }
  function duplicateRoute(route) {
    const copy=JSON.parse(JSON.stringify(route));copy.id=uid();copy.name=`${route.name} (copy)`;copy.date=todayISO();copy.status='planned';copy.createdAt=new Date().toISOString();copy.updatedAt=new Date().toISOString();copy.completedAt=null;copy.startedAt=null;copy.stops=copy.stops.map(s=>({...s,id:uid(),status:'pending',completedAt:null,skipReason:''}));state.routes.unshift(copy);state.activeRouteId=copy.id;saveState();render();setScreen('today');showToast('Route duplicated; stop statuses were reset.');
  }
  function loadDemoRoute() {
    const stops=[
      {name:'Sample stop 01',address:'DEMO ONLY — replace before navigation',notes:'This is a sample route row.'},
      {name:'Sample stop 02',address:'DEMO ONLY — replace before navigation'},
      {name:'Sample stop 03',address:'DEMO ONLY — replace before navigation'},
      {name:'Sample stop 04',address:'DEMO ONLY — replace before navigation'},
      {name:'Sample stop 05',address:'DEMO ONLY — replace before navigation'}
    ].map(s=>normalizeStop({...s,id:uid()}));
    createRoute({name:'Demo route — replace with your list',driver:state.settings.defaultDriver,date:todayISO(),stops});
  }
  // ------------------------------------------------------------------
  // Cloud sync: a finished run is submitted to the owner's Supabase
  // project automatically, so the manager reviews it in Completed jobs
  // instead of collecting spreadsheets.
  // ------------------------------------------------------------------
  let cloudRuns = null;          // last successful fetch for the manager view
  let cloudStatus = 'idle';      // idle | syncing | error | off
  let cloudError = '';

  // The setup SQL is embedded so a manager can wire up the portal from the app
  // itself, without opening the repository. Keep in step with supabase/schema.sql.
  const SETUP_SQL = `create table if not exists public.completed_runs (
  id           text primary key,
  team_id      text not null,
  name         text not null default 'Untitled route',
  route_date   date,
  driver       text,
  completed_at timestamptz not null default now(),
  stop_count   int  not null default 0,
  serviced     int  not null default 0,
  skipped      int  not null default 0,
  device       text,
  stops        jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists completed_runs_team_time
  on public.completed_runs (team_id, completed_at desc);

alter table public.completed_runs add column if not exists review_note text not null default '';
alter table public.completed_runs add column if not exists reviewed_at timestamptz;
alter table public.completed_runs add column if not exists reviewed_by text not null default '';

alter table public.completed_runs enable row level security;

drop policy if exists "team can read its completed runs" on public.completed_runs;
create policy "team can read its completed runs"
  on public.completed_runs for select to anon
  using (team_id = coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-team-code', ''));

drop policy if exists "team can submit completed runs" on public.completed_runs;
create policy "team can submit completed runs"
  on public.completed_runs for insert to anon
  with check (team_id = coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-team-code', ''));

drop policy if exists "team can resubmit completed runs" on public.completed_runs;
create policy "team can resubmit completed runs"
  on public.completed_runs for update to anon
  using (team_id = coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-team-code', ''))
  with check (team_id = coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-team-code', ''));

grant select, insert, update on public.completed_runs to anon;`;

  function syncConfig() {
    const cfg = state.settings.sync || {};
    return { url: String(cfg.url || '').trim().replace(/\/+$/, ''), anonKey: String(cfg.anonKey || '').trim(), teamCode: String(cfg.teamCode || '').trim(), device: String(cfg.device || '').trim(), autoSubmit: cfg.autoSubmit !== false };
  }
  function syncReady() {
    const c = syncConfig();
    return !!(c.url && c.anonKey && c.teamCode);
  }
  function syncHeaders() {
    const c = syncConfig();
    return {
      'apikey': c.anonKey,
      'Authorization': `Bearer ${c.anonKey}`,
      'Content-Type': 'application/json',
      'X-Team-Code': c.teamCode
    };
  }
  function readOutbox() {
    try { const raw = localStorage.getItem(OUTBOX_KEY); const list = raw ? JSON.parse(raw) : []; return Array.isArray(list) ? list : []; }
    catch (_) { return []; }
  }
  function writeOutbox(list) {
    try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(list)); } catch (_) {}
    renderSyncBadge();
  }
  function queueRun(route) {
    const list = readOutbox().filter(item => item.payload.id !== route.id);
    list.push({ payload: completedRunPayload(route), queuedAt: new Date().toISOString(), attempts: 0, lastError: '' });
    writeOutbox(list);
    return list.length;
  }
  function completedRunPayload(route) {
    const c = counts(route);
    const cfg = syncConfig();
    return {
      id: route.id,
      team_id: cfg.teamCode,
      name: route.name || 'Untitled route',
      route_date: route.date || todayISO(),
      driver: route.driver || '',
      completed_at: route.completedAt || new Date().toISOString(),
      stop_count: c.total,
      serviced: c.serviced,
      skipped: c.skipped,
      device: cfg.device || route.driver || '',
      stops: route.stops.map((s, i) => ({
        sequence: i + 1, name: s.name || '', address: s.address || '',
        lat: s.lat ?? null, lon: s.lon ?? null, status: s.status,
        completed_at: s.completedAt || null, skip_reason: s.skipReason || '', notes: s.notes || ''
      }))
    };
  }
  // Uploads run immediately when possible. Anything that fails stays in the
  // outbox and is retried on the next load, focus, or return to connectivity, so
  // a driver finishing in a dead zone loses nothing.
  async function flushOutbox(options = {}) {
    extract:
    if (!syncReady()) return { sent: 0, pending: readOutbox().length, reason: 'not-configured' };
    const list = readOutbox();
    if (!list.length) { if (!options.quiet) renderSyncBadge(); return { sent: 0, pending: 0 }; }
    cloudStatus = 'syncing'; renderSyncBadge();
    let sent = 0;
    const remaining = [];
    for (const item of list) {
      try {
        const res = await fetch(`${syncConfig().url}/rest/v1/completed_runs?on_conflict=id`, {
          method: 'POST',
          headers: Object.assign(syncHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=representation' }),
          body: JSON.stringify([item.payload])
        });
        if (!res.ok) throw new Error(describeSyncError(res.status, await res.text()));
        sent++;
      } catch (err) {
        item.attempts = (item.attempts || 0) + 1;
        item.lastError = String(err.message || err).slice(0, 200);
        remaining.push(item);
      }
    }
    writeOutbox(remaining);
    cloudStatus = remaining.length ? 'error' : 'idle';
    cloudError = remaining.length ? remaining[0].lastError : '';
    renderSyncBadge();
    if (sent && !options.quiet) showToast(`Submitted ${sent} completed run${sent === 1 ? '' : 's'} to the manager portal.`);
    return { sent, pending: remaining.length };
  }
  function submitCompletedRun(route) {
    if (!syncReady() || !syncConfig().autoSubmit) return;
    queueRun(route);
    renderSyncBadge();
    flushOutbox({ quiet: false });
  }
  async function fetchCompletedRuns(options = {}) {
    if (!syncReady()) { cloudStatus = 'off'; cloudRuns = []; renderCompletedJobs(); return []; }
    cloudStatus = 'syncing'; renderSyncBadge();
    try {
      const c = syncConfig();
      const res = await fetch(`${c.url}/rest/v1/completed_runs?select=*&team_id=eq.${encodeURIComponent(c.teamCode)}&order=completed_at.desc&limit=500`, { headers: syncHeaders() });
      if (!res.ok) throw new Error(describeSyncError(res.status, await res.text()));
      cloudRuns = await res.json();
      cloudStatus = 'idle'; cloudError = '';
    } catch (err) {
      cloudStatus = 'error'; cloudError = String(err.message || err).slice(0, 200); cloudRuns = null;
    }
    renderSyncBadge();
    renderCompletedJobs();
    if (!options.quiet && cloudStatus === 'error') showToast('Could not reach the manager portal. Check the sync settings.');
    return cloudRuns || [];
  }
  function cloudRunToRoute(row) {
    return normalizeRoute({
      id: row.id, name: row.name, date: row.route_date, driver: row.driver, status: 'complete',
      completedAt: row.completed_at, updatedAt: row.completed_at,
      stops: (row.stops || []).map(s => normalizeStop({
        id: uid(), name: s.name, address: s.address, lat: s.lat, lon: s.lon,
        notes: s.notes, status: s.status, completedAt: s.completed_at, skipReason: s.skip_reason
      }))
    });
  }
  function renderSyncBadge() {
    const badge = $('syncBadge');
    if (!badge) return;
    const pending = readOutbox().length;
    let label, tone;
    if (!syncReady()) { label = 'Cloud off'; tone = 'off'; }
    else if (cloudStatus === 'syncing') { label = 'Syncing…'; tone = 'busy'; }
    else if (pending) { label = `${pending} to submit`; tone = 'pending'; }
    else if (cloudStatus === 'error') { label = 'Sync error'; tone = 'error'; }
    else { label = 'Cloud synced'; tone = 'ok'; }
    badge.textContent = label;
    badge.className = `sync-badge ${tone}`;
    badge.title = syncReady() ? (cloudError || `Team ${syncConfig().teamCode.slice(0, 4)}… · ${pending} queued`) : 'Add your Supabase project to submit completed jobs automatically.';
    const pill = $('localPill');
    if (pill) pill.textContent = syncReady() ? 'Cloud workspace' : 'Local workspace';
    const mirror = $('syncBadgeSettings');
    if (mirror) { mirror.textContent = label; mirror.className = `sync-badge ${tone}`; }
    const head = $('storageHeadline'), sub = $('storageSubline');
    if (head && sub) {
      if (syncReady()) { head.textContent = 'Saved locally + submitted'; sub.textContent = 'Completed runs go to your portal'; }
      else { head.textContent = 'Saved on this device'; sub.textContent = 'No subscription or account'; }
    }
  }
  // Turn PostgREST failures into something a non-developer can act on.
  function describeSyncError(status, body) {
    const text = String(body || '');
    if (status === 404 || /PGRST205|relation .* does not exist/i.test(text)) {
      return 'The completed_runs table is missing. Copy the setup SQL from this screen and run it in your Supabase SQL Editor.';
    }
    if (/PGRST204|42703|column .* does not exist/i.test(text)) {
      return 'Your table is out of date. Re-run the setup SQL so the manager review columns are added.';
    }
    if (status === 401 || /invalid api key|JWT/i.test(text)) {
      return 'That anon key was rejected. Copy it again from Project Settings → API → anon public.';
    }
    if (status === 403 || /row-level security|42501/i.test(text)) {
      return 'Blocked by a security rule. Check the team code matches on every device and that the setup SQL ran.';
    }
    if (!navigator.onLine) return 'This device is offline. Runs stay queued until it reconnects.';
    return text.slice(0, 180) || `Request failed (${status}).`;
  }
  async function copySetupSql() {
    copyText(SETUP_SQL, 'Setup SQL copied. Paste it into your Supabase SQL Editor and run it.');
  }
  function saveReviewNote(runId) {
    const row = (cloudRuns || []).find(r => r.id === runId);
    if (!row) return;
    const field = $('reviewNoteInput');
    const note = field ? field.value.trim() : '';
    const who = syncConfig().device || state.settings.defaultDriver || 'Manager';
    row.review_note = note;
    row.reviewed_at = new Date().toISOString();
    row.reviewed_by = who;
    renderCompletedJobs();
    closeDialog('reviewDialog');
    // Manager notes are written straight back to the row; a driver resubmitting
    // the same run does not send these fields, so a note is never clobbered.
    const patch = async () => {
      const c = syncConfig();
      const res = await fetch(`${c.url}/rest/v1/completed_runs?id=eq.${encodeURIComponent(runId)}`, {
        method: 'PATCH',
        headers: Object.assign(syncHeaders(), { 'Prefer': 'return=minimal' }),
        body: JSON.stringify({ review_note: note, reviewed_at: row.reviewed_at, reviewed_by: who })
      });
      if (!res.ok) throw new Error(describeSyncError(res.status, await res.text()));
      return true;
    };
    patch().then(() => { showToast(note ? 'Review note saved.' : 'Review note cleared.'); fetchCompletedRuns({ quiet: true }); })
      .catch(err => { showToast(`Note kept on this device only — ${err.message}`); });
  }
  function renderCompletedJobs() {
    const list = $('completedList'); if (!list) return;
    const empty = $('completedEmpty'); const setup = $('completedSetup');
    if (!syncReady()) {
      list.innerHTML = ''; empty.hidden = true; setup.hidden = false;
      const note = $('completedQueueNote');
      if (note) note.hidden = readOutbox().length === 0;
      return;
    }
    setup.hidden = true;
    const q = (state.ui && state.ui.completedSearch || '').trim().toLowerCase();
    let rows = cloudRuns || [];
    if (q) rows = rows.filter(r => `${r.name} ${r.driver} ${r.route_date} ${(r.stops || []).map(s => s.address).join(' ')}`.toLowerCase().includes(q));
    if (cloudRuns === null) {
      // Show the specific, actionable reason (missing table, bad key, wrong team
      // code) rather than a generic failure line.
      list.innerHTML = `<div class="sync-problem"><strong>Could not load completed jobs.</strong><p>${esc(cloudError || 'Check the sync settings and retry.')}</p><button class="button button-secondary" data-retry-sync="1" type="button">Retry</button></div>`;
      empty.hidden = true;
      return;
    }
    if (!rows.length) { list.innerHTML = ''; empty.hidden = false; }
    else {
      empty.hidden = true;
      list.innerHTML = `<div class="table-scroll"><table class="report-table"><thead><tr><th>ROUTE</th><th>COMPLETED</th><th>DRIVER</th><th>STOPS</th><th>SERV</th><th>SKIP</th><th></th></tr></thead><tbody>${rows.map(r => `
        <tr><td><div class="table-route-name">${esc(r.name)}</div><div class="table-route-driver">${esc(r.device || '')}${r.review_note || r.reviewed_at ? ' · <span class="noted-chip">✓ noted</span>' : ''}</div></td>
        <td>${esc(prettyDate((r.completed_at || '').slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' }))}</td>
        <td>${esc(r.driver || '—')}</td><td>${esc(r.stop_count)}</td><td>${esc(r.serviced)}</td><td>${esc(r.skipped)}</td>
        <td class="nowrap"><button class="mini-button" data-review-run="${esc(r.id)}">Review</button><button class="mini-button" data-cloud-csv="${esc(r.id)}">CSV</button></td></tr>`).join('')}</tbody></table></div>`;
    }
    const note = $('completedQueueNote');
    if (note) note.hidden = readOutbox().length === 0;
  }
  function openReview(runId) {
    const row = (cloudRuns || []).find(r => r.id === runId);
    if (!row) return;
    const route = cloudRunToRoute(row);
    const c = counts(route);
    $('reviewTitle').textContent = route.name;
    $('reviewMeta').textContent = `${prettyDate(route.date)} · ${route.driver || 'Unassigned'} · ${c.total} stops · completed ${new Date(row.completed_at).toLocaleString()}`;
    $('reviewBody').innerHTML = route.stops.map((s, i) => `
      <div class="review-stop ${esc(s.status)}">
        <span class="sequence-badge">${String(i + 1).padStart(2, '0')}</span>
        <div><strong>${esc(s.name || s.address || 'Stop')}</strong><div class="review-address">${esc(s.address)}</div>
        ${s.skipReason ? `<div class="review-note">Reason: ${esc(s.skipReason)}</div>` : ''}
        ${s.notes ? `<div class="review-note">Note: ${esc(s.notes)}</div>` : ''}</div>
        <span class="status-chip ${esc(s.status)}">${esc(s.status)}</span>
      </div>`).join('');
    const noteField = $('reviewNoteInput');
    if (noteField) noteField.value = row.review_note || '';
    const reviewed = $('reviewReviewedLine');
    if (reviewed) reviewed.textContent = row.reviewed_at ? `Last reviewed ${new Date(row.reviewed_at).toLocaleString()} by ${row.reviewed_by || 'manager'}` : 'Not reviewed yet.';
    const saveBtn = $('saveReviewButton'); if (saveBtn) saveBtn.dataset.reviewSave = row.id;
    openDialog('reviewDialog');
  }
  function downloadCloudRunCSV(runId) {
    const row = (cloudRuns || []).find(r => r.id === runId);
    if (row) exportRouteCSV(cloudRunToRoute(row));
  }
  function downloadAllCloudCSV() {
    const rows = cloudRuns || [];
    if (!rows.length) { showToast('No completed jobs to export yet.'); return; }
    const headers = ['route_name', 'route_date', 'driver', 'sequence', 'stop_name', 'address', 'latitude', 'longitude', 'status', 'completed_at', 'skip_reason', 'notes', 'device', 'manager_review_note', 'reviewed_at', 'reviewed_by'];
    const out = [headers];
    rows.forEach(r => (r.stops || []).forEach(s => out.push([r.name, r.route_date, r.driver, s.sequence, s.name, s.address, s.lat ?? '', s.lon ?? '', s.status, s.completed_at || '', s.skip_reason || '', s.notes || '', r.device || '', r.review_note || '', r.reviewed_at || '', r.reviewed_by || ''])));
    downloadText(`routedesk-completed-jobs-${todayISO()}.csv`, '\ufeff' + out.map(r => r.map(csvEscape).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
    showToast(`Exported ${rows.length} completed jobs.`);
  }
  async function testSync() {
    saveSyncSettings();
    if (!syncReady()) { showToast('Fill in the project URL, anon key, and team code first.'); return; }
    const btn = $('testSyncButton'); if (btn) { btn.disabled = true; btn.textContent = 'Testing…'; }
    const result = await flushOutbox({ quiet: true });
    await fetchCompletedRuns({ quiet: true });
    if (btn) { btn.disabled = false; btn.textContent = 'Test connection'; }
    if (cloudStatus === 'error') showToast(`Connection failed: ${cloudError}`);
    else showToast(`Connected. ${(cloudRuns || []).length} completed job${(cloudRuns || []).length === 1 ? '' : 's'} visible${result.pending ? ` · ${result.pending} still queued` : ''}.`);
  }
  function saveSyncSettings() {
    const before = syncConfig();
    state.settings.sync = {
      url: $('syncUrlInput').value.trim(), anonKey: $('syncKeyInput').value.trim(),
      teamCode: $('syncTeamInput').value.trim(), device: $('syncDeviceInput').value.trim(),
      autoSubmit: $('syncAutoInput').checked
    };
    const after = syncConfig();
    if (after.url !== before.url || after.teamCode !== before.teamCode || after.anonKey !== before.anonKey) {
      cloudRuns = null; cloudStatus = 'idle'; cloudError = '';
      renderCompletedJobs();
    }
    saveState(); renderSyncBadge();
    if (syncReady()) fetchCompletedRuns({ quiet: true });
  }
  function renderSyncSettings() {
    const c = syncConfig();
    const map = { syncUrlInput: c.url, syncKeyInput: c.anonKey, syncTeamInput: c.teamCode, syncDeviceInput: c.device };
    Object.keys(map).forEach(id => { const el = $(id); if (el && document.activeElement !== el) el.value = map[id]; });
    const auto = $('syncAutoInput'); if (auto) auto.checked = c.autoSubmit;
    const state$ = $('syncStateLine');
    if (state$) state$.textContent = syncReady() ? 'Configured. Completed runs submit automatically.' : 'Not configured yet — follow the setup steps on the Completed jobs screen.';
  }

  function defaultTemplateName(base) { return String(base || 'Master list').replace(/\.[^.]+$/, '').trim() || 'Master list'; }
  function templateStops(stops) {
    return (stops || []).map(s => normalizeStop({ id: uid(), name: s.name || '', address: s.address || '', lat: s.lat ?? null, lon: s.lon ?? null, notes: s.notes || '', status: 'pending', completedAt: null, skipReason: '' }));
  }
  function upsertTemplate({ name, driver, stops, notes = '' }) {
    const clean = defaultTemplateName(name);
    const existing = state.templates.find(t => t.name.toLowerCase() === clean.toLowerCase());
    const cleanStops = templateStops(stops);
    if (existing) {
      existing.stops = cleanStops;
      existing.driver = driver || existing.driver || '';
      existing.updatedAt = new Date().toISOString();
      return { template: existing, updated: true };
    }
    const template = normalizeTemplate({ id: uid(), name: clean, driver: driver || '', notes, stops: cleanStops });
    state.templates.unshift(template);
    return { template, updated: false };
  }
  function startRunFromTemplate(templateId) {
    const template = state.templates.find(t => t.id === templateId);
    if (!template) return;
    if (!template.stops.length) { showToast('That master list has no stops. Add or import stops first.'); return; }
    const openRun = state.routes.find(r => r.templateId === template.id && r.status !== 'complete');
    if (openRun && !window.confirm(`"${template.name}" already has an open run from ${prettyDate(openRun.date)}. Start another run anyway?`)) return;
    const route = normalizeRoute({
      id: uid(), name: template.name, driver: template.driver || state.settings.defaultDriver, date: todayISO(),
      templateId: template.id, status: 'planned',
      stops: template.stops.map(s => normalizeStop({ id: uid(), name: s.name, address: s.address, lat: s.lat, lon: s.lon, notes: s.notes, status: 'pending', completedAt: null, skipReason: '' }))
    });
    template.lastRunAt = new Date().toISOString();
    state.routes.unshift(route); state.activeRouteId = route.id; saveState(); render(); setScreen('today');
    showToast(`Run started from "${template.name}" — ${route.stops.length} stops.`);
  }
  function deleteTemplate(templateId) {
    const template = state.templates.find(t => t.id === templateId);
    if (!template) return;
    const runs = state.routes.filter(r => r.templateId === template.id).length;
    const warning = runs ? `\n\n${runs} saved run${runs === 1 ? '' : 's'} will stay in past routes.` : '';
    if (!window.confirm(`Delete the master list "${template.name}"?${warning}`)) return;
    state.templates = state.templates.filter(t => t.id !== templateId);
    state.routes.forEach(r => { if (r.templateId === templateId) r.templateId = null; });
    saveState(); render(); showToast('Master list deleted.');
  }
  function saveRouteAsTemplate(routeId) {
    const route = getRoute(routeId);
    if (!route) return;
    const { template, updated } = upsertTemplate({ name: route.name, driver: route.driver, stops: route.stops });
    route.templateId = template.id;
    saveState(); render();
    showToast(updated ? `Master list "${template.name}" refreshed from this route.` : `Saved "${template.name}" to master lists.`);
  }
  function openListDialog(templateId = null) {
    const form = $('listForm');
    form.dataset.editId = templateId || '';
    const template = templateId ? state.templates.find(t => t.id === templateId) : null;
    $('listDialog').querySelector('.eyebrow').textContent = template ? 'EDIT MASTER LIST' : 'NEW MASTER LIST';
    $('listDialog').querySelector('h2').textContent = template ? 'Edit master list' : 'New master list';
    $('listNameInput').value = template ? template.name : '';
    $('listDriverInput').value = template ? (template.driver || '') : (state.settings.defaultDriver || '');
    $('listStopsInput').value = '';
    $('listStopsInput').placeholder = template
      ? `Leave blank to keep the ${template.stops.length} saved stops, or paste a replacement list.`
      : 'Paste addresses here, one per line.';
    $('listForm').querySelector('button[type="submit"]').textContent = template ? 'Save changes' : 'Save master list';
    openDialog('listDialog');
  }
  function onListFormSubmit(event) {
    event.preventDefault();
    const editId = $('listForm').dataset.editId;
    const name = $('listNameInput').value.trim() || 'Master list';
    const driver = $('listDriverInput').value.trim();
    const pasted = parseAddressLines($('listStopsInput').value);
    if (editId) {
      const template = state.templates.find(t => t.id === editId);
      if (!template) return;
      template.name = name; template.driver = driver; template.updatedAt = new Date().toISOString();
      if (pasted.length) template.stops = templateStops(pasted);
      saveState(); closeDialog('listDialog'); render();
      showToast(pasted.length ? `Master list updated — ${pasted.length} stops.` : 'Master list saved.');
      return;
    }
    if (!pasted.length) { showToast('Add at least one address, or import a CSV.'); return; }
    const { template, updated } = upsertTemplate({ name, driver, stops: pasted });
    saveState(); closeDialog('listDialog'); render(); setScreen('library');
    showToast(updated ? `Updated the existing master list "${template.name}".` : `Master list "${template.name}" saved — ${template.stops.length} stops.`);
  }
  function handleClick(event) {
    const navButton=event.target.closest('[data-screen]');if(navButton){setScreen(navButton.dataset.screen);return;}
    const close=event.target.closest('[data-close-dialog]');if(close){closeDialog(close.dataset.closeDialog);return;}
    const routeAction=event.target.closest('[data-route-action]');if(routeAction){const route=getActiveRoute();if(!route)return;const action=routeAction.dataset.routeAction;if(action==='export-json')shareRoute(route);if(action==='export-csv')exportRouteCSV(route);if(action==='edit'){openRouteEdit(route);}if(action==='save-template'){saveRouteAsTemplate(route.id);}if(action==='delete')deleteRoute(route.id);$('routeMenu').hidden=true;return;}
    const cardMenu=event.target.closest('[data-route-card-menu]');if(cardMenu){event.stopPropagation();const route=getRoute(cardMenu.dataset.routeCardMenu);if(route)shareRoute(route);return;}
    const cardExport=event.target.closest('[data-route-card-export]');if(cardExport){event.stopPropagation();exportRouteCSV(getRoute(cardExport.dataset.routeCardExport));return;}
    const reportExport=event.target.closest('[data-report-export]');if(reportExport){exportRouteCSV(getRoute(reportExport.dataset.reportExport));return;}
    const openRoute=event.target.closest('[data-open-route]');if(openRoute){setActiveRoute(openRoute.dataset.openRoute);return;}
    const startTemplate=event.target.closest('[data-start-template]');if(startTemplate){startRunFromTemplate(startTemplate.dataset.startTemplate);return;}
    const editTemplate=event.target.closest('[data-edit-template]');if(editTemplate){openListDialog(editTemplate.dataset.editTemplate);return;}
    const delTemplate=event.target.closest('[data-delete-template]');if(delTemplate){deleteTemplate(delTemplate.dataset.deleteTemplate);return;}
    const restart=event.target.closest('[data-restart-route]');if(restart){restartRoute(restart.dataset.restartRoute);return;}
    const completeMode=event.target.closest('[data-complete-mode]');if(completeMode){finishRoute(completeMode.dataset.completeMode);return;}
    const review=event.target.closest('[data-review-run]');if(review){openReview(review.dataset.reviewRun);return;}
    const retry=event.target.closest('[data-retry-sync]');if(retry){fetchCompletedRuns();return;}
    const cloudCsv=event.target.closest('[data-cloud-csv]');if(cloudCsv){downloadCloudRunCSV(cloudCsv.dataset.cloudCsv);return;}
    const filter=event.target.closest('[data-filter]');if(filter){stopFilter=filter.dataset.filter;document.querySelectorAll('.filter-pill').forEach(b=>b.classList.toggle('active',b===filter));renderStops(getActiveRoute());return;}
    const rowAction=event.target.closest('[data-action]');if(rowAction){const id=rowAction.dataset.id;const route=getActiveRoute();const stop=route?.stops.find(s=>s.id===id);if(!stop)return;switch(rowAction.dataset.action){case 'service':changeStopStatus(id,'serviced');break;case 'skip':openSkipDialog(stop);break;case 'undo':changeStopStatus(id,'pending');break;case 'edit':openStopDialog(stop);break;case 'up':moveStop(id,-1);break;case 'down':moveStop(id,1);break;case 'navigate':openNavigation(id);break;}return;}
  }
  function openRouteEdit(route) {
    $('routeNameInput').value=route.name||'';$('routeDriverInput').value=route.driver||'';$('routeDateInput').value=route.date||todayISO();$('routeStopsInput').value='';
    $('routeForm').dataset.editId=route.id;
    $('routeDialog').querySelector('.eyebrow').textContent='EDIT ROUTE';$('routeDialog').querySelector('h2').textContent='Route details';$('routeForm').querySelector('button[type="submit"]').textContent='Save changes';
    openDialog('routeDialog');
  }
  function resetRouteDialog() {
    $('routeForm').dataset.editId='';$('routeDialog').querySelector('.eyebrow').textContent='NEW ROUTE';$('routeDialog').querySelector('h2').textContent='Create a route';$('routeForm').querySelector('button[type="submit"]').textContent='Create route';
  }
  function onRouteFormSubmit(event) {
    event.preventDefault();
    const editId=$('routeForm').dataset.editId;
    if(editId){const route=getRoute(editId);if(route){route.name=$('routeNameInput').value.trim()||route.name;route.driver=$('routeDriverInput').value.trim()||'Unassigned';route.date=$('routeDateInput').value||todayISO();route.updatedAt=new Date().toISOString();saveState();}closeDialog('routeDialog');resetRouteDialog();render();showToast('Route details saved.');return;}
    const stops=parseAddressLines($('routeStopsInput').value);
    if(!stops.length){showToast('Add at least one address, or import a CSV.');return;}
    createRoute({name:$('routeNameInput').value.trim()||'New route',driver:$('routeDriverInput').value.trim()||state.settings.defaultDriver,date:$('routeDateInput').value||todayISO(),stops});closeDialog('routeDialog');resetRouteDialog();
  }
  function handleRouteMenu(event){const menu=$('routeMenu');if(event.target.closest('#routeMoreButton')){menu.hidden=!menu.hidden;return;}if(!event.target.closest('.menu-wrap'))menu.hidden=true;}
  function saveSettings() {
    state.settings.defaultDriver=$('defaultDriverInput').value.trim()||'Driver 1';
    state.settings.navigation=$('navSelect').value||'google';
    state.settings.navMode=$('navModeSelect').value||'app';
    state.settings.tripStops=$('tripStopsSelect').value||'auto';
    saveState();render();showToast('Settings saved.');
  }
  function initEvents() {
    document.addEventListener('click',handleClick);
    document.addEventListener('click',handleRouteMenu);
    $('newRouteButton').addEventListener('click',openRouteDialog);$('routesNewButton').addEventListener('click',openRouteDialog);$('emptyNewRoute').addEventListener('click',openRouteDialog);$('routesEmptyNew').addEventListener('click',openRouteDialog);
    ['todayImportButton','emptyImport','routesImportButton'].forEach(id=>$(id).addEventListener('click',()=>{csvTarget='run';$('csvInput').click();}));
    $('libraryImportButton').addEventListener('click',()=>{csvTarget='library';$('csvInput').click();});
    ['libraryNewButton','libraryEmptyNew'].forEach(id=>$(id).addEventListener('click',()=>openListDialog()));
    $('listForm').addEventListener('submit',onListFormSubmit);
    $('finishRouteButton').addEventListener('click',openCompleteDialog);
    $('saveSyncButton').addEventListener('click',()=>{saveSyncSettings();showToast('Sync settings saved.');});
    $('testSyncButton').addEventListener('click',testSync);
    $('refreshCompletedButton').addEventListener('click',()=>fetchCompletedRuns());
    $('exportCompletedButton').addEventListener('click',downloadAllCloudCSV);
    window.addEventListener('online',()=>flushOutbox({quiet:false}));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)flushOutbox({quiet:true});});
    const copySql=$('copySqlButton'); if(copySql) copySql.addEventListener('click',copySetupSql);
    const saveReview=$('saveReviewButton'); if(saveReview) saveReview.addEventListener('click',()=>saveReviewNote(saveReview.dataset.reviewSave));
    const cSearch=$('completedSearch'); if(cSearch) cSearch.addEventListener('input',e=>{state.ui=state.ui||{};state.ui.completedSearch=e.target.value;renderCompletedJobs();});
    $('navigateRouteButton').addEventListener('click',openNextStops);
    $('csvInput').addEventListener('change',e=>{handleCSVFile(e.target.files[0]);e.target.value='';});
    ['importPackageButton','importCompletedButton','settingsImportButton'].forEach(id=>$(id).addEventListener('click',()=>$('packageInput').click()));
    $('packageInput').addEventListener('change',e=>{const f=e.target.files[0];if(f){if(f.name.toLowerCase().endsWith('.csv'))handleCSVFile(f);else if(f.name.toLowerCase().endsWith('.json')){if(screen==='settings')importWorkspace(f);else importPackageFile(f);}else showToast('Choose a route JSON package or CSV list.');}e.target.value='';});
    $('routeForm').addEventListener('submit',onRouteFormSubmit);$('stopForm').addEventListener('submit',saveStopForm);
    $('skipForm').addEventListener('submit',e=>{e.preventDefault();if(skipTargetId)changeStopStatus(skipTargetId,'skipped',{reason:$('skipReasonInput').value,notes:$('skipNotesInput').value.trim()});closeDialog('skipDialog');skipTargetId=null;});
    $('addStopButton').addEventListener('click',()=>openStopDialog());$('startRouteButton').addEventListener('click',startOrCompleteRoute);$('approxOptimizeButton').addEventListener('click',optimizeApproximate);
    $('shareRouteButton').addEventListener('click',()=>shareRoute());$('exportAllButton').addEventListener('click',exportAllCSV);$('backupButton').addEventListener('click',exportWorkspace);$('saveSettingsButton').addEventListener('click',saveSettings);
    $('clearDataButton').addEventListener('click',()=>{if(window.confirm('Clear every route saved in this browser? Export a backup first if you may need this data.')){state=freshState();saveState();render();showToast('Local workspace cleared.');}});
    $('serviceNextButton').addEventListener('click',()=>{const id=$('serviceNextButton').dataset.stopId;if(id)changeStopStatus(id,'serviced');});$('navigateNextButton').addEventListener('click',()=>{const id=$('navigateNextButton').dataset.stopId;if(id)openNavigation(id);});
    $('stopSearch').addEventListener('input',e=>{stopSearch=e.target.value;renderStops(getActiveRoute());});$('reportSearch').addEventListener('input',e=>{reportSearch=e.target.value;renderReports();});
    $('dismissNotice').addEventListener('click',()=>{state.settings.noticeDismissed=true;saveState();render();});$('loadDemoButton').addEventListener('click',loadDemoRoute);
    window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('installButton').hidden=false;});
    $('installButton').addEventListener('click',async()=>{if(!installPrompt){showToast('On iPhone, use Share → Add to Home Screen in Safari.');return;}installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('installButton').hidden=true;});
    document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',()=>{if(d.id==='routeDialog')resetRouteDialog();}));
    registerServiceWorker();
  }
  // Keep installed copies current: check for a new service worker when the app
  // regains focus and hourly, then reload once when the updated worker takes
  // control. Without this a redeploy left drivers on stale cached code.
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(registration => {
        const checkForUpdate = () => { registration.update().catch(() => {}); };
        window.addEventListener('focus', checkForUpdate);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
        setInterval(checkForUpdate, 60 * 60 * 1000);
      }).catch(() => {});
    });
  }
  function init() {
    initEvents();
    if (syncReady()) { flushOutbox({ quiet: true }); fetchCompletedRuns({ quiet: true }); }
    renderSyncBadge();
    $('defaultDriverInput').value=state.settings.defaultDriver||'Driver 1';$('navSelect').value=state.settings.navigation||'google';
    render();
  }
  init();
})();
