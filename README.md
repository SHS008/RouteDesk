# RouteDesk V1.7

**A $0-first, local-first route and service log PWA for small delivery/service teams.** RouteDesk is a static browser app: no account, database, API key, subscription, or server-side code is required.

## Running it from a single file

`python3 build-single-file.py` bundles everything into one `RouteDesk-V1.7-ONE-FILE.html`
with the CSS, JavaScript, and icons inlined. That file can be emailed, opened from a USB
stick, or double-clicked from disk with no extraction and no server. The manifest and
service worker are dropped in that build because browsers block both on `file://` pages;
everything else — local storage, master lists, and portal submission — works unchanged.

## What's new in V1.7

- **Send past routes to the portal.** Submission only happened at the moment a route was
  finished, so anything completed before the portal was set up could never appear. Past
  routes now carry a **Send to portal** button, and Completed jobs offers a bulk
  **Send N past routes** action. Re-sending is idempotent.
- **Fixed: card buttons were being swallowed.** The whole route card is a click target,
  and its handler ran before the specific buttons inside it, so *Restart* and the new
  *Send to portal* silently opened the route instead of acting. Specific actions now
  take precedence.

## What's new in V1.6

- **Works with Supabase's new API keys.** Supabase replaced the "anon" key with a
  **publishable key** (`sb_publishable_…`) and there is no longer a *Settings → API*
  page. RouteDesk accepts either key and detects which one you pasted. A publishable key
  is sent on the `apikey` header only — sending it as a bearer token, which the previous
  version did, makes Supabase reject the request with *Invalid JWT*.
- **Refuses dangerous keys.** A `sb_secret_…` key or a legacy `service_role` JWT bypasses
  every security rule; RouteDesk now refuses them with an explanation instead of storing
  them in the browser.

## What's new in V1.5

- **Any project URL format works** — paste the Supabase *Project URL*, the bare project
  ref, the address-bar dashboard URL, or a URL with a path or trailing slash. RouteDesk
  reduces it to the API base and shows you what it resolved to.
- **Unusable input is rejected** instead of being saved silently, and the field is
  corrected in place so you can see what was stored.

## What's new in V1.4

- **Hardened team isolation** — the sync policies now reject any row with an empty team
  id, so a request carrying no team code can neither read nor create records. Verified
  against PostgreSQL 17: cross-team reads, inserts, and edits all fail.
- **Migration file for the GitHub integration** — `supabase/migrations/` now contains the
  schema, so linking the repo to Supabase can apply it on deploy.

## What's new in V1.3

- **Manager review notes** — a manager can annotate any completed run ("verified with
  customer", "follow up on the missed stop"). The note is stamped with who wrote it and
  when, shows as a ✓ noted badge in the list, and is included in the CSV export.
  *A driver resubmitting a run never overwrites a manager note.*
- **In-app setup** — the Completed jobs screen has a **Copy setup SQL** button, so the
  database is created by pasting one block into Supabase. No repo access needed.
- **Plain-language setup errors** — a missing table, rejected key, outdated schema, or
  team-code mismatch is explained in the app with the exact fix, instead of an HTTP code.
- **Schema upgrades in place** — re-running the setup SQL adds any new columns and keeps
  existing rows, so this release upgrades a V1.2 install without losing data.

## What's new in V1.2

- **Completed jobs portal** — when a driver taps *Finish route*, the completed run is
  submitted to a Supabase project **you own** and shows up in the owner's **Completed
  jobs** tab: date, driver, device, serviced/skipped counts, and the full stop-level
  record. No spreadsheets to collect.
- **Offline-safe submission** — a run finished with no signal is queued on the device
  and uploads the moment it reconnects. Runs are keyed by their own ID, so a retried
  upload replaces the copy instead of duplicating it.
- **Team isolation by team code** — no user accounts to administer. Each company's
  runs are visible only to devices using the same team code.
- **Review & export** — open any submitted run to see every stop's outcome, skip
  reason, and notes; export one run or all of them as CSV.

Setup takes about five minutes and costs nothing on Supabase's free plan:
see [`supabase/SETUP.md`](./supabase/SETUP.md). RouteDesk still works fully offline
and locally with no cloud configured — sync is additive.

## What's new in V1.1

- **Master lists** — upload a stop list once and reuse it forever. The `Master lists`
  screen keeps every list you have uploaded; a run is a copy, so drivers' notes and
  skip reasons never change the saved list.
- **Start, finish, and restart runs** — `Finish route` archives the run to
  *Past routes* with its full service log, then offers to start a fresh run of the
  same stops with serviced/skipped/notes/timestamps cleared. Past runs can be
  restarted from the Routes screen at any time.
- **Grouped navigation** — `Open next N pending stops` sends the next group of
  unclosed stops to Google Maps in one trip instead of one stop at a time.
- **Copy mode** — set `When a driver taps Navigate` to *Copy the address* to stay
  inside RouteDesk instead of handing off to another app (see the iOS note below).

## What it does

- Handles large route lists (designed for roughly 101–150 stops per driver/day and small teams of 1–5 drivers).
- Imports CSV stop lists or accepts pasted addresses, preserving the provided order.
- Stores route and stop data in the current browser on the current device.
- Lets a driver mark each stop **serviced** or **skipped**, with a timestamp, optional notes, and a skip reason.
- Exports an Excel-compatible UTF-8 CSV service log, or a JSON route package that can carry the full route and stop outcomes between devices.
- Opens one stop at a time in Google Maps, Apple Maps, or Waze.
- Can be installed as a PWA and caches the app shell for later offline access after the first visit.

## Reusing a route

1. Open **Master lists** and either **New master list**, or **Import CSV** to upload a
   spreadsheet. Uploading a CSV while creating a run also saves the list automatically.
2. Tap **Start run**. That copies the stops into today's route and opens it on **Today**.
3. Work the route, then tap **Finish route**. Choose:
   - **Mark completed & start a fresh run** — archives this run to *Past routes* and
     immediately opens a clean copy of the same stops.
   - **Mark completed only** — archives the run and leaves nothing open.

The master list itself is never modified by a run. Delete a list and its past runs
stay in the service log.

## iPhone navigation note

iOS shows its own “Open in Google Maps?” confirmation whenever a web app hands a
link off to another app. That dialog belongs to iOS, not RouteDesk, and no web page
can suppress it. Three options:

- **Apple Maps** opens without the confirmation, because it is the system app.
- **Copy the address** (Settings → When a driver taps Navigate) copies the stop
  address to the clipboard so the driver pastes it into whichever app they prefer.
- Turn the prompt off in Google Maps: **Google Maps → Settings → Default apps →
  Browser → Safari**, or long-press the “Open” button and pick “Open in app”.

Google Maps accepts about three intermediate stops per link, so `Open next N pending
stops` works through a long route in groups. Apple Maps and Waze links carry only a
single destination, so those open one stop at a time.

## Important free-mode limits

This is intentionally not a paid dispatch/optimization service:

- **No live-traffic stop-order optimization.** The imported order is kept. An optional approximate reorder is available only when every stop has latitude and longitude; it uses straight-line distances, anchors the first stop, and does not represent road distance, travel time, or current traffic.
- **No automatic right/passenger-side or curbside guarantee.** Drivers should use their safe-side preference and follow local road conditions.
- **No live location tracking.** RouteDesk does not report where a driver is. The cloud copy is submitted when a run is *finished*, not continuously.
- **No live multi-device editing.** Each browser keeps its own working copy of a run. Cross-device sharing happens through the completed-jobs submission, or manually through route JSON packages and CSV reports.
- There is no login or access control. Anyone with access to a device can use its local workspace. Exported route files and CSV logs may contain customer addresses.
- Launching a navigation app sends the selected stop/destination to that provider. RouteDesk itself does not send route records to a server.

## Run locally

1. Open a terminal in this folder (`route-desk`).
2. Start a local static server:

   ```sh
   python3 -m http.server 8080 --bind 0.0.0.0
   ```

3. On that computer, open <http://localhost:8080>.

A local server is recommended instead of opening `index.html` directly because browser installation and offline service-worker features require a secure origin (HTTPS, or `localhost` for local testing).

## Use on phones and across a team

For phone access outside the computer, publish these static files to a company-approved HTTPS static host. A free static-hosting plan can keep hosting cost at $0, but the host URL itself is not an authenticated team workspace. Do not put customer information into a public form or share exports outside approved channels.

- **iPhone/iPad:** open the HTTPS URL in Safari, tap Share, then **Add to Home Screen**.
- **Android:** open it in Chrome and use **Install app** / **Add to Home screen** when offered.
- The app's install button appears when the browser exposes its install prompt. On iPhone, use Safari's Share menu.

Suggested manual handoff:

1. Dispatch creates a route and uses **Share route package**. If the device offers native file sharing, send the JSON file; otherwise RouteDesk downloads it for sharing through an approved channel.
2. The driver opens RouteDesk on their own device and imports the route package.
3. The driver records outcomes, then shares the updated JSON package back. The dispatcher imports it under **Import completed package**; a package with the same route ID replaces that saved route with the driver's updated copy.
4. Use **Export service log (CSV)** or **Export all logs** for spreadsheet review. The CSV includes route/driver/date, stop sequence, address, status, completion timestamp, skip reason, and notes.

A workspace backup in **Settings → Download backup** contains every locally saved route and settings. Keep a backup before clearing browser storage or moving to another device.

## CSV import format

The simplest supported format is one address per row. A header row is also supported; useful column names include:

```csv
name,address,lat,lon,notes
North shop,101 Example St,45.75,-87.06,Use side entrance
```

Address aliases include `address`, `full_address`, `stop_address`, `location`, and `street_address`. Optional columns include `name`/`customer`, `lat`/`latitude`, `lon`/`lng`/`longitude`, `notes`/`instructions`, `status`/`outcome`, `completed_at`/`timestamp`, and `skip_reason`/`reason`. Existing valid timestamps and outcomes are preserved on CSV import; if an outcome is present without a timestamp, the import time is used. Keep the sequence in the CSV in the order you want the driver to follow.

CSV exports are UTF-8 with a byte-order mark to improve compatibility with Excel. Stop completion timestamps are stored as ISO 8601 UTC values and displayed in the device's local time zone.

## Releasing an update

The service worker serves the app shell network-first, so a redeployed file is
picked up on the next load rather than being pinned to the first cached copy.
Installed copies also check for a new version when the app regains focus and
once an hour, then reload once when the update takes control.

When you change `index.html`, `app.js`, or `styles.css`:

1. Bump `CACHE_VERSION` in `sw.js` (for example `v2` → `v3`). This lets the
   activate step clear old precache entries deterministically.
2. Deploy the files.
3. A driver with the app already installed gets the new build on their next
   load, or within an hour without reopening it.

Stored routes and settings live in `localStorage` and are not touched by a
service-worker update, so an update does not clear anyone's route data.

## Files

- `index.html` — app interface
- `supabase/schema.sql` — cloud table and security policy for the Completed jobs portal
- `supabase/migrations/20261021120000_routedesk_init.sql` — same schema, for the Supabase GitHub integration
- `supabase/SETUP.md` — five-minute setup guide
- Master lists, runs, and past routes are all stored in the same browser workspace
- `styles.css` — responsive mobile/desktop layout
- `app.js` — local storage, route and stop operations, CSV/JSON import-export, and map links
- `manifest.webmanifest`, `icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `sw.js` — PWA metadata, install icons, and offline app-shell cache
