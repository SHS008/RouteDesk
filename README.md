# RouteDesk

**A $0-first, local-first route and service log PWA for small delivery/service teams.** RouteDesk is a static browser app: no account, database, API key, subscription, or server-side code is required.

## What it does

- Handles large route lists (designed for roughly 101–150 stops per driver/day and small teams of 1–5 drivers).
- Imports CSV stop lists or accepts pasted addresses, preserving the provided order.
- Stores route and stop data in the current browser on the current device.
- Lets a driver mark each stop **serviced** or **skipped**, with a timestamp, optional notes, and a skip reason.
- Exports an Excel-compatible UTF-8 CSV service log, or a JSON route package that can carry the full route and stop outcomes between devices.
- Opens one stop at a time in Google Maps, Apple Maps, or Waze.
- Can be installed as a PWA and caches the app shell for later offline access after the first visit.

## Important free-mode limits

This is intentionally not a paid dispatch/optimization service:

- **No live-traffic stop-order optimization.** The imported order is kept. An optional approximate reorder is available only when every stop has latitude and longitude; it uses straight-line distances, anchors the first stop, and does not represent road distance, travel time, or current traffic.
- **No automatic right/passenger-side or curbside guarantee.** Drivers should use their safe-side preference and follow local road conditions.
- **No automatic sharing or cross-device sync.** Each browser has its own local workspace. Dispatchers and drivers exchange route JSON packages or CSV reports manually using company-approved storage or messaging.
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

## Files

- `index.html` — app interface
- `styles.css` — responsive mobile/desktop layout
- `app.js` — local storage, route and stop operations, CSV/JSON import-export, and map links
- `manifest.webmanifest`, `icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `sw.js` — PWA metadata, install icons, and offline app-shell cache
