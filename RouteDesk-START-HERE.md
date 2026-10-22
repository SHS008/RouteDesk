# RouteDesk — setting up the "Completed jobs" inbox

Read this slowly. You can't break anything, and it's free.

---

## What you're doing, in one sentence

Right now each phone keeps its own routes. You're adding one shared **inbox** in the
cloud so that when a driver finishes a route, a copy lands where you can see it from
your own computer.

---

## What you need

- A **computer** (much easier than a phone for this part)
- Your **Supabase login** (you already made the account — that's the site you were just on)
- About **10 minutes**

Do Parts 1–3 on the computer. Do Part 4 on each driver's phone.

---

# Part 1 — Make the inbox in Supabase

Supabase is the storage. Right now it's an empty locker with no shelf in it. This part
builds the shelf.

### Step 1
On the computer, open your RouteDesk app:
**https://shs008.github.io/RouteDesk/**

### Step 2
Click **Completed jobs** on the left. You'll see a screen saying "Connect your manager
portal."

### Step 3
Click the button that says **⧉ Copy setup SQL**.
You won't see anything happen — that's normal. It quietly copied something for you.

### Step 4
Now go to Supabase and click this link:
**https://supabase.com/dashboard/project/gwgzwkchxupivgmqoblr/sql/new**

You'll get a page with a big empty white box.

### Step 5
Click **inside** the white box, then press **Ctrl + V** on a PC (or **Cmd + V** on a Mac).
A wall of text appears. That's correct.

### Step 6
Look for a **Run** button (usually bottom-right of the box) and click it.

You should see the words **"Success. No rows returned."**

That's it — the shelf is built. ✅

---

# Part 2 — Copy the two codes Supabase made for you

You need two things from Supabase. Think of them like a web address and a front-door key.

### Step 7
Click this link:
**https://supabase.com/dashboard/project/gwgzwkchxupivgmqoblr/settings/api-keys**

> If that link doesn't work, click your project's name at the top, then find
> **Settings** (a gear icon), then **API Keys**.

### Step 8 — the address
Near the top you'll see **Project URL**.
It reads: `https://gwgzwkchxupivgmqoblr.supabase.co`

Click the little **copy** icon next to it.

### Step 9 — the key
On the same page, find **Publishable key**. It's a short line starting with
`sb_publishable_`.

Click the copy icon next to it.

> **Three things not to copy:** if you see **Secret key**, **service_role**, or anything
> starting with `sb_secret_` — leave it alone. Those are master keys and must never go
> into a web page. RouteDesk will refuse them anyway, but don't copy them.
>
> **If you don't see "Publishable key":** look for a tab called **Legacy API keys** and
> copy the one labelled **anon**. It's a long line starting with `eyJ`. That works too.

---

# Part 3 — Give the codes to RouteDesk

### Step 10
Back in RouteDesk, click **Settings** on the left, then scroll to **Manager portal**.

### Step 11
Fill in the boxes:

| Box | What goes in it |
|---|---|
| **Supabase project URL** | Paste the web address from Step 8 |
| **Publishable key** | Paste the `sb_publishable_…` line from Step 9 |
| **Team code** | Make one up. See below. |
| **This device name** | Type something you'll recognise, like `Office computer` |

### Step 12 — the team code
This is a shared password that all your devices use so they all look in the same inbox.
**Make up a long one** and write it down somewhere safe.

Good example: `PurpleTruck42Escanaba`

Don't use something short like `1234`. It's the only thing protecting the inbox.

### Step 13
Click **Save sync settings**, then click **Test connection**.

If it says **"Connected"**, you're done with the hard part. 🎉

---

# Part 4 — Do this on each driver's phone

Nothing new to install. Just the same three values on every phone.

For each phone:

1. Open **https://shs008.github.io/RouteDesk/**
2. Tap **Settings** → **Manager portal**
3. Type in the **same three things** you used in Part 3:
   - the web address from Step 8
   - the key from Step 9 (`sb_publishable_…`)
   - the **exact same team code** from Step 12
4. Give that phone a name, like `Truck 1 — Dana`
5. Tap **Save sync settings**, then **Test connection**

⚠️ The team code must be **letter-for-letter identical** on every device. One extra space
and that phone won't see the others.

---

# Sending a route to the portal

## For routes finished from now on — automatic
Nothing extra to do. A driver finishes a route by tapping **Finish route**, and it goes
to the portal by itself. Open **Completed jobs** on any device with the same team code
and it's there.

## For routes you finished BEFORE setting this up
Those older routes are still on the device but were never sent, because sending only
happens at the moment a route is finished. To send them:

**One at a time**
1. Tap **Routes** on the left.
2. Scroll to **Past routes**.
3. On the route you want, tap **⇧ Send to portal**.
4. It disappears from the button list and now shows **✓ Sent to portal**.

**All at once**
1. Tap **Completed jobs** on the left.
2. At the top there's a button like **⇧ Send 2 past routes** — the number is how many are
   waiting.
3. Tap it and confirm.

The button disappears when there's nothing left to send. Sending the same route twice is
harmless — it updates the copy instead of making a duplicate.

# How you'll know it's working

Look at the top-right corner of RouteDesk. There's a small label:

| What it says | Meaning |
|---|---|
| **Cloud off** | Not set up yet on this device |
| **Cloud synced** | Working, everything is sent |
| **2 to submit** | Saved on the phone, will send when it gets signal |

To test the whole thing: have a driver tap **Finish route** on a route, then open
**Completed jobs** on your computer. The finished route should be sitting there.

---

# Words you'll bump into

- **Supabase** — the website that stores your data. You own the account.
- **Table** — just a spreadsheet that lives inside Supabase.
- **SQL** — computer instructions. You don't need to understand it; you're just
  pasting one page of it that I already wrote.
- **Publishable key** — a short code that lets RouteDesk talk to your Supabase. It's
  designed to be public, so it's safe to put in the app. Older projects call it the
  **anon** key.
- **Project URL** — your Supabase web address. It's the part in your browser bar after
  `/project/`, with `.supabase.co` on the end.
- **Team code** — the shared password you made up in Step 12.

---

# If something goes wrong

Nothing here can damage your phone, your routes, or your Supabase account. The worst
case is it doesn't connect yet.

If a message appears you don't understand, copy the words and send them to me. I can
tell you exactly which step to redo.

Two messages you might see, and what they mean:

- **"The completed_runs table is missing"** → Part 1 didn't finish. Redo Steps 4–6.
- **"Blocked by a security rule"** → the team code doesn't match. Check for a typo or a
  stray space on every device.
- **"Invalid JWT"** → your copy of the app is out of date. Close it fully and reopen it to
  pick up the newest version.
