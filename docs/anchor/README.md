# Anchor

A small, private app for your phone. It makes the right move the easy one on a tired day, and makes escaping visible, without judging you for it.

It lives at **bigf.me/anchor**. Nothing on the public site links to it, and search engines are asked not to index it.

## Put it on your iPhone

1. Open **bigf.me/anchor** in **Safari**.
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Open it from the anchor icon from now on. After the first load it works offline.

The home-screen app keeps its own data, separate from Safari tabs. Use the icon, not a tab.

## What each screen is for

| Screen | For |
| --- | --- |
| **Today** | The one **anchor** that moves a number today, a quick check-in, up to **3 actions**, a timer, and an evening shutdown. |
| **Escape check** (the *I want to build something new* button) | Six short questions before starting something new, then a calm *Go, time-boxed* or *Park it*. Always your call. |
| **Bets** | What you're betting on, with *continue if* and *kill if* written before you start. At most 3 active. Parked ideas wait here too. |
| **Funnel** | One row per cohort or week: where people drop off, and what an hour of your time earns. Empty means unknown, not zero. |
| **Talks** | A quick Mom Test log. Who it was and what they actually **did** is enough. |
| **Heavy** (More) | Stressful things, each with one next physical step. A worry dump, and a 2-minute breathing reset. |
| **Time** (More) | Where the week's hours went: build vs sell, and how much came from escape checks. |
| **Weekly review** (More) | About two minutes. Numbers are filled in for you; only bets that are due need a call. |
| **Settings** (More) | Profile, backups and import, sync, app lock, erase. |

If it's a hard night: Thailand Mental Health Hotline **1323** (24 hours).

## How a day goes

- **Morning:** the anchor comes first, the check-in is one row of taps. Low energy suggests a smaller anchor. Last night's lesson sits under the anchor, and yesterday's unfinished actions can be carried over.
- **Want to build something new?** The escape check leans *Park it* with no number, no active bet, or no date (or a date more than 30 days out). If you name something you're avoiding, *Do that first (10 min)* comes first. If today's anchor is still open, it asks *Anchor first?* Going anyway after a Park counts as escape time.
- **Time-boxed timers:** when the box runs out, a banner shows on every screen, and *Stop* asks *What moved?*
- **When the anchor's time passes:** *Do 15 min of it, or move it to tomorrow?*
- **Evening (after 18:00):** the shutdown moves to the top. Three lines: a win, a lesson, tomorrow's anchor. An anchor still open is offered as tomorrow's.
- **Sunday:** the weekly review pulls in each evening's win and lesson. Next week's anchor waits on Monday's Today.

## Privacy, in plain words

- **Everything stays on this device.** No account, no tracking, no AI. Nothing leaves the phone unless you export or sync.
- **Plain backup:** a readable JSON file. Keep it somewhere private.
- **Encrypted backup:** opens only with your passphrase. Nobody can recover it for you.
- **Sync is optional and end-to-end encrypted.** The phone locks the data with your passphrase (AES-256-GCM, key from PBKDF2) *before* sending it. The server keeps one locked copy it can't read.
- **App lock (PIN)** hides the screen from people nearby. It does **not** encrypt the data on the device.
- **Erase** removes Anchor's data from this device only. A synced copy on the server stays.

## Your starting data

This repo is public and the first-run seed ships in the app's code, so the seed is generic: a few bet names, empty funnel rows and one Heavy item. It has no hypotheses, thresholds, prices or real numbers.

Your real starting numbers live in a **private start file** that never goes into the repo. It's an ordinary Anchor backup (the same JSON that *Download backup* makes), so you can build it once on any device and reuse it.

1. Keep the file somewhere only you can reach, for example iCloud Drive, or AirDrop it to your phone.
2. In Anchor, open **Settings → Import a backup** and pick the file (from **Files** on iPhone).
3. Check the preview of what will change, then tap **Replace**. Your PIN and sync settings stay.

An encrypted backup imports the same way; Anchor asks for its passphrase first.

## Turn on sync (optional)

1. In Vercel, open **Project → Settings → Environment Variables** and add `ANCHOR_SYNC_TOKEN`, set to a long random string (for example from `openssl rand -base64 32`). Redeploy. Sync uses the Turso database the site already has (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`) and creates its table on first use.
2. On your phone: **Settings → Sync**. Enter the token and a passphrase you'll remember, then tap **Push**.
3. On another device: same token and passphrase, then **Pull**.

If both devices changed, Anchor asks which copy to keep. Without `ANCHOR_SYNC_TOKEN`, `/api/anchor/vault` answers 503 and everything else keeps working on the device.

## Run it locally

```sh
npx astro dev          # then open http://localhost:4321/anchor/
```

## Tests

```sh
npm run test:anchor                                 # unit tests (node --test, nothing to install)
npx astro build                                     # production build
npx playwright test -c playwright.anchor.config.ts  # end-to-end, iPhone-size screen
```

The end-to-end tests set the page clock to a fixed weekday morning in Bangkok and move it when a test needs another time, so they give the same result at any hour.

The original spec and screenshots are kept private, outside git.
