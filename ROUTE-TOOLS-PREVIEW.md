# RouteDesk route tools — initial release

## What changed
- Final pending stop: **Serviced · Finish & save** logs and archives the route locally immediately. Final skip also archives after its reason is saved. An issue kept pending does not finish the route. Optional Supabase submission uses the existing outbox.
- Camera/photo OCR uses vendored Tesseract.js and the English recognition model. No image is sent to a remote AI. Review and edit the extracted lines before creating or appending stops. This is text recognition, not a generative-AI address parser; remove headings and join wrapped addresses manually.
- Individual stop map uses the OpenStreetMap embed and saved coordinates; no Google/Apple/Waze SDK, paid key, or navigation dependency. Existing navigation button still opens the chosen app. No pin? Enter coordinates manually or explicitly look up candidate addresses with a free openrouteservice key. Candidate confirmation is required.
- Road-time planner gets an openrouteservice driving-time matrix and performs local nearest-neighbor plus directed-cost 2-opt ordering. Never applies automatically, never knowingly offers an order slower than the original under the same matrix, and provides undo. Logged stops retain their positions and outcomes.

## Limits and safety
- **Not a guaranteed fastest route.** No live traffic. Service times are excluded.
- **2–40 pending stops** in this initial planner. No silent splitting of longer routes. Intended as a review build; a normal 100–150-stop driver route needs a larger-scale provider/backend strategy before enabling planning at that scale.
- **Left/right approach is advisory only.** The preference is saved and displayed, but is not passed to this matrix engine as a guaranteed curb-side constraint. No claim of passenger-side optimization.
- Free ORS key required only for address lookup / travel-time planning. It is retained in sessionStorage, not route exports. Click Forget key to clear it. No paid service is configured. Confirm free-plan terms for business usage with the provider before rollout. No live provider account/key was available during this build.
- A network connection is needed for maps, address lookup, and generating new road-time proposals. Failure or quota exhaustion does not prevent logging and does not change stop order.
- OCR first use downloads the local worker/model from this app. Subsequent offline availability depends on browser resource cache/IndexedDB retention. Do not promise permanent offline OCR.
- Browser storage can be cleared by the OS/user. Export backups and test on actual driver devices before deployment.

## Running / testing
Serve the folder over HTTP(S), e.g. `python -m http.server 3000 --bind 0.0.0.0`.
From an empty workspace click **See a small demo route**. Scan list and Plan route appear above the stop list.

Tests: install Playwright (`npm install --no-save playwright`; `npx playwright install --with-deps chromium`), start app on port 3000, then `node tests/route-tools.cjs`.

Test coverage: exit/resume, pin saving/map element, issue kept pending, offline final skip/archive, actual local OCR fixture, reviewed scan creation, matrix proposal/apply/undo with a simulated response (not live-provider validation), service-worker offline reload, final serviced/archive. Real iPhone/camera and live routing-service tests remain needed.

Vendor: Tesseract.js / tesseract.js-core; license files in vendor/licenses. English model source: https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz (Tesseract tessdata Apache-2.0). OpenStreetMap attribution is shown in the map. ORS results must retain applicable attribution.
