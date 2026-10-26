# Study Planner

A personal study planner. Design your own curriculum and schedule, then open
each day and follow it: tasks, resources, notes and progress in one place.

Live: <https://protein-design-study-guide.vercel.app>

## Demo

https://github.com/user-attachments/assets/c416e1fb-622e-420a-a8d8-8c9becd89231

## Features

- **Today:** check off tasks, open resources, write Markdown notes, complete or
  move sessions.
- **Planner:** month, week and agenda views. Drag sessions from the backlog
  onto the calendar, and see planned time against your daily capacity.
- **Curriculum:** goals, tracks, topics, optional stages and readiness
  checkpoints, plus reusable session templates.
- **Resources:** a shared library. Each session can be assigned its own
  portion, such as a chapter or a timestamp.
- **Progress:** completed work, a heatmap, and the checkpoints you've marked
  achieved. No invented mastery scores.
- An optional **AI/ML for Protein Design** starter template.
- Undo, light and dark themes, and JSON/Markdown export and import.

## Run locally

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # 82 tests
```

With no configuration, data is saved in your browser, with no account needed.
Download a backup now and then from **Settings → Backups and data**.

## Cloud sync (optional)

To sync across devices with a Supabase account:

1. Create a Supabase project and run both files in `supabase/migrations/`, in
   order, in the SQL Editor.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, in
   `.env.local` locally or in your host's settings. The `NEXT_PUBLIC_…` names
   added by the Vercel Supabase integration also work.
3. In Supabase **Authentication → URL Configuration**, set the Site URL and add
   `https://<your-site>/**` and `http://localhost:5173/**` as redirect URLs.
4. Create your account, then turn off **Allow new users to sign up**.

Every table uses row-level security, so you can only see your own data. Never
use the secret or service-role key; the app refuses it.

Free Supabase projects pause after a week of inactivity (resume them from the
dashboard) and don't include automatic backups.

## Deploy

The app is a static Vite build (`npm run build` → `dist/`). On Vercel or
Cloudflare Pages, import the GitHub repo. Each push to `main` redeploys.
`vercel.json` and `public/_headers` handle routing and security headers.
