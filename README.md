# FindBack — AI-assisted Lost & Found

## 1. Project overview

FindBack is a full-stack web app for a college campus. Students report items they **lost** or **found**. A deterministic matching engine compares lost and found reports and suggests likely pairs. Each suggestion has a **score (0–99%)**, reasons such as "Same brand: Apple" and "Found 1 day after it was lost", and a breakdown for each of six signals.

A match is only a **suggestion**. Ownership is verified when the owner submits a **claim with proof** and the finder **approves** it; approving marks the item **Returned**.

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, JavaScript, Tailwind CSS v4, React Router 7 |
| Python backend | Python 3.11+, FastAPI, Pydantic v2, httpx, pytest |
| Database & auth | Supabase: PostgreSQL with Row Level Security, Supabase Auth, Supabase Storage |

---

## 2. Connect to Supabase in one command

**Status (9 Oct 2026):** your Supabase project **FindBack** exists, but it is **not yet verified as connected**. The command below does the setup *and* the real connection check. Nothing has been deployed or pushed to GitHub.

Open **Terminal** and run:

```bash
cd ~/Desktop/FindBack
npm run setup:supabase
```

It walks through 8 steps and stops with a clear message if anything goes wrong. It is safe to run again.

| Step | What happens | What you do |
|---|---|---|
| 1 | Checks Node.js 20+ | (install from nodejs.org if asked) |
| 2 | `npm install`, which also installs the **Supabase CLI** into the project (`node_modules/.bin/supabase`; no admin rights needed) | — |
| 3 | `supabase login` | **Your browser opens: log in to Supabase and approve** |
| 4 | Finds the project named "FindBack" | — |
| 5 | `supabase link` | **Type your database password** (Dashboard → Project Settings → Database lets you reset it) |
| 6 | `supabase db push`: creates all 4 tables, functions, triggers, RLS policies and the `item-images` photo bucket from `supabase/migrations/` | — |
| 7 | Writes `.env` with the project URL + **publishable key only** (the secret key is never written) | — |
| 8 | Checks "Confirm email", runs `npm run check:db` (real connection test), loads demo data (`npm run seed`) and runs `npm run build` | **If asked, turn off "Confirm email"** using the link it prints |

When it finishes with **"✅ FindBack is connected to Supabase project …"**, run `npm run dev` and open http://localhost:5173. The footer then shows **"Live database · Supabase connected"**.

**Demo accounts created by `npm run seed`** (password `FindBack@2026`):

| Email | Name |
|---|---|
| demo@findback.app | Demo Student |
| priya@findback.app | Priya Sharma |
| arjun@findback.app | Arjun Mehta |
| neha@findback.app | Neha Patel |

The seed creates real rows in **every table**:
- **15 reports** with every field filled in, each with a photo uploaded to Storage;
- **3 ownership claims**: 2 pending, and 1 approved through `decide_claim()`, which marks its item Returned;
- **saved suggested matches**;
- **notifications** created by the database triggers.

Use `npm run seed -- --reset` to delete and rebuild the demo data; it touches only rows owned by the demo accounts.

**Python tests (optional):**

```bash
cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt && pytest
```

---

## 3. Architecture

```
 Browser (React app, http://localhost:5173)
   │  1. login, reports, photos, claims, notifications
   │     supabase-js + PUBLIC publishable key + the user's login token
   ├──────────────────────────────────────────────►  Supabase
   │                                                  ├─ Auth (bcrypt passwords, JWT sessions)
   │  2. "recalculate matches for my report"          ├─ PostgreSQL: items, claims, matches, notifications
   │     sends the user's login token                 │    Row Level Security on every table
   ▼                                                  │    save_matches(), decide_claim(), triggers
 Python API  (FastAPI, http://localhost:8000)         └─ Storage bucket item-images
   ├─ GET  /api/health          status (?deep=true pings Supabase)
   ├─ POST /api/match           score a report against candidates (no database)
   └─ POST /api/items/{id}/refresh-matches
        a. asks Supabase Auth who the token belongs to
        b. reads the report + open candidates  ──── as that user (RLS applies)
        c. scores them with app/matching.py
        d. saves via save_matches()  ────────────── as that user (DB re-checks ownership)
```

**Design decisions**
- **Supabase stays the only database.** Python adds the matching service; it doesn't replace any storage. All persistent data lives in PostgreSQL.
- **The Python API holds no secret key.** It uses the public publishable key plus the *caller's* own token. So PostgreSQL Row Level Security applies to Python exactly as it does to the browser, and a user can't use the API to change someone else's data.
- **Two identical engines.** `backend/app/matching.py` (Python) is an exact port of `src/lib/matching.js` (browser). Automated parity tests check 120 report pairs, 22 ranked lists and 7 text cases in **both** languages. If the Python service isn't running, the app uses the browser engine, gets the same scores, and says so.
- **The frontend calls Supabase directly** for everything else (reports, claims, photos). That was already secure through RLS, so it wasn't rewritten.

---

## 4. Frontend setup

You need **Node.js 20+** (`node -v`; install the LTS version from nodejs.org if needed).

```bash
cd ~/Desktop/FindBack
npm install
npm run dev               # http://localhost:5173
```

The footer always shows:
- **the database:** "Demo mode", "Live database · Supabase connected", or "not reachable";
- **the matching engine:** "Python API 1.0.0 online", "Python API offline · using in-browser engine", or "in-browser engine".

---

## 5. Python backend setup

You need **Python 3.11 or newer** (`python3 --version`). If you have an older version, install Python 3.12 from python.org.

```bash
cd ~/Desktop/FindBack/backend
python3 -m venv .venv                 # one-time: create a virtual environment
source .venv/bin/activate             # every new Terminal window
pip install -r requirements-dev.txt   # FastAPI, Uvicorn, Pydantic, httpx, pytest
uvicorn app.main:app --reload --port 8000
```

- Open **http://localhost:8000/docs** for interactive API documentation, where you can try every endpoint in the browser.
- To make the React app use it, add `VITE_MATCHING_API_URL=http://localhost:8000` to `.env` and restart `npm run dev`.
- The API reads the Supabase URL and publishable key from the **same `.env`**, so there's nothing extra to configure. Without them it runs in demo mode: `/api/match` works, and the database endpoint returns 503.

Example call (works without Supabase):

```bash
curl -X POST http://localhost:8000/api/match -H "Content-Type: application/json" -d '{
  "item": {"id":"L1","type":"lost","title":"Black iPhone 13 blue case","category":"Electronics","color":"Black","brand":"Apple","location":"Library 2nd floor","date":"2026-10-01"},
  "candidates": [{"id":"F1","type":"found","title":"Black Apple phone in blue cover","category":"Electronics","color":"Black","brand":"Apple","location":"Library","date":"2026-10-02"}]
}'
```

The response contains `"result_type": "suggested_matches"`, a `disclaimer`, and for each match the `score`, `label`, `reasons`, `breakdown` and `"verified_ownership": false`.

---

## 6. Supabase setup (exact steps)

**Recommended: `npm run setup:supabase`** (see §2). It uses the Supabase CLI and the migration in `supabase/migrations/`.

**Alternative without the CLI** (dashboard only):

1. **New project** at supabase.com. This is already done: your project is "FindBack".
2. **Create the database.** Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, click **Run**, and expect "Success. No rows returned". It creates:
   - the tables `items`, `claims`, `matches` and `notifications`, with RLS;
   - the functions `save_matches()` and `decide_claim()`, and the triggers;
   - the Storage bucket **`item-images`** (public read, 2 MB, JPEG/PNG/WEBP) and its policies.

   It is safe to run again.

   If you see **WARNING: FindBack: could not create storage policies**, the tables were still created. Add the three photo rules in **Storage → Policies → item-images → New policy → For full customization**, each with target role `authenticated`:
   - **INSERT** `findback: upload own item images`:
     `bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text and lower(storage.extension(name)) in ('jpg','jpeg','png','webp')`
   - **SELECT** `findback: read own item images`:
     `bucket_id = 'item-images' and (storage.foldername(name))[1] = auth.uid()::text`
   - **DELETE** `findback: delete own item images`: same definition as SELECT
3. **Authentication → Sign In / Providers → Email:** Email on, and turn **"Confirm email" off** for demos.
4. **Keys:** **Project Settings → API Keys**. Use the **Project URL** and the **publishable** key (`sb_publishable_…`) or the legacy **anon public** key. ⚠️ Never use the `secret` / `service_role` key.
5. **`.env`:** copy `.env.example` to `.env` and fill in the values (see §7).
6. **Verify:** `npm run check:db` must print "All checks passed — FindBack is connected to Supabase."
7. **Deploying later:** add the same variables in the hosting dashboard, and set **Authentication → URL Configuration → Site URL** to the deployed address.

---

## 7. Environment variables

All of them go in **one file**, `.env`, in the project root. `.env` is git-ignored.

| Variable | Used by | Value |
|---|---|---|
| `VITE_SUPABASE_URL` | frontend + Python API | Base Project URL, e.g. `https://abcd1234.supabase.co` (a pasted `/rest/v1` is removed automatically) |
| `VITE_SUPABASE_ANON_KEY` | frontend + Python API | Publishable key (`sb_publishable_…`) or legacy anon key. `VITE_SUPABASE_PUBLISHABLE_KEY` is also accepted |
| `VITE_MATCHING_API_URL` | frontend | Optional. `http://localhost:8000` to use the Python matching service; leave empty for the in-browser engine |

Optional `backend/.env` (see `backend/.env.example`). These override the values above for the Python API only:

| Variable | Default | Meaning |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | taken from the root `.env` | Same meaning as above |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` (plus the matching `:4173` addresses for `vite preview`) | Exact browser origins allowed to call the API; `*` is refused |

**Safety checks**
- The Python API **refuses to start** with a secret or service_role key.
- `npm run check:db` refuses one too.
- `npm test` scans the frontend code for secret keys.

---

## 8. Database design (`supabase/schema.sql`)

| Table | What it stores | Who can read | Who can write |
|---|---|---|---|
| `items` | Lost/found reports: type, title, description, category, colour, brand, approximate location, date, photo URL and path, status, `user_id`, public short name ("Asha V."), timestamps | everyone | only the author; owner and type can't be changed |
| `claims` | Ownership claims: proof message and contact (**private**), pending / approved / rejected status, the finder's reply | only the claimant and the item's reporter | claimant inserts; decisions **only** through `decide_claim()` by the item owner |
| `matches` | **Suggested** matches: lost item, found item, score, reasons, breakdown. One row per pair | everyone (made only from public report data) | **only** through `save_matches()` for your own report |
| `notifications` | Per-user inbox: new claim, claim decision, strong suggested match | only that user | created only by triggers; the user can mark them read or delete them |
| Storage `item-images` | Photos at `<user id>/<file>.jpg` | public link | own folder only; images only; 2 MB max |

`save_matches()` re-checks every pair:
- the two reports are of opposite types;
- both are still open;
- they belong to different people;
- the score is between 35 and 99.

It updates pairs that already exist instead of duplicating them, and removes stale ones. `decide_claim()` approves or rejects in one transaction. Triggers validate dates and photo paths, clear stale matches, and create notifications.

---

## 9. The matching engine (Python and JavaScript, identical)

1. **Normalise the text.** Lower-case it, remove punctuation and stop-words, stem words, and map synonyms to one word (*mobile / iPhone / smartphone → phone*).
2. **Compare descriptions.** Title (counted twice), description and brand become word-frequency vectors, compared with **cosine similarity**.
3. **Add signals with weights:**

   | Signal | Weight |
   |---|---|
   | Description | 35% |
   | Category | 20% |
   | Location overlap | 15% |
   | Date gap | 13% |
   | Colour (exact = full credit, same colour family = 60%) | 12% |
   | Brand | 5% |

4. **Score** from 0 to 99:
   - 75 or above: Strong match
   - 55 or above: Good match
   - 35 or above: Possible match
   - below 35: not stored
5. **Return** every result labelled **suggested**, with `verified_ownership: false`.

It is deterministic: the same input always gives the same score, there is no randomness, and it makes no external AI calls, so no AI API key exists anywhere.

---

## 10. Security & privacy

**Passwords:** handled by Supabase Auth (bcrypt). Demo mode keeps only salted hashes in the browser.

**Keys:** only the public publishable/anon key is used, by both the frontend and the Python API. There is no service-role key anywhere, and the code refuses one.

**Python API**
- Identity is checked by **Supabase Auth** (`/auth/v1/user`).
- Every database call uses the caller's token, so RLS applies.
- CORS allows only the exact frontend origins.
- Input is validated by Pydantic: types, lengths, limits, and unknown fields rejected.

**Private data**
- Claim contact details and proof are visible only to the claimant and the item's reporter.
- Public listings show only a short name.
- Photos are re-encoded, which strips GPS/EXIF data.

**Validation:** in the form, in Pydantic (API), and in PostgreSQL (CHECK constraints, triggers, RLS).

---

## 11. Test commands

| Command | What it runs | Where |
|---|---|---|
| `npm test` | 23 JavaScript unit tests: matching, search, security, JS↔Python parity, setup helpers, demo photos | project root |
| `npm run setup:supabase` | One-command Supabase setup, including the connection check (§2) | project root |
| `npm run seed` | Loads demo data into the real database (§2) | project root |
| `cd backend && pytest` | 45 Python tests: engine, parity, config safety, Supabase client, API endpoints, CORS. Plus 5 integration tests, skipped by default | backend/ (venv active) |
| `FINDBACK_IT_SUPABASE_URL=… FINDBACK_IT_SUPABASE_KEY=… pytest -m integration` | Python API against a real Supabase-compatible database. Creates 2 test accounts; needs "Confirm email" off | backend/ |
| `npm run check:db` | Read-only check of your real Supabase project | project root |
| `npm run build` | Production build | project root |
| `psql -d testdb -f supabase/tests/00_mock_supabase_env.sql -f supabase/schema.sql -f supabase/tests/01_rls_security_tests.sql` | 76 database security tests on a local PostgreSQL | project root |
| `node tests/e2e/findback.e2e.mjs` | 22 browser flows in demo mode (needs Playwright and `npm run dev`) | project root |

**`TESTING.md` lists exactly which tests were executed, where, and which were not**, including those that need your Mac or your Supabase project.

---

## 12. Demo-mode limitations

Without `.env`, FindBack runs in a clearly labelled **demo mode**: a yellow banner and footer note say "data saved in this browser only". In demo mode:

- **Data stays in this browser.** It isn't shared with other people or devices, and clearing browser data removes it. "Reset demo data" restores the samples.
- **Rules are checked by the app's JavaScript, not the server.** Someone using the browser's developer tools could bypass them. Live mode enforces the same rules in PostgreSQL.
- **Photos are stored inside the browser,** not in Supabase Storage.
- **Accounts are local demo accounts** (password `demo1234`), not Supabase Auth. Passwords are kept only as salted hashes.
- **The Python API can still score matches** (`/api/match`), but its database endpoint returns 503 because there is no database to write to.

---

## 13. Evaluator demonstration script (about 7 minutes)

1. **Architecture (1 min).** Show §3 and the footer: "Live database · Supabase connected" and "Matching: Python API online".
2. **Python API (1 min).** Open http://localhost:8000/docs. Run `POST /api/match` with the example from §5 and point out:
   - the score, label, reasons and six-signal breakdown;
   - `verified_ownership: false` and the disclaimer.
3. **Report lost (1 min).** (Or log in as `demo@findback.app` / `FindBack@2026` to start from the seeded data.) Log in as user A and report a lost "Black iPhone 13 with blue case", Library, with a photo. Show the row in **Supabase → Table Editor → items** and the photo in **Storage → item-images**.
4. **Report found (1 min).** In a private window, sign up as user B and report a found "Black Apple smartphone in blue cover". The suggested match appears. Click **Recalculate**: the message says "· Python matching service". Show the row in **Table Editor → matches**.
5. **Claim (1.5 min).** User A sees the bell notification, opens the match and submits a claim with proof. User B approves it with pickup details, and the item shows **Returned · Ownership verified ✓**.
6. **Security (1 min).**
   - A third user can't see the claim or edit others' reports.
   - Stop the Python API: the app keeps working with the in-browser engine and says so.
   - Show `supabase/schema.sql` (RLS) and `backend/app/supabase_client.py` (the user's token, never a service key).
7. **Tests (0.5 min).** Run `npm test` and `cd backend && pytest`, and show `TESTING.md`.

---

## 14. Deploying (not done; needs your approval and login)

- **Frontend:** `vercel.json`, `netlify.toml` and `public/_redirects` are ready. Run `npx vercel --prod` and log in when asked. Add the `VITE_*` variables in the Vercel dashboard.
- **Python API:** any Python host (Render, Railway, Fly.io) running `uvicorn app.main:app --host 0.0.0.0 --port $PORT` with root directory `backend/`. Set `CORS_ORIGINS` to the deployed frontend address, and set `VITE_MATCHING_API_URL` to the API's address.

---

## 15. Project structure

```
FindBack/
├── src/                         React frontend
│   ├── lib/api.js               ALL data access (Supabase live mode / demo mode) + Python API client with fallback
│   ├── lib/matching.js          matching engine (browser)
│   ├── lib/supabase.js · images.js · password.js · demoData.js · utils.js · constants.js
│   ├── components/ · pages/ · context/
├── backend/                     Python API (FastAPI)
│   ├── app/main.py              endpoints, CORS
│   ├── app/matching.py          matching engine (Python, identical to matching.js)
│   ├── app/schemas.py           Pydantic request/response models
│   ├── app/supabase_client.py   Supabase Auth + REST calls with the user's token
│   ├── app/services.py · config.py
│   ├── tests/                   pytest suite + fixtures/matching_parity.json
│   └── requirements.txt · requirements-dev.txt · .env.example · pytest.ini
├── supabase/migrations/         the same schema as a Supabase CLI migration (npx supabase db push)
├── supabase/config.toml         minimal Supabase CLI config
├── supabase/schema.sql          complete database (paste into the SQL Editor if you don't use the CLI)
├── public/demo-photos/          11 item photos (used in demo mode and uploaded by the seed)
├── scripts/setup-supabase.sh    npm run setup:supabase (CLI login, link, db push, .env, check, seed, build)
├── scripts/seed-demo-data.mjs   npm run seed (demo accounts, reports + photos, claims, matches)
├── scripts/supabase-helpers.mjs picks ONLY the publishable key for .env
├── supabase/tests/              76 database security tests
├── scripts/check-supabase.mjs   npm run check:db
├── scripts/generate-parity-fixtures.mjs   npm run gen:parity
├── tests/                       JavaScript unit tests + e2e/
├── TESTING.md · README.md · .env.example · package.json
```

---

## 16. Troubleshooting

| Problem | Fix |
|---|---|
| `npm: command not found` | Install Node.js LTS from nodejs.org |
| `python3 --version` is below 3.11 | Install Python 3.12 from python.org, then recreate `.venv` |
| `ModuleNotFoundError: fastapi` | Activate the virtual environment (`source backend/.venv/bin/activate`), then `pip install -r requirements-dev.txt` |
| API says "Refusing to start: a SECRET / service_role key" | You put the wrong key in `.env`. Use the publishable key, and rotate the secret key in Supabase |
| Footer says "Python API offline" | Start the API (§5); check that `VITE_MATCHING_API_URL` matches its port |
| Browser console shows a CORS error | Add your frontend's exact address to `CORS_ORIGINS` in `backend/.env`, then restart the API |
| Red banner "The database is not set up yet" | Run `supabase/schema.sql` in the SQL Editor |
| Sign-up says "check your email" | Turn off "Confirm email" (§6 step 3) |
| `npm run setup:supabase` says "Could not pick the project" | Run `SUPABASE_PROJECT_REF=<ref> npm run setup:supabase`; the ref is in Project Settings → General |
| `supabase link` fails | Wrong database password: reset it in Project Settings → Database, then run the setup again |
| Still in demo mode after creating `.env` | The file must be named exactly `.env` in the project root; restart `npm run dev` |
