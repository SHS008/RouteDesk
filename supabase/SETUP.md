# Connecting RouteDesk to your manager portal

**Time:** about 5 minutes · **Cost:** $0 on Supabase's free plan
**What you get:** a driver finishes a route → it appears in the owner's **Completed jobs** tab automatically. No spreadsheets to collect.

You only do steps 1–3 once. After that, each device needs the same three values pasted into Settings.

---

## Step 1 — Create the project (your account)

1. Sign up at <https://supabase.com> using a **company-owned** email address. This account will hold every address your drivers submit, so it should not be a personal or temporary mailbox.
2. **New project**. Name it something like `routedesk`. Pick the region closest to you (**East US** for Michigan). Save the database password somewhere safe — you won't need it for RouteDesk, but you can't recover it later.
3. Wait ~2 minutes for provisioning.

Free plan notes: 500 MB database, no automatic backups, and the project **pauses after a week with no activity**. Daily route use keeps it active. If it does pause, open the dashboard and resume — your data is kept.

## Step 0 — If you linked the project to GitHub

Connecting Supabase to GitHub (sign in with GitHub, or the Supabase **GitHub
Integration**) does **not** create RouteDesk's table on its own. It only lets Supabase
run SQL files from the repository's `supabase/migrations/` folder when it deploys a
branch. This repo now ships that migration:

```
supabase/migrations/20261021120000_routedesk_init.sql
```

So if your integration is pointed at `SHS008/RouteDesk`, it can apply the schema for you
on its next deploy. Nothing in the app depends on which route you take — but the SQL
Editor path below is the one that is guaranteed to work in 30 seconds, so use it unless
you have already watched a deployment succeed.

Either way, **you can confirm it worked in Step 2's check.**

## Step 2 — Create the table and its security rules

Easiest path: open RouteDesk → **Completed jobs** → **⧉ Copy setup SQL**.

Then: Supabase → **SQL Editor** → **New query** → paste → **Run**. You should see
"Success. No rows returned."

The same SQL lives in [`schema.sql`](./schema.sql) if you would rather copy it from the
repository.

This creates one table, `completed_runs`, and locks it so a device can only read and add
rows carrying its own team code. **Re-running it later is safe** — it adds any missing
columns and keeps your existing rows, so it doubles as the upgrade step.

### Confirm it worked

In the SQL Editor run:

```sql
select count(*) from public.completed_runs;
```

`0` means the table exists and you're done. A "relation does not exist" error means the
SQL did not run — try the SQL Editor path again.

The policies in this schema were tested against PostgreSQL 17, not just assumed:
a device sending one team code cannot read, add, or edit another team's rows, and a
request with no team code (or an empty one) is rejected outright.

## Step 3 — Pick a team code

In the same SQL Editor, run:

```sql
select encode(gen_random_bytes(18), 'base64');
```

Copy the result — that is your **team code**. Use the *same* string on every device. Treat it like a shared password.

## Step 4 — Copy your project URL and key

Supabase renamed this area. There is **no "API" page any more** — it is now
**Settings → API Keys**.

1. **Project Settings** (gear, bottom-left) → **API Keys**.
2. Copy the **Project URL** — looks like `https://abcdefghijk.supabase.co`.
3. Copy the **Publishable key** — it starts with `sb_publishable_`.

Notes:

- On a project created before mid-2025 you may instead see a tab called **Legacy API
  keys** holding an **anon** key that starts with `eyJ`. Both kinds work in RouteDesk;
  it detects which one you pasted.
- If your project shows a **Create new API keys** button, you are on legacy keys only.
  Creating the new ones is safe and keeps the old ones working.
- ⚠️ **Never** paste a **secret** key (`sb_secret_…`) or a **`service_role`** key. Those
  bypass every security rule and would expose all your data. RouteDesk refuses them.

## Step 5 — Enter it on each device

Open RouteDesk → **Settings** → **Manager portal**:

| Field | What to paste |
|---|---|
| Supabase project URL | `https://yourproject.supabase.co` |
| Publishable key | `sb_publishable_…` (or the older `eyJ…` anon key) |
| Team code | the string from step 3 — **identical on every device** |
| This device name | e.g. `Truck 1 — Dana` or `Office PC` |

Leave **Submit completed runs automatically** checked. Tap **Save sync settings**, then **Test connection**. You should see "Connected."

The badge in the top bar reads **Cloud synced** when everything is working, **N to submit** when runs are queued, and **Cloud off** when sync isn't configured.

## How it behaves

- **Driver finishes a run** → submitted immediately. If there's no signal, the run is queued on the device and uploads the moment it's back online (also on next app open, and on returning to the app).
- **Nothing is ever lost in a dead zone.** The run is stored locally first, exactly as before; the cloud is a copy.
- **Resubmitting is safe.** Runs are keyed by the run's own ID, so a retried upload replaces the copy instead of duplicating it.
- **Manager review** → **Completed jobs** tab lists every submitted run with date, driver, device, and serviced/skipped counts. **Review** opens the stop-level record; **CSV** exports one run; **Export all jobs** exports everything.
- **Wrong team code** = you see nothing. Teams are isolated by the code.

## What this setup does and does not protect

- It **does** isolate your company's runs from any other company using RouteDesk.
- It **does not** protect against someone who has all three of: your site URL, the public anon key (visible in any visitor's page source), and your team code. With all three they could read and add completed runs.
- That is an acceptable trade for addresses alone, which is your situation. **If you ever add customer names, phone numbers, gate codes, or anything identifying, stop and move to real sign-in (Supabase Auth) first.** The schema is ready for that change — it only needs a `user_id`-based policy added.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Sync error" badge | Wrong URL/key, or schema not run | Re-check step 4 values; confirm step 2 succeeded |
| "Invalid JWT" | A publishable key was sent as a bearer token | Fixed in V1.6 — the app now sends it on `apikey` only. Update to V1.6+ |
| "That is a secret key" | Pasted `sb_secret_…` or `service_role` | Use the publishable key instead |
| "Could not reach the manager portal" | Project paused (free tier, 7 days idle) | Resume it in the Supabase dashboard |
| Completed jobs is empty but drivers submitted | Team code differs by a typo or a trailing space | Compare the code character-for-character on both devices |
| Setup screen keeps appearing | URL, key, or code field is blank | All three are required |
| "The completed_runs table is missing" | Step 2 was skipped | Copy the setup SQL from the Completed jobs screen and run it |
| "Your table is out of date" | Installed on V1.2, needs V1.3 columns | Re-run the setup SQL; existing rows are kept |

## Manager review

Open any submitted run → **Review**. The stop-level record is listed with outcomes,
skip reasons, and driver notes. Add a **Manager note** and press **Save note** — it is
stamped with the reviewing device name and time, marked ✓ noted in the list, and carried
into the CSV export. A driver re-submitting the same run cannot overwrite it.
