// Anchor e2e — spec quality gate 3.
// Each test gets a fresh browser context (empty localStorage), so every test starts from the seed.
// Any console error or uncaught page error fails the test (checked in the `errors` fixture teardown).
// The page clock starts on a plain weekday morning in Bangkok (see START), so Today's time-of-day layout
// never depends on when the suite runs. Time still flows; tests move it with page.clock when they need to.
import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const STORAGE_KEY = 'anchor:v1';

/** Wednesday 28 Oct 2026, 09:00 in Bangkok: morning layout, no bet review due yet. */
const START = '2026-10-28T09:00:00+07:00';

/** A Bangkok wall-clock time as a Date ('2026-11-02T08:30' → 08:30 in Bangkok). */
function bkk(local: string): Date {
  return new Date(`${local}:00+07:00`);
}

async function prepPage(page: Page): Promise<void> {
  // Keep the run independent of the network: Google Fonts gets an empty stylesheet.
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  // The Astro dev toolbar (dev server only) floats over the tab bar; hide it.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = 'astro-dev-toolbar{display:none!important}';
      document.head.append(style);
    });
  });
}

const test = base.extend<{ errors: string[]; startAt: string }>({
  startAt: [START, { option: true }],
  page: async ({ page, startAt }, use) => {
    // The clock belongs to the whole context, so a second tab shares it.
    await page.clock.install({ time: new Date(startAt) });
    await prepPage(page);
    await use(page);
  },
  errors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    await use(errors);
    expect(errors, 'no console errors or page errors').toEqual([]);
  }, { auto: true }],
});

test.use({ storageState: { cookies: [], origins: [] } });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bangkokDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

/** Today in Asia/Bangkok as YYYY-MM-DD by the page's clock (same rule as the app). */
async function pageToday(page: Page): Promise<string> {
  return bangkokDate(await page.evaluate(() => Date.now()));
}

type Saved = Record<string, any>;

async function saved(page: Page): Promise<Saved | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);
}

async function openApp(page: Page, route = 'today'): Promise<void> {
  await page.goto(`/anchor/#/${route}`);
  await expect(page.locator('#view > .view')).toBeVisible();
}

async function reloadApp(page: Page): Promise<void> {
  await page.reload();
  await expect(page.locator('#view > .view')).toBeVisible();
}

async function expectTitle(page: Page, title: string): Promise<void> {
  await expect(page.locator('#page-title')).toHaveText(title);
}

async function tab(page: Page, name: 'Today' | 'Bets' | 'Funnel' | 'Talks' | 'More'): Promise<void> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true }).click();
  await expectTitle(page, name);
}

async function moreItem(page: Page, name: 'Heavy' | 'Time' | 'Weekly review' | 'Settings'): Promise<void> {
  await tab(page, 'More');
  await page.getByRole('navigation', { name: 'More' }).getByRole('link', { name: new RegExp(`^${name}`) }).click();
  await expectTitle(page, name);
}

async function setAnchor(page: Page, text: string): Promise<void> {
  await page.getByLabel('What', { exact: true }).fill(text);
  await page.getByLabel(/^Which number/).fill('paid seats');
  await page.getByRole('button', { name: 'Set anchor' }).click();
  await expect(page.getByRole('checkbox', { name: new RegExp(text) })).toBeVisible();
}

async function addAction(page: Page, text: string): Promise<void> {
  await page.getByLabel('New action').fill(text);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: text })).toBeVisible();
}

/** Logs a talk with the quick fields, then opens "Add …" for channel, name and opinion. */
async function addTalk(page: Page, talk: { who: string; did: string; quote?: string }): Promise<void> {
  await tab(page, 'Talks');
  await page.getByRole('radiogroup', { name: 'Role', exact: true }).getByRole('radio', { name: 'Parent' }).click();
  await page.getByLabel('What did they actually do?').fill(talk.did);
  if (talk.quote) await page.getByLabel(/^One key quote/).fill(talk.quote);
  await page.getByText('Add story, opinion, channel, name, date, bet').click();
  await page.getByRole('radiogroup', { name: /^Channel/ }).getByRole('radio', { name: 'LINE' }).click();
  await page.getByLabel(/^Who/).fill(talk.who);
  await page.getByLabel(/^Opinion/).fill('Said she would recommend it to friends.');
  await page.getByRole('button', { name: 'Save talk' }).click();
  await expect(page.getByText(/^Saved\. \d+ of 10 this week\.$/)).toBeVisible();
  await expect(page.getByRole('article').filter({ hasText: talk.did })).toBeVisible();
}

/** The worry dump saves on the button only (nothing is stored while typing). */
async function dumpWorry(page: Page, text: string): Promise<void> {
  await page.getByLabel('What’s on your mind?').fill(text);
  await page.getByRole('button', { name: 'Save worry' }).click();
  await expect(page.getByLabel('What’s on your mind?')).toHaveValue('');
  await expect(page.getByText('Saved. It’s in To sort below.')).toBeVisible();
  await expect.poll(async () => (await saved(page))?.worries?.some((w: Saved) => w.text === text)).toBe(true);
}

interface EscapeAnswers {
  want: string;
  number?: string;
  /** A quick pick on the date step; left out = no date. */
  by?: '1 week' | '2 weeks';
  how?: string;
  /** An active bet's exact name; left out = "None". */
  bet?: string;
  avoiding?: string;
}

/** Today → "I want to build something new" → six answers → the result screen. */
async function runEscapeCheck(page: Page, a: EscapeAnswers): Promise<void> {
  await page.getByRole('link', { name: 'I want to build something new' }).click();
  await expectTitle(page, 'Before you build');
  const next = page.getByRole('button', { name: 'Next' });
  await page.locator('#escape-want').fill(a.want);
  await next.click();
  await expect(page.locator('#escape-number')).toBeVisible();
  if (a.number) await page.locator('#escape-number').fill(a.number);
  await next.click();
  await expect(page.locator('#escape-by')).toBeVisible();
  if (a.by) await page.getByRole('button', { name: a.by, exact: true }).click();
  await next.click();
  await expect(page.locator('#escape-how')).toBeVisible();
  if (a.how) await page.locator('#escape-how').fill(a.how);
  await next.click();
  if (a.bet) await page.getByRole('radio', { name: a.bet, exact: true }).check();
  else await page.getByRole('radio', { name: /^None/ }).check();
  await next.click();
  await expect(page.locator('#escape-avoid')).toBeVisible();
  if (a.avoiding) await page.locator('#escape-avoid').fill(a.avoiding);
  await page.getByRole('button', { name: 'See result' }).click();
  await expect(page.getByRole('heading', { name: 'Your call' })).toBeVisible();
}

/** Put a running timer into the saved state (started `minutesAgo` by the page clock), then reload. */
async function seedTimer(page: Page, minutesAgo: number, timer: Record<string, unknown>): Promise<void> {
  await expect.poll(async () => (await saved(page))?.bets?.length).toBe(3);
  await page.evaluate(([key, ago, t]) => {
    const s = JSON.parse(localStorage.getItem(key as string) as string);
    s.activeTimer = { ...(t as object), startedAt: new Date(Date.now() - (ago as number) * 60_000).toISOString() };
    localStorage.setItem(key as string, JSON.stringify(s));
  }, [STORAGE_KEY, minutesAgo, timer] as const);
  await reloadApp(page);
}

const betId = (s: Saved | null, name: string): string => s?.bets.find((b: Saved) => b.name === name)?.id;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('first load shows the seeded bets', async ({ page }) => {
  await openApp(page);
  await expectTitle(page, 'Today');
  await expect.poll(async () => (await saved(page))?.bets?.length).toBe(3);

  await tab(page, 'Bets');
  const active = page.locator('section[aria-labelledby="bets-active-title"]');
  for (const name of ['SHIFT', 'School SHIFT (first school)', 'SHIFT High (alumni community)']) {
    await expect(active.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await expect(active.getByText('3 of 3 active', { exact: false })).toBeVisible();
  // The public seed is names only: the real bets come from the private start file.
  expect((await saved(page))?.bets.map((b: Saved) => [b.hypothesis, b.continueIf, b.killIf]))
    .toEqual(Array(3).fill(['(fill in)', '(fill in)', '(fill in)']));
  const parked = page.locator('section[aria-labelledby="bets-parked-title"]');
  await expect(parked.getByText('Nothing parked.')).toBeVisible();
});

test('the first-run card goes away for good after Got it', async ({ page }) => {
  await openApp(page);
  const intro = page.getByRole('heading', { name: 'Start here' });
  await expect(intro).toBeVisible();
  await expect(page.getByText('Anchor = the one thing today that moves a number.')).toBeVisible();
  await expect(page.getByText('Heavy = where the stressful stuff goes.')).toBeVisible();
  // "How it works" opens More on the method; More's own links stay first on that screen.
  await page.getByRole('link', { name: 'How it works' }).click();
  await expectTitle(page, 'More');
  await expect(page.getByRole('heading', { name: 'How Anchor works' })).toBeInViewport();
  await page.goBack();
  await expectTitle(page, 'Today');
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(intro).toHaveCount(0);

  await reloadApp(page);
  await expectTitle(page, 'Today');
  await expect(page.getByLabel('What', { exact: true })).toBeVisible();
  await expect(intro).toHaveCount(0);
  await tab(page, 'Bets');
  await tab(page, 'Today');
  await expect(intro).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('anchor:today:intro-dismissed'))).toBeTruthy();
});

test('set the anchor and add actions (three is the limit, a 4th asks to swap)', async ({ page }) => {
  await openApp(page);
  await setAnchor(page, 'Send the offer to 5 alumni');
  await expect(page.getByText('Locked in. This is the one that counts today.')).toBeVisible();

  await addAction(page, 'Call two parents');
  await page.getByRole('checkbox', { name: 'Call two parents' }).check();
  await expect(page.getByText('1 of 1 done')).toBeVisible();
  await addAction(page, 'Post the Day-6 recap');
  await addAction(page, 'Reply to the school');
  // Three on the list: the input stays, and the limit only speaks up when a 4th is tried.
  await expect(page.getByLabel('New action')).toBeVisible();
  await expect(page.getByText('That’s three. Swap one out?')).toHaveCount(0);
  await page.getByLabel('New action').fill('Book the venue');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('That’s three. Swap one out?')).toBeVisible();
  await page.getByRole('button', { name: 'Keep my three' }).click();
  await expect(page.getByText('That’s three. Swap one out?')).toHaveCount(0);

  const today = await pageToday(page);
  await expect.poll(async () => (await saved(page))?.days?.[today]?.anchor?.text).toBe('Send the offer to 5 alumni');
  const day = (await saved(page))?.days?.[today];
  expect(day.anchor.metric).toBe('paid seats');
  expect(day.actions.map((a: Saved) => a.text)).toEqual(['Call two parents', 'Post the Day-6 recap', 'Reply to the school']);
  expect(day.actions[0].done).toBe(true);

  // Swap: only unfinished actions are offered, and the new one takes the same place.
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Swap out: Call two parents' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Swap out: Reply to the school' }).click();
  await expect(page.getByText('Swapped. “Reply to the school” can wait.')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Book the venue' })).toBeVisible();
  await expect.poll(async () => (await saved(page))?.days?.[today]?.actions?.map((a: Saved) => a.text))
    .toEqual(['Call two parents', 'Post the Day-6 recap', 'Book the venue']);
});

test('the morning check-in is one compact row; a pill opens just its question', async ({ page }) => {
  await openApp(page);
  const card = page.locator('.today-checkin');
  await expect(card.getByRole('button', { name: 'Sleep: not answered yet' })).toBeVisible();
  const box = await card.boundingBox();
  expect(box?.height ?? 999).toBeLessThan(120);
  for (const name of ['Sleep: not answered yet', 'Energy: not answered yet', 'Mood: not answered yet']) {
    expect((await card.getByRole('button', { name }).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByRole('radiogroup', { name: 'Energy' })).toHaveCount(0);

  await card.getByRole('button', { name: 'Energy: not answered yet' }).click();
  await expect(card.getByText('1 = drained · 5 = great')).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Energy' }).getByRole('radio', { name: 'Energy 2 of 5' }).click();
  await expect(card.getByRole('button', { name: 'Energy: 2 of 5' })).toHaveText('Energy 2');
  await expect(page.getByRole('radiogroup', { name: 'Energy' })).toHaveCount(0);

  await card.getByRole('button', { name: 'Sleep: not answered yet' }).click();
  await page.getByRole('radiogroup', { name: 'Sleep (hours)' }).getByRole('radio', { name: '6 hours' }).click();
  await card.getByRole('button', { name: 'Mood: not answered yet' }).click();
  await page.getByRole('radiogroup', { name: 'Mood' }).getByRole('radio', { name: 'Mood 3 of 5' }).click();
  // All three in: the short summary, with Change for the full form and a note.
  await expect(card.getByText('Slept 6h · Energy 2/5 · Mood 3/5')).toBeVisible();
  const today = await pageToday(page);
  await expect.poll(async () => (await saved(page))?.days?.[today]?.checkin).toEqual({ sleepHours: 6, energy: 2, mood: 3 });
  await card.getByRole('button', { name: 'Change' }).click();
  await expect(card.getByRole('button', { name: 'Add a note' })).toBeVisible();
});

test('actions can be steps toward the anchor; the last one offers to mark the anchor done', async ({ page }) => {
  await openApp(page);
  await setAnchor(page, 'DM 5 parents for referrals');
  const toward = page.getByRole('button', { name: 'Toward the anchor' });
  await toward.click();
  await expect(toward).toHaveAttribute('aria-pressed', 'true');
  await addAction(page, 'Write the DM');
  await expect(toward).toHaveAttribute('aria-pressed', 'false'); // one tap per action
  await addAction(page, 'Fix login bug');
  await toward.click();
  await addAction(page, 'Send it to 5 parents');
  await expect(page.getByText('Steps: 0 of 2 done')).toBeVisible();
  const today = await pageToday(page);
  await expect.poll(async () => (await saved(page))?.days?.[today]?.actions?.map((a: Saved) => a.forAnchor ?? false))
    .toEqual([true, false, true]);

  await page.getByRole('checkbox', { name: 'Write the DM' }).check();
  await expect(page.getByText('Steps: 1 of 2 done')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Fix login bug' }).check();
  await expect(page.getByText('That was the anchor’s last step. Mark the anchor done?')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Send it to 5 parents' }).check();
  const t = page.locator('.toast').filter({ hasText: 'That was the anchor’s last step. Mark the anchor done?' });
  await t.getByRole('button', { name: 'Mark done' }).click();
  await expect(page.getByRole('checkbox', { name: /DM 5 parents for referrals/ })).toBeChecked();
  await expect.poll(async () => (await saved(page))?.days?.[today]?.anchor?.done).toBe(true);
});

test('next morning, yesterday’s unfinished actions are offered to carry over', async ({ page }) => {
  await openApp(page);
  await addAction(page, 'Call two parents');
  await addAction(page, 'Draft the camp poster');
  await page.getByRole('checkbox', { name: 'Call two parents' }).check();
  await expect.poll(async () => (await saved(page))?.days?.['2026-10-28']?.actions?.[0]?.done).toBe(true);

  await page.clock.setSystemTime(bkk('2026-10-29T08:00'));
  await reloadApp(page);
  await expect(page.getByRole('heading', { name: 'Carry over?' })).toBeVisible();
  await expect(page.getByText('Not finished yesterday. Bring any into today?')).toBeVisible();
  const list = page.getByRole('list', { name: 'Unfinished actions' });
  await expect(list.getByText('Draft the camp poster')).toBeVisible();
  await expect(list.getByText('Call two parents')).toHaveCount(0); // done yesterday: nothing to carry

  await page.getByRole('button', { name: 'Carry over: Draft the camp poster' }).click();
  await expect(page.getByRole('checkbox', { name: 'Draft the camp poster' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Carry over?' })).toHaveCount(0);
  await expect.poll(async () => (await saved(page))?.days?.['2026-10-29']?.actions)
    .toMatchObject([{ text: 'Draft the camp poster', done: false }]);
  // Yesterday's record stays as it was.
  expect((await saved(page))?.days?.['2026-10-28']?.actions?.map((a: Saved) => a.text))
    .toEqual(['Call two parents', 'Draft the camp poster']);
});

test('an anchor still open at night is offered for tomorrow; its step comes along, still toward it', async ({ page }) => {
  await openApp(page);
  await setAnchor(page, 'DM 5 parents for referrals');
  await page.getByRole('button', { name: 'Toward the anchor' }).click();
  await addAction(page, 'Write the DM');
  await expect.poll(async () => (await saved(page))?.days?.['2026-10-28']?.actions?.[0]?.forAnchor).toBe(true);

  // 21:30: the shutdown is on top, and names the anchor that slipped as tomorrow's.
  await page.clock.setSystemTime(bkk('2026-10-28T21:30'));
  await reloadApp(page);
  const tomorrow = page.getByLabel('Tomorrow’s anchor');
  await expect(tomorrow).toHaveValue('DM 5 parents for referrals');
  await expect(page.getByText('Today’s anchor is still open. Keep it for tomorrow, or change it.')).toBeVisible();
  await page.getByLabel('One lesson').fill('Anchor before building.');
  await page.getByRole('button', { name: 'Save shutdown' }).click();
  await expect(page.getByText('Saved. Tomorrow’s anchor is ready.')).toBeVisible();

  await page.clock.setSystemTime(bkk('2026-10-29T08:00'));
  await reloadApp(page);
  await expect(page.getByRole('checkbox', { name: /DM 5 parents for referrals/ })).toBeVisible();
  await expect(page.getByText('Anchor before building.')).toBeVisible();
  await page.getByRole('button', { name: 'Carry over: Write the DM' }).click();
  await expect(page.getByText('Steps: 0 of 1 done')).toBeVisible();
  await expect.poll(async () => (await saved(page))?.days?.['2026-10-29']?.actions)
    .toMatchObject([{ text: 'Write the DM', done: false, forAnchor: true }]);
});

test('an escape check that gets parked lands in the parking lot', async ({ page }) => {
  await openApp(page);
  await runEscapeCheck(page, { want: 'A habit tracker app', how: 'People open it every day' });

  await expect(page.getByText('No number moves yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Park it', exact: true }).click();

  await expectTitle(page, 'Today');
  await expect(page.getByText('Parked. It’s the only idea in the parking lot.')).toBeVisible();
  await expect.poll(async () => (await saved(page))?.parking?.length).toBe(1);
  const s = await saved(page);
  expect(s?.escapes).toHaveLength(1);
  expect(s?.escapes[0]).toMatchObject({ want: 'A habit tracker app', recommended: 'park', verdict: 'park' });
  expect(s?.parking[0]).toMatchObject({ text: 'A habit tracker app', fromEscapeId: s?.escapes[0].id });
  expect(s?.activeTimer).toBeUndefined();

  await tab(page, 'Bets');
  const lot = page.locator('section[aria-labelledby="bets-parking-title"]');
  await expect(lot.getByText('A habit tracker app')).toBeVisible();
});

test('naming what you avoid offers ten minutes on it first (an Ops timer), and the check waits', async ({ page }) => {
  await openApp(page);
  await runEscapeCheck(page, {
    want: 'An alumni board', number: 'referral applies', by: '1 week', how: 'Count referral applies on the funnel',
    bet: 'SHIFT', avoiding: 'The tax form email',
  });
  await expect(page.getByRole('heading', { name: 'Do that first?' })).toBeVisible();
  await expect(page.getByText(/You said you’re avoiding: The tax form email\./)).toBeVisible();
  // The recommendation is Go, but the named avoidance comes first.
  await expect(page.getByRole('heading', { name: 'Go, time-boxed' })).toBeVisible();
  await page.getByRole('button', { name: 'Do that first (10 min)' }).click();

  await expectTitle(page, 'Today');
  const t = page.locator('.toast').filter({ hasText: '10 minutes on it. The escape check will be where you left it.' });
  await expect(t).toBeVisible();
  await t.getByRole('button', { name: 'Put it in Heavy' }).click();
  await expect(page.getByText('In Heavy. Triage it when you’re ready.')).toBeVisible();
  await expect.poll(async () => (await saved(page))?.activeTimer).toMatchObject({
    category: 'ops', timeboxMin: 10, note: 'First: The tax form email',
  });
  await expect.poll(async () => (await saved(page))?.worries?.map((w: Saved) => w.text)).toEqual(['The tax form email']);
  let s = await saved(page);
  expect(s?.escapes).toEqual([]); // not decided yet

  // Ten minutes later the box is up; the check is still where he left it.
  await page.clock.fastForward('11:00');
  await expect(page.locator('.timebox-banner')).toHaveText(/Your 10 minutes are up\. What moved\?/);
  await page.getByRole('link', { name: 'I want to build something new' }).click();
  await expectTitle(page, 'Before you build');
  await expect(page.getByText('Picked up where you left off.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You gave it ten minutes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Do that first (10 min)' })).toHaveCount(0);

  // A recommended Go: build, tagged as from an escape check. The Ops box asks what moved first.
  await page.getByRole('button', { name: 'Go for 90 min' }).click();
  const dlg = page.getByRole('dialog', { name: 'What moved?' });
  await dlg.getByRole('textbox', { name: /^What moved\?/ }).fill('Sent the email');
  await dlg.getByRole('button', { name: 'Log it, start Build' }).click();
  await expectTitle(page, 'Today');
  await expect(page.getByText(/^Go\. 90 minutes on the clock, then write what moved\. Logged 1\dm of Ops\.$/)).toBeVisible();

  await expect.poll(async () => (await saved(page))?.activeTimer?.category).toBe('build');
  s = await saved(page);
  expect(s?.activeTimer).toMatchObject({ source: 'escape', timeboxMin: 90, note: 'Escape check: An alumni board' });
  expect(s?.activeTimer?.overridden).toBeFalsy();
  expect(s?.timeLog).toHaveLength(1);
  expect(s?.timeLog[0]).toMatchObject({ category: 'ops', note: 'First: The tax form email · Moved: Sent the email' });
  expect(s?.escapes).toHaveLength(1);
  expect(s?.escapes[0]).toMatchObject({ recommended: 'go', verdict: 'go', avoiding: 'The tax form email', betId: betId(s, 'SHIFT') });
});

test('a re-opened parked idea keeps its check after "Do that first" and the way back through Today', async ({ page }) => {
  await openApp(page);
  await runEscapeCheck(page, { want: 'A habit tracker app', how: 'People open it every day' });
  await page.getByRole('button', { name: 'Park it', exact: true }).click();
  await expectTitle(page, 'Today');
  await expect.poll(async () => (await saved(page))?.parking?.length).toBe(1);
  const ideaId: string = (await saved(page))?.parking[0].id;

  await tab(page, 'Bets');
  await page.getByRole('link', { name: 'Re-open with an escape check: A habit tracker app' }).click();
  await expectTitle(page, 'Before you build');
  await expect(page.locator('#escape-want')).toHaveValue('A habit tracker app');
  const next = page.getByRole('button', { name: 'Next' });
  await next.click();
  await expect(page.locator('#escape-number')).toBeVisible();
  await next.click();
  await page.getByRole('button', { name: '1 week', exact: true }).click();
  await next.click();
  await page.locator('#escape-how').fill('Count who opens it twice');
  await next.click();
  await page.getByRole('radio', { name: 'SHIFT', exact: true }).check();
  await next.click();
  await page.locator('#escape-avoid').fill('The tax form email');
  await page.getByRole('button', { name: 'See result' }).click();
  await expect(page.getByRole('heading', { name: 'Your call' })).toBeVisible();

  await page.getByRole('button', { name: 'Do that first (10 min)' }).click();
  await expectTitle(page, 'Today');
  const t = page.locator('.toast').filter({ hasText: 'The escape check will be where you left it.' });
  await t.getByRole('button', { name: 'Put it in Heavy' }).click();
  await expect.poll(async () => (await saved(page))?.worries?.length).toBe(1);

  // Back through Today's plain button: the same check, answers and all.
  await page.clock.fastForward('11:00');
  await page.getByRole('link', { name: 'I want to build something new' }).click();
  await expectTitle(page, 'Before you build');
  await expect(page.getByText('Picked up where you left off.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You gave it ten minutes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Do that first (10 min)' })).toHaveCount(0);
  await expect(page.getByText('In Heavy', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Put it in Heavy' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Idea\s*A habit tracker app/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^How you’ll know\s*Count who opens it twice/ })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#/escape\\?idea=${ideaId}$`));
  const draft = JSON.parse(await page.evaluate(() => localStorage.getItem('anchor:escape:draft') ?? 'null'));
  expect(draft).toMatchObject({ want: 'A habit tracker app', avoiding: 'The tax form email', worryText: 'The tax form email', fromIdeaId: ideaId });
  expect(draft.avoidFirstAt).toBeTruthy();

  // Parking it again replaces the re-opened idea (no duplicate, no second worry).
  await page.getByRole('button', { name: 'Park it', exact: true }).click();
  await expectTitle(page, 'Today');
  await expect.poll(async () => (await saved(page))?.escapes?.length).toBe(2);
  const s = await saved(page);
  expect(s?.parking).toHaveLength(1);
  expect(s?.parking[0].id).not.toBe(ideaId);
  expect(s?.parking[0]).toMatchObject({ text: 'A habit tracker app', fromEscapeId: s?.escapes[1].id });
  expect(s?.worries).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem('anchor:escape:draft'))).toBeNull();
});

test('no date parks; going anyway counts as escape time, and the box asks what moved', async ({ page }) => {
  await openApp(page);
  await runEscapeCheck(page, {
    want: 'A habit tracker for alumni', number: 'weekly active alumni', how: 'They open it every day',
    bet: 'SHIFT High (alumni community)',
  });
  // Number and bet are fine; no date is enough to lean park.
  await expect(page.getByRole('heading', { name: 'Park it' })).toBeVisible();
  await expect(page.getByText('There’s no date yet for when you’d see it move.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^By when\s*No date\s*Leans park/ })).toBeVisible();
  await expect(page.getByText('It’s your call either way. Going anyway counts as escape time.')).toBeVisible();

  await page.getByRole('button', { name: 'Go anyway (90 min)' }).click();
  await expectTitle(page, 'Today');
  await expect(page.getByText('Your call. 90 minutes on the clock, counted as escape time.')).toBeVisible();
  await expect(page.getByText('From an escape check, after a Park. Counts as escape time.')).toBeVisible();
  await expect.poll(async () => (await saved(page))?.activeTimer).toMatchObject({
    category: 'escape', source: 'escape', overridden: true, timeboxMin: 90, note: 'Escape check: A habit tracker for alumni',
  });
  expect((await saved(page))?.escapes[0]).toMatchObject({ recommended: 'park', verdict: 'go' });

  // 91 minutes later: a banner on every screen.
  await page.clock.fastForward('01:31:00');
  const banner = page.locator('.timebox-banner');
  await expect(banner).toHaveText(/Your 90 minutes are up\. What moved\?/);
  await tab(page, 'Funnel');
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Stop' }).click();
  const dlg = page.getByRole('dialog', { name: 'What moved?' });
  await dlg.getByRole('textbox', { name: /^What moved\?/ }).fill('Nothing yet. Back to the anchor.');
  await dlg.getByRole('button', { name: 'Log it', exact: true }).click();
  await expect(page.getByText(/^Logged 1h 3\dm of Escape\.$/)).toBeVisible();
  await expect(banner).toBeHidden();

  await expect.poll(async () => (await saved(page))?.timeLog?.length).toBe(1);
  const s = await saved(page);
  expect(s?.activeTimer).toBeUndefined();
  expect(s?.timeLog[0]).toMatchObject({
    category: 'escape', source: 'escape', overridden: true,
    note: 'Escape check: A habit tracker for alumni · Moved: Nothing yet. Back to the anchor.',
  });
  await moreItem(page, 'Time');
  await expect(page.getByText(/^Of which via escape check: .+ \(.+ after a Park\)\.$/)).toBeVisible();
});

test('a time-boxed timer left running for hours asks when it stopped, and logs the box, not the hours', async ({ page }) => {
  await openApp(page);
  await runEscapeCheck(page, {
    want: 'A habit tracker for alumni', number: 'weekly active alumni', how: 'They open it every day',
    bet: 'SHIFT High (alumni community)',
  });
  await page.getByRole('button', { name: 'Go anyway (90 min)' }).click();
  await expectTitle(page, 'Today');
  await expect.poll(async () => (await saved(page))?.activeTimer?.timeboxMin).toBe(90);

  // Back five hours later: past the box + 30 min, so nothing counts past the cap and the banner says so.
  await page.clock.fastForward('05:00:00');
  await expect(page.locator('.timebox-banner')).toHaveText(/Your Escape timer is still running from/);
  await moreItem(page, 'Time');
  await expect(page.getByText('No time logged in this week.')).toBeVisible();

  await page.getByRole('button', { name: 'Stop and log' }).click();
  const dlg = page.getByRole('dialog', { name: 'When did you stop?' });
  await expect(dlg.getByText(/past its 90 min box\./)).toBeVisible();
  await expect(dlg.getByLabel('Date')).toHaveValue(await pageToday(page));
  await expect(dlg.getByLabel('Stopped at')).toHaveValue('10:30'); // the end of the box (Go at 09:00)
  await dlg.getByRole('textbox', { name: /^What moved\?/ }).fill('Nothing yet.');
  await dlg.getByRole('button', { name: 'Log it', exact: true }).click();
  await expect(page.getByText(/^Logged 1h 30m of Escape\.$/)).toBeVisible();

  await expect.poll(async () => (await saved(page))?.timeLog?.length).toBe(1);
  const e = (await saved(page))?.timeLog[0];
  const minutes = (Date.parse(e.end) - Date.parse(e.start)) / 60_000;
  expect(minutes).toBeGreaterThan(89);
  expect(minutes).toBeLessThanOrEqual(90);
  expect(e).toMatchObject({ category: 'escape', source: 'escape', overridden: true });
  expect(e.note).toMatch(/· Moved: Nothing yet\.$/);
});

test('add a talk', async ({ page }) => {
  await openApp(page);
  await addTalk(page, { who: 'N.', did: 'Paid the deposit after one call', quote: 'I want him to finish something real.' });
  const card = page.getByRole('article').filter({ hasText: 'Paid the deposit after one call' });
  await expect(card.getByRole('heading', { name: 'N.' })).toBeVisible();
  await expect(card.getByText('“I want him to finish something real.”')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Talks this week' })).toHaveAttribute('aria-valuenow', '1');

  await expect.poll(async () => (await saved(page))?.talks?.length).toBe(1);
  expect((await saved(page))?.talks[0]).toMatchObject({
    role: 'parent', channel: 'LINE', who: 'N.', did: 'Paid the deposit after one call', date: await pageToday(page),
  });
});

test('a talk saves in quick mode: who it was and one line', async ({ page }) => {
  await openApp(page, 'talks');
  await expect(page.getByText('What they actually did matters most.')).toBeVisible();
  await expect(page.getByLabel(/^Story/)).toBeHidden(); // tucked under "Add …"
  await page.getByRole('button', { name: 'Save talk' }).click();
  await expect(page.getByText('Pick who it was.')).toBeVisible();
  await expect(page.getByText('Add one line: what they did, or something they said.')).toBeVisible();

  await page.getByRole('radiogroup', { name: 'Role', exact: true }).getByRole('radio', { name: 'Student', exact: true }).click();
  await page.getByLabel(/^One key quote/).fill('I showed it to my mom and she used it.');
  await page.getByRole('button', { name: 'Save talk' }).click();
  await expect(page.getByText(/^Saved\. 1 of 10 this week\.$/)).toBeVisible();
  await expect.poll(async () => (await saved(page))?.talks?.length).toBe(1);
  expect((await saved(page))?.talks[0]).toMatchObject({
    role: 'student', quote: 'I showed it to my mom and she used it.', did: '', date: await pageToday(page),
  });
});

test('add a funnel row', async ({ page }) => {
  await openApp(page);
  await tab(page, 'Funnel');
  await page.getByRole('button', { name: 'Add a row' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a row' });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Name').fill('Week 44');
  await sheet.getByRole('radio', { name: 'Week' }).click();
  await sheet.getByLabel('Reach', { exact: true }).fill('1,200');
  await sheet.getByLabel('Link clicks', { exact: true }).fill('300');
  await sheet.getByLabel('Applied', { exact: true }).fill('40');
  await sheet.getByLabel('Paid', { exact: true }).fill('12');
  await sheet.getByLabel('Revenue (THB)').fill('5880');
  await sheet.getByLabel('Cash costs (THB)').fill('1200');
  await sheet.getByLabel(/^Founder hours/).fill('20');
  await sheet.getByRole('button', { name: 'Add row' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText('Row added.')).toBeVisible();

  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Week 44' }) });
  await expect(card).toBeVisible();
  await expect(card.getByText('Bottleneck', { exact: true })).toBeVisible();
  await expect(card.getByText('฿234/h')).toBeVisible();

  await expect.poll(async () => (await saved(page))?.funnel?.length).toBe(3);
  const row = (await saved(page))?.funnel.find((r: Saved) => r.label === 'Week 44');
  expect(row).toMatchObject({ period: 'week', reach: 1200, clicks: 300, applied: 40, paid: 12, revenueThb: 5880, costThb: 1200, founderHours: 20 });
  expect(row.finished).toBeUndefined(); // empty = unknown, not zero
});

test('worry dump and triage', async ({ page }) => {
  await openApp(page);
  await moreItem(page, 'Heavy');

  await dumpWorry(page, 'The venue deposit is due');
  await expect(page.getByRole('heading', { name: 'To sort · 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Let it go' }).click();
  await expect(page.getByText('Let go. It’s in the list below if you need it.')).toBeVisible();
  await expect(page.getByText('Let go · 1')).toBeVisible();

  await dumpWorry(page, 'Renew my visa');
  await page.getByRole('button', { name: 'Make it an action' }).click();
  const sheet = page.getByRole('dialog', { name: 'Make it an action' });
  await expect(sheet.getByLabel('What is it?')).toHaveValue('Renew my visa');
  await sheet.getByLabel('Next physical action').fill('Email the agent for the form');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet).toBeHidden();
  const item = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Renew my visa' }) });
  await expect(item.getByText('Email the agent for the form')).toBeVisible();
  await expect(page.getByText('Nothing left to sort.')).toBeVisible();

  await expect.poll(async () => (await saved(page))?.heavy?.length).toBe(2);
  const s = await saved(page);
  const letGo = s?.worries.find((w: Saved) => w.text === 'The venue deposit is due');
  const action = s?.worries.find((w: Saved) => w.text === 'Renew my visa');
  const created = s?.heavy.find((h: Saved) => h.title === 'Renew my visa');
  expect(s?.worries).toHaveLength(2);
  expect(letGo.triage).toBe('let-go');
  expect(action).toMatchObject({ triage: 'action', heavyId: created.id });
  expect(created).toMatchObject({ nextAction: 'Email the agent for the form', status: 'open' });
});

test('a worry typed right after saving starts the next one and never changes the saved one', async ({ page }) => {
  await openApp(page, 'heavy');
  await page.getByLabel('What’s on your mind?').fill('First worry');
  // Save, then type into the box in the same task, i.e. before the post-save re-render lands.
  await page.evaluate(() => {
    const box = document.querySelector<HTMLTextAreaElement>('#heavy-worry');
    document.querySelector<HTMLButtonElement>('[data-key="heavy-worry-save"]')?.click();
    if (!box) return;
    box.value = 'Second worry';
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.getByLabel('What’s on your mind?')).toHaveValue('Second worry');
  // Nothing is stored while typing: only the saved one is there.
  await expect.poll(async () => ((await saved(page))?.worries ?? []).map((w: Saved) => w.text)).toEqual(['First worry']);
  await page.getByRole('button', { name: 'Save worry' }).click();
  await expect.poll(async () => ((await saved(page))?.worries ?? []).map((w: Saved) => w.text).sort())
    .toEqual(['First worry', 'Second worry']);
});

test('a Heavy item with no next step opens its edit on the next step (from Heavy and from Today)', async ({ page }) => {
  await openApp(page, 'heavy');
  await page.getByRole('button', { name: /^No next step yet\. Tap to add one: who to message\?/ }).first().click();
  let dlg = page.getByRole('dialog', { name: 'Edit' });
  await expect(dlg.getByLabel(/^Next physical action/)).toBeFocused();
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  await expect(dlg).toBeHidden();

  await tab(page, 'Today');
  const nudge = page.getByRole('link', { name: /^Legal matter/ });
  await expect(nudge).toContainText('No next step yet. Tap to add one: who to message?');
  await nudge.click();
  await expectTitle(page, 'Heavy');
  dlg = page.getByRole('dialog', { name: 'Edit' });
  await expect(dlg.getByLabel(/^Next physical action/)).toBeFocused();
  await dlg.getByLabel(/^Next physical action/).fill('Email the office for the form list');
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dlg).toBeHidden();
  const item = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Legal matter' }) });
  await expect(item.getByText('Email the office for the form list')).toBeVisible();
  await expect.poll(async () => (await saved(page))?.heavy?.[0]?.nextAction).toBe('Email the office for the form list');

  await tab(page, 'Today');
  await expect(page.getByRole('link', { name: /^Legal matter/ })).toContainText('Next: Email the office for the form list');
});

test('export JSON contains the talk', async ({ page }) => {
  await openApp(page);
  await addTalk(page, { who: 'P.', did: 'Asked a friend to join the next camp' });
  await moreItem(page, 'Settings');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download backup' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`anchor-backup-${await pageToday(page)}.json`);
  const path = await download.path();
  const data = JSON.parse(await readFile(path, 'utf8'));
  expect(data.schemaVersion).toBe(1);
  expect(data.talks).toHaveLength(1);
  expect(data.talks[0]).toMatchObject({ who: 'P.', did: 'Asked a friend to join the next camp', role: 'parent' });
  expect(data.bets).toHaveLength(3);
  expect(data.lock?.pinHash).toBeUndefined();
});

test('reload keeps the data', async ({ page }) => {
  await openApp(page);
  await setAnchor(page, 'Book three parent calls');
  await addAction(page, 'Draft the call script');
  await addTalk(page, { who: 'K.', did: 'Signed up her daughter for the waitlist' });
  await moreItem(page, 'Heavy');
  await dumpWorry(page, 'Tax form before Friday');

  await page.reload();
  await expectTitle(page, 'Heavy');
  await expect(page.getByText('Tax form before Friday')).toBeVisible();

  await tab(page, 'Today');
  await expect(page.getByRole('checkbox', { name: /Book three parent calls/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Draft the call script' })).toBeVisible();

  await tab(page, 'Talks');
  await expect(page.getByRole('article').filter({ hasText: 'Signed up her daughter for the waitlist' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Talks this week' })).toHaveAttribute('aria-valuenow', '1');

  // A second reload straight from Talks: still there.
  await page.reload();
  await expectTitle(page, 'Talks');
  await expect(page.getByRole('article').filter({ hasText: 'Signed up her daughter for the waitlist' })).toBeVisible();
});

test.describe('weekly review', () => {
  test.describe('on a Sunday night', () => {
    test.use({ startAt: '2026-11-01T20:30:00+07:00' });

    test('next week’s anchor from the review is offered on Monday', async ({ page }) => {
      await openApp(page);
      await moreItem(page, 'Weekly review');
      await expect(page.getByRole('heading', { name: 'Week 44' })).toBeVisible();
      // No bet review is due yet, so calls are optional and the anchor alone is enough.
      await expect(page.getByText('Not due yet · 3 bets (optional)')).toBeVisible();
      await page.getByLabel(/^Next week’s anchor/).fill('Call 5 parents about the December camp');
      await page.getByRole('button', { name: 'Save review' }).click();
      await expect(page.getByText('Review saved. Nice work closing the week.')).toBeVisible();
      await expect.poll(async () => (await saved(page))?.reviews?.[0]).toMatchObject({
        weekKey: '2026-W44', nextAnchor: 'Call 5 parents about the December camp', betDecisions: [],
      });

      await page.clock.setSystemTime(bkk('2026-11-02T08:30'));
      await openApp(page, 'today');
      const what = page.getByLabel('What', { exact: true });
      await expect(what).toHaveValue('Call 5 parents about the December camp');
      await expect(page.getByText('From last week’s review. Keep it or change it.')).toBeVisible();
      expect((await saved(page))?.days?.['2026-11-02']?.anchor).toBeUndefined(); // offered, not saved
      await page.getByRole('button', { name: 'Set anchor' }).click();
      await expect(page.getByRole('checkbox', { name: /Call 5 parents about the December camp/ })).toBeVisible();
      await expect.poll(async () => (await saved(page))?.days?.['2026-11-02']?.anchor?.text)
        .toBe('Call 5 parents about the December camp');
    });

    test('an unsaved review held past Sunday says so and can be discarded', async ({ page }) => {
      await openApp(page);
      await moreItem(page, 'Weekly review');
      await expect(page.getByRole('heading', { name: 'Week 44' })).toBeVisible();
      const wins = page.getByLabel(/^Wins/);
      await wins.fill('Two parents paid');
      await wins.blur();

      // Monday morning, same session: the typed review keeps the screen on Week 44, and says so.
      await page.clock.setSystemTime(bkk('2026-11-02T08:30'));
      await page.clock.fastForward('00:31');
      const held = page.getByText('Still writing Week 44. Save it, or discard it to move on.');
      await expect(held).toBeVisible();
      await expect(wins).toHaveValue('Two parents paid');

      await page.getByRole('button', { name: 'Discard' }).click();
      await expect(held).toHaveCount(0);
      await expect(page.getByLabel(/^Wins/)).toHaveValue('');
      await page.getByRole('radiogroup', { name: 'Which week' }).getByRole('radio', { name: 'This week' }).click();
      await expect(page.getByRole('heading', { name: 'Week 45' })).toBeVisible();
      expect((await saved(page))?.reviews ?? []).toEqual([]);
    });
  });

  test.describe('when one bet’s review is due', () => {
    test.use({ startAt: '2026-12-02T09:00:00+07:00' });

    test('the review only asks for a call on the bet that is due', async ({ page }) => {
      await openApp(page);
      await moreItem(page, 'Weekly review');
      const due = 'SHIFT High (alumni community)';
      await expect(page.getByText('Review was due')).toBeVisible();
      await expect(page.getByText('Not due yet · 2 bets (optional)')).toBeVisible();

      await page.getByRole('button', { name: 'Save review' }).click();
      await expect(page.getByText('Pick one: continue, change, park or kill.')).toBeVisible();
      await page.getByRole('radiogroup', { name: `Decision for ${due}` }).getByRole('radio', { name: 'Continue' }).click();
      await expect(page.getByText('Optional for continue.')).toBeVisible();
      await page.getByRole('button', { name: 'Save review' }).click();
      await expect(page.getByText('Review saved. Nice work closing the week.')).toBeVisible();

      await expect.poll(async () => (await saved(page))?.reviews?.length).toBe(1);
      const s = await saved(page);
      expect(s?.reviews[0].betDecisions).toEqual([{ betId: betId(s, due), verdict: 'continue', why: '' }]);
      const bet = (name: string) => s?.bets.find((b: Saved) => b.name === name);
      expect(bet(due)).toMatchObject({ reviewOn: '2026-12-16', decisions: [{ date: '2026-12-02', verdict: 'continue', why: '' }] });
      expect(bet('SHIFT')?.decisions).toEqual([]);
      expect(bet('School SHIFT (first school)')?.decisions).toEqual([]);
    });
  });
});

test('/anchor without the slash moves to /anchor/ (inside the service worker scope)', async ({ page }) => {
  await page.goto('/anchor#/talks');
  await expect(page).toHaveURL(/\/anchor\/#\/talks$/);
  await expectTitle(page, 'Talks');
});

test('Return in a name field moves on instead of submitting half a form', async ({ page }) => {
  await openApp(page);
  await tab(page, 'Funnel');
  await page.getByRole('button', { name: 'Add a row' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a row' });
  await sheet.getByLabel('Name').fill('SHIFT[3]');
  await sheet.getByLabel('Name').press('Enter');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('radio', { name: 'Cohort' })).toBeFocused();
  await sheet.getByLabel('Reach', { exact: true }).fill('500');
  await sheet.getByLabel('Reach', { exact: true }).press('Enter');
  await expect(sheet.getByLabel('Link clicks', { exact: true })).toBeFocused();
  await expect(sheet).toBeVisible();
  expect((await saved(page))?.funnel?.length).toBe(2);
});

test('a stray tap on the backdrop keeps a half-filled Heavy sheet', async ({ page }) => {
  await openApp(page, 'heavy');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a heavy thing' });
  await sheet.getByLabel('What is it?').fill('Tax filing');
  await page.mouse.click(195, 20); // the dimmed strip above the sheet
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toBeHidden();
  // Closing without Cancel keeps the text for next time.
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add a heavy thing' }).getByLabel('What is it?')).toHaveValue('Tax filing');
});

test('a double-tap on Save talk logs one talk and no errors', async ({ page }) => {
  await openApp(page, 'talks');
  await page.getByRole('radiogroup', { name: 'Role', exact: true }).getByRole('radio', { name: 'Teacher', exact: true }).click();
  await page.getByLabel('What did they actually do?').fill('Shared the camp poster');
  await page.getByRole('button', { name: 'Save talk' }).dblclick();
  await expect(page.getByText(/^Saved\. 1 of 10 this week\.$/)).toBeVisible();
  await expect.poll(async () => (await saved(page))?.talks?.length).toBe(1);
  await expect(page.locator('.field__error')).toHaveCount(0);
});

test('going back closes a sheet left open on the previous screen', async ({ page }) => {
  await openApp(page);
  await tab(page, 'Funnel');
  await page.getByRole('button', { name: 'Add a row' }).click();
  await page.getByRole('dialog', { name: 'Add a row' }).getByLabel('Name').fill('Half typed');
  await page.goBack();
  await expectTitle(page, 'Today');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Like the Close button: the half-typed row is still there next time.
  await tab(page, 'Funnel');
  await page.getByRole('button', { name: 'Add a row' }).click();
  await expect(page.getByRole('dialog', { name: 'Add a row' }).getByLabel('Name')).toHaveValue('Half typed');
});

test('a second tab never wipes what the other tab saved', async ({ page }) => {
  await openApp(page);
  const other = await page.context().newPage();
  await prepPage(other);
  await openApp(other);
  await addTalk(other, { who: 'T.', did: 'Paid for the next cohort' });
  await expect.poll(async () => (await saved(other))?.talks?.length).toBe(1);
  await other.close();

  // The first tab (opened earlier) picks up the other tab's save on its own…
  await expect(page.getByRole('link', { name: /Talks/ }).filter({ hasText: '1/10' })).toBeVisible();
  // …so a small change here doesn't write its old copy over the talk.
  await page.getByRole('button', { name: 'Energy: not answered yet' }).click();
  await page.getByRole('radiogroup', { name: 'Energy' }).getByRole('radio', { name: 'Energy 3 of 5' }).click();
  const today = await pageToday(page);
  await expect.poll(async () => (await saved(page))?.days?.[today]?.checkin?.energy).toBe(3);
  expect((await saved(page))?.talks?.map((t: Saved) => t.did)).toEqual(['Paid for the next cohort']);
});

test('a time-boxed timer past its box shows a banner on every screen; Stop asks what moved', async ({ page }) => {
  await openApp(page);
  await seedTimer(page, 95, { category: 'build', timeboxMin: 90, note: 'Escape check: alumni board', source: 'escape' });
  const banner = page.locator('.timebox-banner');
  await expect(banner).toHaveText(/Your 90 minutes are up\. What moved\?/);
  await tab(page, 'Talks');
  await expect(banner).toBeVisible();

  await banner.getByRole('button', { name: 'Stop' }).click();
  const dlg = page.getByRole('dialog', { name: 'What moved?' });
  await expect(dlg).toBeVisible();
  await dlg.getByRole('textbox', { name: /^What moved\?/ }).fill('Two alumni replied');
  await dlg.getByRole('button', { name: 'Log it' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByText(/^Logged 1h 3\dm of Build\.$/)).toBeVisible();
  await expect(banner).toBeHidden();

  await expect.poll(async () => (await saved(page))?.timeLog?.length).toBe(1);
  const s = await saved(page);
  expect(s?.activeTimer).toBeUndefined();
  expect(s?.timeLog[0]).toMatchObject({
    category: 'build', source: 'escape', note: 'Escape check: alumni board · Moved: Two alumni replied',
  });
});

test('a forgotten timer counts no hours, and stopping it asks when it really stopped', async ({ page }) => {
  await openApp(page);
  await seedTimer(page, 20 * 60, { category: 'sell' });
  await expect(page.locator('.timebox-banner')).toHaveText(/Sell & talk timer is still running/);

  await moreItem(page, 'Time');
  // B1: the forgotten timer adds nothing to the week until it is stopped.
  await expect(page.getByText('No time logged in this week.')).toBeVisible();
  await page.getByRole('button', { name: 'Stop and log' }).click();
  const dlg = page.getByRole('dialog', { name: 'When did you stop?' });
  await expect(dlg).toBeVisible();
  // No box: only the day is filled in, so one tap can't log the 16-hour cap.
  await expect(dlg.getByLabel('Stopped at')).toHaveValue('');
  await dlg.getByRole('button', { name: 'Log it', exact: true }).click();
  await expect(dlg.getByText('Pick a date and a time.')).toBeVisible();
  await dlg.getByRole('button', { name: 'Don’t log it' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByText('Not logged. The timer is off.')).toBeVisible();
  await expect.poll(async () => (await saved(page))?.activeTimer).toBeUndefined();
  expect((await saved(page))?.timeLog).toEqual([]);
});

test('toasts from the last screen clear when you change tabs', async ({ page }) => {
  await openApp(page, 'talks');
  await page.getByRole('radiogroup', { name: 'Role', exact: true }).getByRole('radio', { name: 'Teacher', exact: true }).click();
  await page.getByLabel('What did they actually do?').fill('Shared the camp poster');
  await page.getByRole('button', { name: 'Save talk' }).click();
  const t = page.locator('.toast').filter({ hasText: /^Saved\./ });
  await expect(t).toBeVisible();
  await page.waitForTimeout(1100);
  await tab(page, 'Funnel');
  await expect(t).toHaveCount(0);
});

test('erasing in one tab clears the other tab too (no old drafts, no old data)', async ({ page }) => {
  await openApp(page, 'talks');
  await page.getByLabel('What did they actually do?').fill('Half-typed note');
  const other = await page.context().newPage();
  await prepPage(other);
  await openApp(other, 'settings');
  await other.getByRole('button', { name: 'Erase all data on this device' }).click();
  const dlg = other.getByRole('dialog', { name: 'Erase everything on this device?' });
  await dlg.getByLabel('Type ERASE to confirm').fill('ERASE');
  await dlg.getByRole('button', { name: 'Erase', exact: true }).click();
  await expect(other.getByText('Erased. Anchor is starting fresh on this device.')).toBeVisible();
  await other.close();

  await expect(page.getByText('Anchor was erased in another tab. Starting fresh here too.')).toBeVisible();
  await expect(page.getByLabel('What did they actually do?')).toHaveValue('');
});
