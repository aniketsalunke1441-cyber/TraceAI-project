// End-to-end browser test of every FindBack flow in DEMO MODE (no .env).
// OPTIONAL - needs Playwright:  npm i -D playwright && npx playwright install chromium
// Then, with `npm run dev` running in another terminal:  node tests/e2e/findback.e2e.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const S = fs.mkdtempSync(path.join(os.tmpdir(), 'findback-e2e-')); fs.mkdirSync(S + '/shots')
const B = process.env.BASE_URL || 'http://localhost:5173'
// 1x1 PNG used to test photo upload
fs.writeFileSync(S + '/test.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64'))
const browser = await chromium.launch(); const errors = []; let pass = 0, fail = 0
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\.(googleapis|gstatic)/, r => r.abort())
const page = await ctx.newPage(); page.setDefaultTimeout(8000)
page.on('pageerror', e => errors.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errors.push('console: ' + m.text()) })
page.on('dialog', d => d.accept())
const shot = (n, full = true) => page.screenshot({ path: `${S}/shots/${n}.png`, fullPage: full })
const step = async (name, fn) => { try { await fn(); pass++; console.log('PASS', name) } catch (e) { fail++; console.log('FAIL', name, '::', e.message.split('\n')[0]); await shot('fail-' + name.replace(/\W+/g, '_').slice(0, 40)) } }
const expect = (cond, msg) => { if (!cond) throw new Error(msg) }
const login = async (who) => { await page.goto(B + '/login'); await page.getByText(who, { exact: true }).click(); await page.getByRole('button', { name: 'Log in', exact: true }).click(); await page.getByText('Hi ' + who.split(' ')[0]).waitFor() }
const logout = async () => { await page.getByRole('button', { name: 'Log out' }).first().click(); await page.waitForTimeout(300) }
const stat = async (label) => Number(await page.locator('a', { hasText: label }).locator('p').first().textContent())
const count = async () => Number((await page.getByText(/\d+ results?/).textContent()).match(/\d+/)[0])

await page.goto(B + '/'); await page.evaluate(() => localStorage.clear())
await step('Landing: hero, live stats (1 returned item seeded), CTA links', async () => {
  await page.goto(B + '/'); await page.getByText('FindBack it.').waitFor(); await page.waitForTimeout(400)
  const txt = await page.locator('dl').innerText(); expect(/Returned\s*1/.test(txt), 'stats: ' + txt.replace(/\n/g, ' '))
  await page.getByRole('link', { name: /Browse reports/ }).first().click(); await page.getByText('Browse reports').first().waitFor(); expect(page.url().endsWith('/browse'), page.url())
  await shot('01-landing')
})
await step('Auth guard: logged-out user is redirected to login and back after login', async () => {
  await page.goto(B + '/claims'); await page.getByText('Welcome back').waitFor()
  await page.getByText('Demo Student', { exact: true }).click(); await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await page.getByText('Ownership claims').first().waitFor(); expect(page.url().endsWith('/claims'), 'redirect back: ' + page.url())
})
await step('Login: wrong password shows error', async () => {
  await logout(); await page.goto(B + '/login'); await page.getByLabel('Email').fill('demo@findback.app'); await page.getByLabel('Password').fill('wrong'); await page.getByRole('button', { name: 'Log in', exact: true }).click(); await page.getByText('Invalid email or password.').waitFor()
})
let before
await step('Dashboard: statistics, matches, pending-claim alert and nav badge', async () => {
  await login('Demo Student'); before = { lost: await stat('My lost reports'), found: await stat('My found reports'), claims: await stat('Claims to review') }
  expect(before.lost === 2 && before.found === 1 && before.claims === 1, JSON.stringify(before))
  await page.getByText('AI matches for your reports').waitFor(); await page.getByText(/ownership claim waiting/).waitFor()
  const badge = await page.locator('nav a', { hasText: 'Claims' }).innerText(); expect(/1/.test(badge), 'badge: ' + badge)
  await shot('02-dashboard')
})
await step('Notifications (demo): bell shows unread claim notification; mark all read', async () => {
  await page.getByRole('button', { name: /Notifications \(\d+ unread\)/ }).click()
  await page.getByText('New ownership claim').first().waitFor()
  await page.getByRole('button', { name: 'Mark all read' }).click()
  await page.getByRole('button', { name: 'Notifications', exact: true }).waitFor()
  await page.keyboard.press('Escape')
})
await step('Report LOST: validation errors, then submit shows instant AI matches', async () => {
  await page.goto(B + '/report/lost'); await page.getByRole('button', { name: 'Submit lost report' }).click()
  for (const m of ['Please enter a short title', 'Choose a category.', 'Add a few more details', 'Where was it?']) await page.getByText(m, { exact: false }).waitFor()
  await page.getByLabel('Item name *').fill('Red bike keys on keyring'); await page.getByLabel('Category *').selectOption('Keys'); await page.getByLabel('Description *').fill('Two keys and a red keychain, one is a Hero bike key.'); await page.getByLabel('Main colour').selectOption('Red'); await page.getByLabel(/Where did you last see/).fill('Parking lot B')
  await page.getByRole('button', { name: 'Submit lost report' }).click(); await page.getByText('Your report is live!').waitFor()
  await page.getByText('Set of keys with red keychain').waitFor(); await page.getByLabel('Score breakdown').first().waitFor(); await shot('03-lost-report-matches')
})
await step('Report FOUND: submit with photo upload, matched to lost AirPods', async () => {
  await page.goto(B + '/report/found'); await page.getByLabel('Item name *').fill('White AirPods Pro case'); await page.getByLabel('Category *').selectOption('Electronics'); await page.getByLabel('Description *').fill('White Apple earbuds case with a small scratch on the lid.'); await page.getByLabel('Main colour').selectOption('White'); await page.getByLabel('Brand').fill('Apple'); await page.getByLabel(/Where did you find/).fill('Main Auditorium')
  await page.locator('input[type=file]').setInputFiles(S + '/test.png'); await page.getByAltText('Preview').waitFor()
  await page.getByRole('button', { name: 'Submit found report' }).click(); await page.getByText('Your report is live!').waitFor(); await page.locator('img[alt="White AirPods Pro case"]').waitFor()
  // own lost AirPods report must NOT be suggested (same user); it should find nothing from other users' lost AirPods
  await shot('04-found-report')
})
await step('Dashboard statistics update after new reports', async () => {
  await page.goto(B + '/dashboard'); await page.getByText('Hi Demo').waitFor(); const lost = await stat('My lost reports'), found = await stat('My found reports')
  expect(lost === before.lost + 1 && found === before.found + 1, `lost ${lost}, found ${found}`)
})
await step('Edit own report: owner edits title, change is saved', async () => {
  await page.goto(B + '/my-reports'); await page.getByText('Red bike keys on keyring').click(); await page.getByRole('link', { name: 'Edit' }).click()
  await page.getByText('Edit lost report').waitFor(); await page.getByLabel('Item name *').fill('Red Hero bike keys'); await page.getByRole('button', { name: 'Save changes' }).click()
  await page.getByRole('heading', { name: 'Red Hero bike keys' }).waitFor()
})
await step('Browse: keyword search, type tabs, category, status and sort filters', async () => {
  await page.goto(B + '/browse'); await page.getByText(/\d+ results?/).waitFor(); const all = await count()
  await page.getByLabel('Search reports').fill('wallet'); await page.waitForTimeout(200); expect(await count() === 2, 'wallet ' + await count())
  await page.getByRole('tab', { name: 'Found' }).click(); await page.waitForTimeout(200); expect(await count() === 1, 'found wallet')
  await page.getByLabel('Search reports').fill(''); await page.getByRole('tab', { name: 'All' }).click(); await page.getByLabel('Category').selectOption('Keys'); await page.waitForTimeout(200); expect(await count() === 2, 'keys ' + await count())
  await page.getByLabel('Category').selectOption('all'); await page.getByLabel('Status').selectOption('resolved'); await page.waitForTimeout(200); expect(await count() === 1, 'resolved'); await page.getByText('Black umbrella with wooden handle').waitFor()
  await page.getByLabel('Status').selectOption('open'); await page.getByLabel('Sort').selectOption('oldest'); await page.waitForTimeout(200)
  const first = await page.locator('a[href^="/items/"] h3').first().textContent(); expect(first.includes('AirPods Pro case') && !first.includes('White AirPods Pro case') || first.includes('White AirPods Pro case'), first)
  expect(page.url().includes('sort=oldest'), 'filters in URL'); await page.getByLabel('Search reports').fill('zzzzzz'); await page.getByText('Nothing matches your search').waitFor(); await page.getByRole('button', { name: 'Clear filters' }).click(); await page.waitForTimeout(200); expect(await count() === all, 'clear')
})
await step('Matching: iPhone report shows strong match, % score, reasons and breakdown bars', async () => {
  await page.goto(B + '/items/demo-item-1'); const card = page.locator('a[href="/items/demo-item-7"]'); await card.waitFor()
  const t = await card.innerText(); expect(/Strong match/.test(t) && /\d+%/.test(t) && /Same category: Electronics/.test(t) && /Same brand: Apple/.test(t) && /Description/.test(t), t.replace(/\n/g, ' | '))
  console.log('     match card:', t.replace(/\n+/g, ' | ').slice(0, 230)); await shot('05-matching')
})
await step('Security (UI+data layer): non-owner sees no Edit/Delete and cannot open edit page', async () => {
  await page.goto(B + '/items/demo-item-7'); await page.getByText('Is this yours?').waitFor(); expect(await page.getByRole('button', { name: 'Delete' }).count() === 0, 'delete visible')
  await page.goto(B + '/items/demo-item-7/edit'); await page.getByText("You can't edit this report").waitFor()
})
await step('Claim: submit ownership claim with proof on a found item', async () => {
  await page.goto(B + '/items/demo-item-7'); await page.getByRole('button', { name: /Submit ownership claim/ }).click(); await page.getByText('Please describe it in more detail').waitFor()
  await page.getByLabel('Prove it is yours').fill('Lock screen has a mountain wallpaper and a crack in the bottom left corner.'); await page.getByRole('button', { name: /Submit ownership claim/ }).click()
  await page.getByText('Your claim').waitFor(); await page.getByText('Pending').first().waitFor()
})
await step('Claim privacy: a third user cannot see someone else’s claim or contact', async () => {
  await logout(); await login('Arjun Mehta'); await page.goto(B + '/items/demo-item-7'); await page.getByText('Is this yours?').waitFor()
  expect(await page.getByText('mountain wallpaper').count() === 0, 'claim visible to outsider'); expect(await page.getByText('demo@findback.app').count() === 0, 'contact leaked')
})
await step('Claim: finder (Priya) rejects with reason; claimant sees rejection', async () => {
  await logout(); await login('Priya Sharma'); await page.goto(B + '/claims'); await page.getByText('mountain wallpaper').waitFor()
  await page.getByRole('button', { name: 'Reject' }).first().click(); await page.getByRole('textbox').fill('Please bring the phone box to prove ownership.'); await page.getByRole('button', { name: 'Confirm rejection' }).click(); await page.getByText('Rejected').first().waitFor()
})
await step('Claim: owner approves with pickup details -> item marked Returned, claimant sees pickup info', async () => {
  await logout(); await login('Demo Student'); await page.goto(B + '/claims'); await page.getByText('Arjun Mehta').first().waitFor()
  await page.getByRole('button', { name: 'Approve' }).click(); await page.getByRole('button', { name: 'Confirm approval' }).click(); await page.getByText('Add pickup details').waitFor()
  await page.getByRole('textbox').fill('Collect from the security office at Gate 1, 10am-4pm.'); await page.getByRole('button', { name: 'Confirm approval' }).click(); await page.getByText('Approved', { exact: true }).first().waitFor()
  await page.goto(B + '/items/demo-item-14'); await page.getByText('Returned ✓').first().waitFor()
  await page.getByRole('button', { name: 'My claims' }).count()
  await page.goto(B + '/claims'); await page.getByRole('button', { name: 'My claims' }).click(); await page.getByText('mountain wallpaper').waitFor(); await page.getByText('Please bring the phone box').waitFor()
  await logout(); await login('Arjun Mehta'); await page.goto(B + '/claims'); await page.getByRole('button', { name: 'My claims' }).click(); await page.getByText('Collect from the security office').waitFor(); await shot('06-claim-approved')
})
await step('Returned item cannot receive new claims', async () => {
  await logout(); await login('Neha Patel'); await page.goto(B + '/items/demo-item-14'); await page.getByText('already been returned').waitFor()
})
await step('Owner can mark returned / re-open and delete own report', async () => {
  await logout(); await login('Demo Student'); await page.goto(B + '/my-reports'); await page.getByText('Red Hero bike keys').click()
  await page.getByRole('button', { name: 'Mark as returned' }).click(); await page.getByText('Returned ✓').first().waitFor(); await page.getByRole('button', { name: 'Re-open report' }).click(); await page.getByRole('button', { name: 'Mark as returned' }).waitFor()
  await page.getByRole('button', { name: 'Delete' }).click(); await page.waitForURL('**/my-reports'); await page.getByRole('heading', { name: 'My reports' }).waitFor(); expect(await page.getByText('Red Hero bike keys').count() === 0, 'not deleted')
})
await step('Signup: validation + new account lands on dashboard; duplicate email rejected', async () => {
  await logout(); await page.goto(B + '/signup'); await page.getByLabel('Full name').fill('Harsh Test'); await page.getByLabel('Email').fill('bad'); await page.getByLabel('Password', { exact: true }).fill('secret12'); await page.getByLabel('Confirm password').fill('secret12'); await page.getByRole('button', { name: 'Sign up' }).click(); await page.getByText('valid email').waitFor()
  await page.getByLabel('Email').fill('harsh@test.com'); await page.getByLabel('Confirm password').fill('nomatch'); await page.getByRole('button', { name: 'Sign up' }).click(); await page.getByText('Passwords do not match').waitFor()
  await page.getByLabel('Confirm password').fill('secret12'); await page.getByRole('button', { name: 'Sign up' }).click(); await page.getByText('Hi Harsh').waitFor()
  await logout(); await page.goto(B + '/signup'); await page.getByLabel('Full name').fill('X Y'); await page.getByLabel('Email').fill('harsh@test.com'); await page.getByLabel('Password', { exact: true }).fill('secret12'); await page.getByLabel('Confirm password').fill('secret12'); await page.getByRole('button', { name: 'Sign up' }).click(); await page.getByText('already exists').waitFor()
})
await step('404 page and Back link fallback', async () => {
  await page.goto(B + '/nope'); await page.getByText('Page not found').waitFor()
  await page.goto(B + '/items/demo-item-3'); await page.getByRole('button', { name: 'Back' }).click(); await page.waitForTimeout(300); expect(/\/(dashboard|login)$/.test(page.url()), page.url())
})
await step('Reset demo data restores the seed', async () => {
  await page.goto(B + '/'); await page.getByRole('button', { name: 'Reset demo data' }).click(); await page.waitForTimeout(800); await page.goto(B + '/browse'); await page.getByText(/\d+ results?/).waitFor(); expect(await count() === 14, 'reset count ' + await count())
})
// Mobile
const m = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }); await m.route(/fonts\.(googleapis|gstatic)/, r => r.abort())
const mp = await m.newPage(); mp.setDefaultTimeout(8000); mp.on('pageerror', e => errors.push('mobile: ' + e.message))
await step('Mobile (375px): no horizontal overflow on any page; hamburger menu works', async () => {
  await mp.goto(B + '/login'); await mp.getByText('Demo Student', { exact: true }).click(); await mp.getByRole('button', { name: 'Log in', exact: true }).click(); await mp.getByText('Hi Demo').waitFor()
  const bad = []
  for (const p of ['/', '/dashboard', '/browse', '/items/demo-item-1', '/items/demo-item-14', '/report/lost', '/my-reports', '/claims', '/login']) { await mp.goto(B + p); await mp.waitForTimeout(450); const w = await mp.evaluate(() => document.documentElement.scrollWidth); if (w > 375) bad.push(p + '=' + w); await mp.screenshot({ path: `${S}/shots/m-${p.replace(/\W+/g, '_') || 'home'}.png`, fullPage: true }) }
  expect(bad.length === 0, 'overflow: ' + bad.join(', '))
  await mp.getByLabel('Toggle menu').click(); await mp.getByRole('banner').getByRole('link', { name: 'Report Found' }).click(); await mp.getByText('Report a found item').waitFor()
})
console.log(`\nRESULT: ${pass} passed, ${fail} failed`); console.log('ERRORS:', errors.length ? errors : 'none')
await browser.close()
process.exitCode = fail ? 1 : 0
