# FindBack — Test Report

What was **actually executed**, how, and what was **not** run. Last updated 9 October 2026.

## 1. Tests executed

| Suite | Command | Result | Where it ran |
|---|---|---|---|
| JavaScript unit tests (matching, search, security, JS↔Python parity, setup helpers, demo photos) | `npm test` | **23 / 23 passed** | development sandbox (Node 22) |
| One-command setup flow `scripts/setup-supabase.sh` with a fake Supabase CLI (its `db push` applied the migration to PostgreSQL) | sandbox harness | **passed**: project found among 2; login → link → push → `.env` written; **only the publishable key written, 0 secret keys**; all 4 tables and the bucket created | sandbox |
| Demo-data seed `scripts/seed-demo-data.mjs` against a Supabase-compatible server on PostgreSQL 16 | `npm run seed` | **passed**: 4 accounts, 15 reports, 15 photos in Storage (served as JPEG), 3 claims (1 approved via `decide_claim` → item Returned), 8 matches, 12 notifications. A second run duplicated nothing; `--reset` rebuilt the same data | sandbox |
| Python unit + API tests | `cd backend && pytest` | **45 passed**, 5 integration tests skipped by default | sandbox, Python 3.13 (see note A) |
| Python integration tests: API → Supabase-compatible server → PostgreSQL 16 with `schema.sql` and RLS | `pytest -m integration` | **5 / 5 passed** | sandbox (see note B) |
| Python engine parity on several Python versions | (parity script) | **0 mismatches** on 3.11, 3.12, 3.13 | sandbox |
| Database security tests (RLS, privileges, functions, triggers, storage) | `supabase/tests/*.sql` | **76 / 76 passed** (fresh install, re-run, and upgrade from the old schema) | PostgreSQL 16 |
| Demo-mode browser test (22 flows, desktop and 375 px phone) | `tests/e2e/findback.e2e.mjs` | **22 / 22 passed** (1) without Python, (2) with the Python API, (3) with the Python API stopped (fallback) | Chromium (Playwright) |
| Live-mode browser test (23 steps, each verified with SQL) | sandbox harness | **23 / 23 passed** (1) without Python, (2) with the Python API doing the recalculations | Chromium + PostgreSQL 16 |
| Browser CORS checks | sandbox harness | the frontend origin is allowed (preflight + POST); a page from another origin is **blocked** | Chromium + Uvicorn |
| Live-project check script (runs in the browser against a real project) | sandbox harness | **36 / 36 checks passed** against the mock | Chromium |
| `npm run check:db` | — | its logic was verified against a correct DB, an empty DB, a secret key and a missing `.env` | sandbox |

### What the Python tests cover (45 + 5)
- **Engine (14):** tokenising, synonyms, stemming, JavaScript-style rounding, strong vs unrelated matches, determinism and symmetry, date logic, colour families, missing fields, filtering, sorting, limits.
- **Parity (4):** all 120 lost/found pairs (score, reasons, breakdown), 22 ranked lists and 7 tokenising cases are identical to the JavaScript engine.
- **Config safety (9):** reads the shared `.env`; environment variables take priority; **refuses secret and service_role keys**; `*` refused in CORS; URL normalisation.
- **Supabase client (9):**
  - the publishable key is sent only as `apikey`, and the user's token as Bearer;
  - identity is verified with Supabase Auth;
  - network failure gives a 502;
  - a user can refresh their own report but not someone else's;
  - a resolved report clears its matches;
  - an unknown report gives a 404.
- **API (9):**
  - health (shallow, and deep with a real ping);
  - `/api/match` returns explained suggestions with `verified_ownership: false`, and returns 422 for invalid input;
  - refresh returns 503 without Supabase, 401 without a valid login, and 403 for someone else's report;
  - CORS lets in only the frontend origin.
- **Integration (5, against PostgreSQL + RLS):**
  - the ping reaches the database;
  - matches are saved, and re-saving doesn't duplicate them;
  - **the database itself** blocks saving matches for someone else's report;
  - the full HTTP endpoint works, including 401 for a forged token and 403 for a non-owner.

### Notes on the sandbox
- **A:** The sandbox could not download packages (its network policy blocks PyPI and npm). FastAPI was not installable, so the API tests ran on the real **Starlette, Pydantic 2, Uvicorn and httpx**, with a small *test-only* stand-in for FastAPI's routing layer. The stand-in is not part of the project. On your Mac, `pip install -r backend/requirements-dev.txt` installs the real FastAPI and the same tests run unchanged.
- **B:** The integration server is a stand-in for Supabase's Auth, REST and Storage that executes every request as real SQL under PostgreSQL's `anon` / `authenticated` roles. RLS, triggers and functions are therefore enforced by PostgreSQL itself. It is not the real Supabase service.
- **C:** The frontend was compiled with esbuild plus the official Tailwind v4 compiler, not with Vite, because npm packages couldn't be installed.

## 2. NOT executed (and why)

| Check | Why not | How to run it |
|---|---|---|
| The real Supabase CLI (`supabase login/link/db push`) | The sandbox cannot install software on your Mac or reach supabase.com, and login needs your browser | `npm run setup:supabase` |
| `npm run check:db` against **your** project | No `.env` yet; the sandbox can't reach supabase.co | After §2 of the README: `npm run check:db` |
| `npm run build` with the real Vite | npm blocked in the sandbox | `npm install && npm run build` on your Mac |
| `pytest` with the **real** FastAPI package | PyPI blocked | `pip install -r backend/requirements-dev.txt && pytest` |
| Integration tests against **your** Supabase project | Not configured yet; they create 2 test accounts, so they need your OK | `FINDBACK_IT_SUPABASE_URL=… FINDBACK_IT_SUPABASE_KEY=… pytest -m integration` |
| Real Supabase connectivity | Not configured | The app footer shows "Supabase connected" only after a real query succeeds |

**The app is therefore not claimed to be connected to your Supabase project yet.**

## 3. Bugs found and fixed during testing (all sessions)

- `schema.sql` failed on a brand-new database (an upgrade statement ran before the table existed). Fixed.
- `schema.sql`: on projects where the SQL Editor may not manage storage policies, the whole script would have rolled back. The storage section is now isolated and prints a clear warning instead.
- Item page race condition: a request started before the login session was restored could hide the owner's claims. Fixed.
- `check:db` sent new `sb_publishable_` keys as a Bearer token, which Supabase rejects. Fixed.
- Claim approval was three separate writes. It is now one atomic database function.
- Demo-mode passwords were stored in plain text. They are now salted hashes.
- Photos were stored in the database as data URLs. They now go to Supabase Storage.
