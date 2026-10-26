# Study Planner

A personal study planner. You design the curriculum and the schedule; the
planner makes each study day easy to open and follow.

- **Planning:** goals, tracks, topics and subtopics, optional stages with
  readiness checkpoints, a backlog of sessions, reusable templates,
  month/week/agenda calendars, and a weekly planning view.
- **Studying:** a focused Today view with tasks, resources, notes, completion
  and "move or defer" controls.
- **Data:** saved automatically and privately in your browser. There's no
  account, no server, and nothing is sent anywhere. Download a JSON backup now
  and then; the app reminds you every couple of weeks.
- **Optional:** if you ever want sign-in and sync across devices, it can use
  your own Supabase database instead (§2). You don't need this for personal use.

Stack: React 19, TypeScript, Vite, Tailwind CSS 4, Radix primitives
(shadcn-style), lucide icons, dnd-kit, react-markdown, zod and supabase-js. The
app builds to static files; there is no custom backend.

---

## 1. Use it (no account needed)

Requires Node 20.19+ or 22+ (developed on Node 24).

```bash
npm install          # first time only
npm run dev          # then open http://localhost:5173
```

That's all. Your plan, notes and progress are saved in this browser as you go,
and they're still there after you close the browser or restart the computer.

Good to know:

- **Use the same address and browser every time.** Browsers keep data per
  address, so `http://localhost:5173` and `http://localhost:4173` each have
  their own separate, empty planner. A different browser also starts empty.
- **Back up occasionally.** Use **Settings → Backups and data → Export full
  backup**, or the reminder bar at the top. The backup file is also how you
  move your plan to another computer: export it on one and import it on the
  other.
- **Clearing this site's data in browser settings deletes the planner.**
  Restore it from a backup.
- Settings → Backups and data → **Advanced** has *Simulate save failures* (for
  testing only) and *Delete all data*.

If you'd rather open it from a bookmark without running `npm run dev`, you can
deploy it as a free static site without configuring anything (§3). It then
stores data in the browser at that site's address.

Other commands:

```bash
npm test             # 82 unit + database tests (Vitest; SQL runs in PGlite)
npm run typecheck
npm run build        # static output in dist/
npm run preview      # serve dist/ at http://localhost:4173
```

## 2. Optional: Supabase (sign-in and sync across devices)

Skip this section unless you want accounts and cloud sync. Without it the app
runs fully in local mode.


1. **Create a project** at <https://supabase.com/dashboard>. The free plan is
   enough (see §5).
2. **Run the migrations**, in order, in **SQL Editor → New query**. Paste and
   run each file:
   1. `supabase/migrations/20261026000001_init.sql`
   2. `supabase/migrations/20261026000002_replace_user_data.sql`

   If you use the Supabase CLI instead: `supabase link --project-ref <ref>`,
   then `supabase db push`.

   The migrations:
   - create 14 tables
   - enable RLS on every table, with select/insert/update/delete policies
     limited to `user_id = auth.uid()`
   - add explicit `GRANT`s, which Supabase now requires for new tables
   - revoke access from `anon`
   - add the import RPC
3. **Get the browser keys** from **Project Settings → API Keys** (or the
   **Connect** dialog). Copy the **Project URL** and the **publishable key**
   (`sb_publishable_…`). Never use the secret or service-role key in this app.
   The build refuses `sb_secret_…` keys.
4. **Create `.env.local`:**
   ```bash
   cp .env.example .env.local
   # then fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
   ```
   The legacy `anon` key also works if you set `VITE_SUPABASE_ANON_KEY` instead.
5. **Configure Auth** in **Authentication**:
   - **Sign In / Providers → Email:** enabled. "Confirm email" is on by default
     on hosted projects. Keep it on; new users confirm by email before signing
     in.
   - **URL Configuration → Site URL:** your production URL, for example
     `https://study-planner.pages.dev`. Confirmation and reset emails use it.
   - **URL Configuration → Redirect URLs:** add every origin you'll use.
     `**` matches any path.
     ```
     http://localhost:5173/**
     http://localhost:4173/**
     https://<your-production-domain>/**
     https://*-<your-vercel-team-slug>.vercel.app/**     # Vercel previews, if used
     ```
     Password reset redirects to `/reset-password`. Sign-up confirmation
     redirects to `/`.
   - **Email sending:** the built-in mail service is limited to **2 emails per
     hour**, and only to addresses that are members of your Supabase
     organization. That is fine for your own account. For anyone else, set up
     custom SMTP (**Authentication → Emails → SMTP Settings**).
6. **Restart** `npm run dev`. You'll see the sign-in screen instead of opening
   straight into the planner.
7. **Keep it private (single user):** after creating and confirming your own
   account, go to **Authentication → Sign In / Providers** and turn off **Allow
   new users to sign up**. Others couldn't see your data anyway (RLS), but this
   stops strangers who find the URL from creating accounts.
8. **Bring over local data:** in the old local version, use Settings → Export
   full backup. After signing in to the new version, choose **Restore from a
   backup** on the setup screen.
9. **Free-plan pausing:** a free project pauses after a week with no requests.
   Regular use keeps it awake. If it pauses, resume it from the Supabase
   dashboard; the data is kept.

## 3. Deploy

The build output is a static single-page app in `dist/`.

- **Local mode** (no account): deploy as-is and **skip the environment-variable
  steps below**. Each browser that opens the site keeps its own private copy.
- **With Supabase:** set the two `VITE_…` variables in the host's dashboard.
  Vite inlines them at **build time**, so redeploy after you change them. Also
  add the deployed origin to Supabase Redirect URLs (§2.5).

### Cloudflare Pages

1. **Workers & Pages → Create → Pages → Connect to Git**, then pick the repo.
2. Build settings:
   - Framework preset: **React (Vite)**
   - Build command: `npm run build`
   - Output directory: `dist`
3. **Settings → Environment variables:** set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` (Production, and Preview if wanted). Then
   redeploy.
4. SPA routing works without extra config. With no top-level `404.html`, Pages
   serves `/` for unknown paths. Security headers come from `public/_headers`.

Cloudflare now suggests Workers Static Assets for new projects. Pages still
works. To use Workers instead, deploy `dist/` with `wrangler.toml`:
`[assets] directory = "./dist/"` and
`not_found_handling = "single-page-application"`.

### Vercel

1. **Add New → Project**, then import the repo. The framework is detected as
   Vite.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` under
   **Settings → Environment Variables**, then deploy.
3. `vercel.json` sets the SPA rewrite to `/index.html` and the security headers.

### Content Security Policy

`vercel.json` and `public/_headers` set a strict CSP: scripts only from the same
origin, network only to `*.supabase.co`. I checked the production build under
this CSP with no violations. If you use a **custom Supabase domain**, add it to
`connect-src` in both files.

## 4. What to verify with your own Supabase project

I couldn't run these without your credentials. Everything else was checked in
demo mode and by automated tests (§6).

| # | Check | How |
|---|-------|-----|
| 1 | Sign-up, confirm, sign-in | Create an account, click the email link, sign in. |
| 2 | Password reset | "Forgot password?", then the email link, which should open **Choose a new password**. |
| 3 | Persistence | Set up a workspace, check a task, write a note. It should show **Saved**. Refresh and restart the browser; all of it remains. |
| 4 | Cross-device | Sign in from another browser or device. You see the same data. |
| 5 | Per-user isolation | Create a second account in a private window. It sees an empty workspace. Optionally, in SQL Editor run `select user_id, count(*) from sessions group by 1;` to confirm the rows are separate. |
| 6 | Note conflict | Open the same session on two devices. Edit and save on A, then edit on B **without refocusing B's tab first**. B shows "changed on another device" with Keep mine / Use other / Keep both. |
| 7 | Save failure | Go offline (devtools → Network → Offline). Edit: the status shows "not saved" with Retry, and the note says "kept in this browser". Go online, Retry, and it reaches **Saved**. |
| 8 | Backup round trip | Settings → Export full backup. Then Import it as **Merge**: the preview should show 0 added / 0 updated. |
| 9 | Sign-out | Settings → Account → Sign out. Your data stays in the cloud, and local note drafts for that account are cleared. |

## 5. Hosting cost: current free-tier limits

Checked against official docs on **2026-10-26**. Verify again before relying on
them.

- **Supabase Free** (<https://supabase.com/pricing>):
  - per project: 500 MB database, 50,000 monthly active users, 5 GB egress
  - 2 active free projects
  - **projects pause after 1 week of inactivity**
  - **no automatic backups on Free**, so use the app's JSON export
  - built-in auth email limited to 2/hour, organization members only
- **Cloudflare Pages Free** (<https://developers.cloudflare.com/pages/platform/limits/>):
  - 500 builds/month, 20,000 files, 25 MiB per file
  - static requests are free and unlimited
- **Vercel Hobby** (<https://vercel.com/docs/plans/hobby>):
  - 100 GB fast data transfer, 1M CDN requests per month
  - **non-commercial personal use only**

A personal planner's data is a few MB at most, far below these limits.

## 6. Automated tests

`npm test` runs 82 tests:

- **Database (real Postgres via PGlite):**
  - RLS isolation, insert spoofing and owner reassignment blocked, anonymous
    access denied
  - cross-user foreign keys rejected
  - notes survive session deletion
  - note version bumps
  - recurrence uniqueness
  - import RPC replaces only the caller's data and rolls back on bad input
- **Completion rules:** required vs optional tasks, explicit completion, skipped
  never counts, complete / partial / optional-only / rest days, reopen
  detection.
- **Moving:** history recorded, nothing duplicated, notes, tasks and resources
  preserved, undo restores exactly, bulk shift skips finished work, capacity
  conflicts.
- **Sessions:** duplicate (tasks unchecked, resources linked, notes only on
  request), split, move a task (state kept), template edits never rewrite
  sessions, delete keeps notes.
- **Recurrence:** range-limited, idempotent even after moves. The three edit
  scopes are tested: one occurrence, future unfinished occurrences, and the
  template only. Completed history never changes, and detached occurrences are
  protected.
- **Saving:** "Saved" only after confirmation, drafts survive a failure and a
  reload, conflicts detected rather than overwritten, the outbox pauses and
  retries in order.
- **Backups:** export to import round trip is identical; invalid files,
  duplicate IDs and `javascript:` URLs are rejected; dangling references are
  repaired; merging twice adds no duplicates; remapping IDs for another
  account keeps every relationship; restored notes get a higher version.
- **Keys:** secret and service-role keys are refused by the browser build.
- **Dates:** DST and month boundaries, "today" taken from the configured
  timezone, ISO weekdays.

## 7. How it works

- **Data model:**
  - curriculum: `goals`, `tracks`, `topics` (with `parent_id`, `track_ids[]`,
    `goal_ids[]`, `stage_id`), `stages`, `checkpoints`
  - work: `session_templates`, `sessions`, `tasks`, `resources`,
    `session_resources` (holds the assigned portion and its own done flag),
    `notes` (linked to a session, topic or date)
  - calendar: `blocks` (placement only: date, optional time, duration,
    required, optional session), `recurring_blocks`, `settings`
- **Placement is separate from content.** Moving a block never touches its
  session, so tasks, notes, resources and progress always travel with it. Each
  block keeps a `history` of previous dates.
- **Templates are copied, never linked.** A session made from a template, a
  topic or a duplicate is an independent copy.
- **Recurring occurrences are created as real rows** with the unique key
  `(recurrence_id, occurrence_date)`. Generation is explicit, previewed and
  idempotent, so completed history can't be rewritten.
- **Dates are calendar dates** (`date` / `'YYYY-MM-DD'`). Arithmetic is
  UTC-only on those strings. Only "today" depends on the configured timezone.
  Optional start times are wall-clock times in that timezone.
- **Saving:**
  - Every change is a list of row-level `Change` records with before-images,
    applied optimistically, sent in order through an outbox that pauses on
    failure, and inverted for undo.
  - Notes save separately with `UPDATE … WHERE version = n` and keep a local
    draft until the server confirms.
  - Data reloads when the tab regains focus, but never while changes are
    unsent.
- **Imports:** merge or replace both go through one `replace_user_data` RPC in
  a single transaction, so a failed import changes nothing. A merge is computed
  against data freshly loaded from the server. A backup from another account is
  offered as a copy with new IDs.
- **Security:**
  - RLS plus composite `(id, user_id)` foreign keys, so a row can't reference
    another user's records.
  - Raw HTML in notes is never rendered.
  - Only `http(s)` links become clickable.
  - Strict CSP.

## 8. Limitations (version 1)

- **No offline mode.** Changes made offline are kept in memory and retried. A
  warning appears if you try to close the tab, but unsent changes other than
  note drafts are lost if the tab is closed anyway.
- **Conflicts:** detection covers **note text** only. Other fields (task
  checks, titles, moves) are last-write-wins between devices. Data refreshes
  when a tab regains focus, which keeps that window small.
- **Realtime:** no live push. Another device's changes appear on focus or
  reload.
- **Undo:** only the most recent change can be undone, and only in the current
  tab.
- **Drag-and-drop:** works in the desktop week view. Agenda and mobile views
  use the Move / reorder menus, which are also the keyboard-accessible route.
- **Recurring occurrences:** a deleted occurrence is recreated if you generate
  occurrences again for that date. The preview lists every date before
  anything is added, so you can narrow the range. Alternatively, keep the
  occurrence and mark it skipped and optional.
- **Resources:** links and references only. No uploads, scraping or metadata
  lookup.
- **Bundle size:** about 330 KB gzipped in one chunk, with no code-splitting
  yet.
