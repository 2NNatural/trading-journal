# Deploy the private trading journal

This deployment uses:

- Vercel Hobby for the static UI and small `/api/config` function.
- Supabase Auth for sign-in.
- Supabase Postgres for journal data.
- Row Level Security so each row can only be read or changed by its owning authenticated user.

## 1. Create the Supabase project

Create a new Supabase project, then open **SQL Editor** and run these files in order:

1. `supabase/migrations/0001_journal.sql`
2. `supabase/migrations/0002_private_journal.sql`

The second migration stores hand-entered journal positions without requiring a verified token address first.

## 2. Create the only login

In **Authentication → Users**, create your account manually with your email and password.

Then in Supabase Auth settings disable public/new-user signups. The application intentionally has no sign-up UI.

For a one-person deployment, do not create any other Supabase Auth users.

## 3. Get the browser-safe Supabase credentials

From the Supabase project settings copy:

- Project URL
- Publishable key (or legacy anon key if your project still labels it that way)

Do **not** use the service-role key in the browser or Vercel client code.

## 4. Import the GitHub repo into Vercel

Import `2NNatural/trading-journal` as a Vercel project.

Use the repository root as the Root Directory. The checked-in `vercel.json` publishes `web/`.

Add these Vercel environment variables for Production and Preview:

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Redeploy after adding or changing environment variables.

## 5. Verify privacy before adding sensitive data

Open the Vercel URL in a private/incognito browser. You should see only the login screen.

After signing in, the frontend queries `journal_positions` and `journal_entries`. Both tables have RLS enabled and require `auth.uid() = user_id`.

Also verify these conditions in Supabase:

- public signups are disabled;
- there is only your intended Auth user;
- RLS is enabled on `journal_positions` and `journal_entries`;
- no service-role key exists in Vercel frontend variables, `web/`, or committed browser code.

## 6. Existing journal notes

The previous MVP embedded its starter notes directly in `web/app.js`. That is intentionally removed by this branch so deployed JavaScript no longer exposes journal contents.

Before merging, keep a copy of the old `main:web/app.js` or export any browser-only localStorage edits you made. Import those rows into `journal_positions` / `journal_entries` after your Supabase account exists. Do not move the private notes back into `web/`.

## 7. Normal use

Once deployed:

- sign in with your Supabase account;
- select a position;
- add thesis updates normally;
- updates are inserted into Supabase with your authenticated user ID;
- signing out removes access to the journal UI and subsequent database reads are blocked by RLS.

## Security model

The Vercel URL itself is public, but the journal content is not. The page shell and login form can be downloaded by anyone who knows the URL; the actual journal data lives in Supabase and is returned only to an authenticated owner under RLS.

For stronger account security, enable MFA on the Supabase account after the basic deployment is working.
