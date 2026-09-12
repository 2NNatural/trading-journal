# Personal journal web shell

This is the first Vercel-compatible UI for the private journal. It uses the initial hand-entered trade notes and browser `localStorage` so the thesis timeline can be exercised before Supabase is connected. Entries without a recorded exit are treated as open; the imported legacy holdings at the bottom are marked for a hold thesis. No wallet credentials or live transaction data are bundled here.

Run it locally from the repository root:

```sh
npm run web:dev
```

Then open `http://localhost:3000`. The Vercel project should use the repository root and the checked-in `vercel.json`; it serves `web/` as the static output and exposes `/api/health` as a smoke-test function.
