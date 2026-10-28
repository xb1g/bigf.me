// Settings — profile, backup (export/import), end-to-end encrypted sync, app lock PIN,
// erase, and the "Privacy, in plain words" notes.
// Secrets: the sync passphrase lives in module memory for the session; it is written to this
// device only when the user turns on "Remember passphrase". The PIN is stored as a PBKDF2 hash.

import type { AnchorState, ViewContext } from '../core/types.ts';
import { h } from '../core/dom.ts';
import type { Child } from '../core/dom.ts';
import {
  badge, button, card, checkboxRow, chips, confirmDialog, form, iconButton, openSheet, segmented, stepper,
  textField, toast,
} from '../core/ui.ts';
import { datasetGeneration, eraseAll, getState, prepareImport, replaceState, update } from '../core/store.ts';
import { decryptJSON, encryptJSON, hashPin, randomSaltB64, verifyPin } from '../core/crypto.ts';
import { APP_VERSION } from '../core/constants.ts';
import { activeBetCount } from '../core/metrics.ts';
import { nowIso, todayISO } from '../core/dates.ts';
import {
  BACKUP_TOO_BIG_COPY, BUILD_TARGET_OPTIONS, IMPORT_COPY, LOCK_AFTER_OPTIONS, MAX_BETS_MAX, MAX_BETS_MIN, MAX_IMPORT_BYTES,
  MAX_SYNC_BLOB_BYTES, MIN_PASSPHRASE, PASS_KEY, SYNC_TIMEOUT_MS, TALK_TARGET_MAX, TALK_TARGET_MIN, TOKEN_KEY,
  VAULT_URL, backupFilename, backupTooBigToRestore, buildTargetSummary, buildTargetValue, classifyHttp, conflictText,
  deviceSummary, errorCodeOf, exportPayload, exportText, hasUnsyncedChanges, importErrorCopy, lockAfterLabel,
  looksLikeAnchor, maxBetsNote,
  newPassphraseIssue, newPinIssue, parseBackupText, parseGetBody, parsePutBody, previewRows, pulledMessage,
  pushedMessage, syncErrorCopy, syncStatusText, utf8Bytes,
} from './settings.logic.ts';
import type { PreviewRow, SyncErrorCode } from './settings.logic.ts';

// ---------------------------------------------------------------------------
// Device-local session (never part of AnchorState)
// ---------------------------------------------------------------------------

interface Session { loaded: boolean; token: string; pass: string; remember: boolean }

let session: Session = { loaded: false, token: '', pass: '', remember: false };

function lsGet(key: string): string | null {
  try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
}
function lsSet(key: string, value: string): void {
  try { globalThis.localStorage?.setItem(key, value); } catch { /* storage full or blocked: keep in memory */ }
}
function lsRemove(key: string): void {
  try { globalThis.localStorage?.removeItem(key); } catch { /* ignore */ }
}

function loadSession(): void {
  if (session.loaded) return;
  const remembered = lsGet(PASS_KEY);
  session = { loaded: true, token: lsGet(TOKEN_KEY) ?? '', pass: remembered ?? '', remember: remembered !== null };
}

/**
 * Forget the in-memory sync token and passphrase, and cut off an in-flight sync request (called on every
 * erase: Settings, the lock screen, or another tab). Async steps still running check datasetGeneration().
 */
export function clearSyncSession(): void {
  session = { loaded: false, token: '', pass: '', remember: false };
  syncAbort?.abort();
  syncAbort = null;
}

// ---------------------------------------------------------------------------
// View-local UI state
// ---------------------------------------------------------------------------

type Busy = '' | 'push' | 'pull';
interface SyncUi { busy: Busy; error: string; showPass: boolean }
interface NavUi { jumped: boolean }

const BUSY_TEXT: Record<Exclude<Busy, ''>, string> = {
  push: 'Encrypting and pushing…',
  pull: 'Pulling and decrypting…',
};

let pendingFrame = 0;
let syncing = false;
/** Aborts the in-flight vault request when Anchor is erased. */
let syncAbort: AbortController | null = null;
let fileInput: HTMLInputElement | null = null;

/**
 * Run after the app's next render (its rAF is registered before ours). Not cancelled in cleanup():
 * the app calls cleanup() right before that render, and the callbacks only look up ids from this view.
 */
function afterRender(fn: () => void): void {
  if (pendingFrame) cancelAnimationFrame(pendingFrame);
  pendingFrame = requestAnimationFrame(() => { pendingFrame = 0; fn(); });
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function jumpToHow(): void {
  const el = document.getElementById('how-anchor-works');
  if (!el) return;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function render(ctx: ViewContext): HTMLElement {
  loadSession();
  const nav = ctx.draft<NavUi>('nav', () => ({ jumped: false }));
  if (ctx.route.params.section === 'how') {
    if (!nav.jumped) {
      nav.jumped = true;
      afterRender(jumpToHow);
    }
  } else {
    nav.jumped = false;
  }

  return h('div', { class: 'view settings-view' },
    h('div', { class: 'row-between wrap' },
      h('p', { class: 'small muted' }, 'Your data stays on this device unless you export or sync.'),
      button('Privacy, in plain words', { variant: 'ghost', size: 'sm', iconRight: 'arrow-right', key: 'settings-how-jump', class: 'settings-jump', onClick: jumpToHow }),
    ),
    profileCard(ctx),
    backupCard(ctx),
    syncCard(ctx),
    lockCard(ctx),
    dangerCard(ctx),
    howCard(),
    h('p', { class: 'tiny muted center tnum' }, `Anchor ${APP_VERSION}`),
  );
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

function profileCard(ctx: ViewContext): HTMLElement {
  const p = ctx.state.profile;
  const betNote = maxBetsNote(activeBetCount(ctx.state.bets), p.maxActiveBets);
  return card({ title: 'Profile', titleLevel: 2 },
    h('div', { class: 'stack-lg' },
      textField({
        id: 'settings-name', label: 'Name', value: p.name, maxLength: 40, autocomplete: 'given-name', enterkeyhint: 'done',
        onInput: (v) => { ctx.update((d) => { d.profile.name = v; }, { silent: true }); },
        onChange: (v) => { ctx.update((d) => { d.profile.name = v.trim(); }, { silent: true }); },
      }),
      h('div', { class: 'stack-sm' },
        stepper({
          id: 'settings-talk-target', label: 'Weekly talk target', value: p.weeklyTalkTarget,
          min: TALK_TARGET_MIN, max: TALK_TARGET_MAX,
          format: (v) => (v === undefined ? '—' : `${v} a week`),
          onChange: (v) => { ctx.update((d) => { d.profile.weeklyTalkTarget = v; }); },
        }),
        h('p', { class: 'small muted' }, 'Conversations you aim for each week on Talks.'),
      ),
      h('div', { class: 'stack-sm' },
        segmented<string>({
          id: 'settings-build-target', label: 'Build share target', value: buildTargetValue(p.buildSellTarget) || undefined,
          options: BUILD_TARGET_OPTIONS,
          onChange: (v) => {
            const n = Number(v);
            if (Number.isFinite(n)) ctx.update((d) => { d.profile.buildSellTarget = n; });
          },
        }),
        h('p', { class: 'small muted' }, `${buildTargetSummary(p.buildSellTarget)}. Today and Time compare your hours to this.`),
      ),
      h('div', { class: 'stack-sm' },
        stepper({
          id: 'settings-max-bets', label: 'Max active bets', value: p.maxActiveBets,
          min: MAX_BETS_MIN, max: MAX_BETS_MAX,
          onChange: (v) => { ctx.update((d) => { d.profile.maxActiveBets = v; }); },
        }),
        h('p', { class: betNote ? 'small text-warn' : 'small muted' }, betNote ?? 'Fewer fronts, more finishing. Three is a good limit.'),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Backup: export / import
// ---------------------------------------------------------------------------

function isStandalone(): boolean {
  try {
    return matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/** Save a text file. In the installed iPhone app, prefer the share sheet ("Save to Files"). */
async function saveFile(filename: string, text: string): Promise<void> {
  const type = 'application/json';
  if (isStandalone() && typeof File === 'function' && typeof navigator.canShare === 'function') {
    try {
      const file = new File([text], filename, { type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return;
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return; // user closed the share sheet
      // Fall through to a normal download.
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function exportPlain(): void {
  const text = exportText(getState());
  void saveFile(backupFilename(todayISO(), false), text)
    .then(() => {
      if (backupTooBigToRestore(text)) toast(BACKUP_TOO_BIG_COPY, { tone: 'warn', durationMs: 0 });
      else toast('Backup ready. Keep it somewhere private.', { tone: 'good' });
    })
    .catch(() => toast('Couldn’t save the file. Try again.', { tone: 'warn' }));
}

function exportEncrypted(): void {
  void secretSheet({
    title: 'Encrypted backup',
    intro: `Pick a passphrase of ${MIN_PASSPHRASE}+ characters. You’ll need it to open this file. No one can recover it for you.`,
    fields: [
      { id: 'export-pass', label: 'Passphrase', kind: 'pass', autocomplete: 'new-password' },
      { id: 'export-pass-repeat', label: 'Same passphrase again', kind: 'pass', autocomplete: 'new-password' },
    ],
    confirmLabel: 'Download',
    busyLabel: 'Encrypting…',
    submit: async ([pass, repeat]) => {
      const issue = newPassphraseIssue(pass, repeat);
      if (issue) return issue;
      let tooBig = false;
      try {
        const payload = exportPayload(getState());
        tooBig = backupTooBigToRestore(JSON.stringify(payload));
        const env = await encryptJSON(payload, pass);
        await saveFile(backupFilename(todayISO(), true), JSON.stringify(env));
      } catch (err) {
        return syncErrorCopy(errorCodeOf(err));
      }
      if (tooBig) toast(BACKUP_TOO_BIG_COPY, { tone: 'warn', durationMs: 0 });
      else toast('Encrypted backup ready.', { tone: 'good' });
      return null;
    },
  });
}

function pickFile(onFile: (f: File) => void): void {
  if (!fileInput) {
    fileInput = h('input', {
      type: 'file', accept: 'application/json,.json', class: 'sr-only', tabindex: -1, 'aria-hidden': 'true',
    });
    document.body.appendChild(fileInput);
  }
  const input = fileInput;
  input.value = '';
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) onFile(f);
  };
  input.click();
}

function importBackup(): void {
  pickFile((file) => { void handleImportFile(file); });
}

async function handleImportFile(file: File): Promise<void> {
  if (file.size > MAX_IMPORT_BYTES) {
    toast(IMPORT_COPY.tooBig, { tone: 'warn' });
    return;
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    toast(IMPORT_COPY.damaged, { tone: 'warn' });
    return;
  }
  const parsed = parseBackupText(text);
  if (parsed.kind === 'invalid') {
    toast(parsed.message, { tone: 'warn' });
    return;
  }
  if (parsed.kind === 'plain') {
    await confirmImport(parsed.data);
    return;
  }
  let decrypted: unknown = null;
  const ok = await secretSheet({
    title: 'Open encrypted backup',
    intro: 'Enter the passphrase you used for this file.',
    fields: [{ id: 'import-pass', label: 'Passphrase', kind: 'pass', autocomplete: 'current-password' }],
    confirmLabel: 'Open',
    busyLabel: 'Decrypting…',
    submit: async ([pass]) => {
      if (!pass) return IMPORT_COPY.needPass;
      let data: unknown;
      try {
        data = await decryptJSON(parsed.envelope, pass);
      } catch (err) {
        return importErrorCopy(errorCodeOf(err));
      }
      if (!looksLikeAnchor(data)) return IMPORT_COPY.notAnchor;
      decrypted = data;
      return null;
    },
  });
  if (ok && decrypted) await confirmImport(decrypted);
}

async function confirmImport(raw: unknown): Promise<void> {
  // Caps, empty-record dropping and the size limit all run before the preview (A7).
  const prep = prepareImport(raw);
  if (!prep.ok) {
    toast(IMPORT_COPY.tooBigOpened, { tone: 'warn' });
    return;
  }
  const next = prep.state;
  const gen = datasetGeneration();
  const ok = await confirmDialog({
    title: 'Replace this device’s data?',
    body: h('div', { class: 'stack-sm' },
      h('p', null, 'The backup replaces everything on this device. Your PIN and sync settings stay.'),
      previewTable(previewRows(getState(), next), 'Backup'),
      h('p', { class: 'small muted' }, 'Not sure? Cancel and download a backup of this device first.'),
    ),
    confirmLabel: 'Replace',
    danger: true,
  });
  if (!ok) return;
  if (datasetGeneration() !== gen) {
    toast(IMPORT_COPY.changedMeanwhile, { tone: 'warn' });
    return;
  }
  next.updatedAt = nowIso(); // a restore is a fresh local change (so sync sees it as unpushed)
  replaceState(next, { preserve: ['lock', 'sync'] });
  toast('Backup restored.', { tone: 'good' });
}

function previewTable(rows: PreviewRow[], incomingLabel: string): HTMLElement {
  const shown = rows.filter((r) => r.current > 0 || r.incoming > 0);
  if (!shown.length) return h('p', { class: 'small muted' }, 'Both are empty.');
  return h('table', { class: 'settings-preview small' },
    h('caption', { class: 'sr-only' }, `Items on this device and in the ${incomingLabel.toLowerCase()} copy`),
    h('thead', null,
      h('tr', { class: 'label' },
        h('th', { scope: 'col' }, 'What'),
        h('th', { scope: 'col' }, 'Now'),
        h('th', { scope: 'col' }, incomingLabel))),
    h('tbody', null,
      shown.map((r) => h('tr', null,
        h('th', { scope: 'row' }, r.label),
        h('td', { class: 'tnum' }, r.current),
        h('td', { class: 'tnum strong' }, r.incoming)))),
  );
}

function backupCard(ctx: ViewContext): HTMLElement {
  const bytes = utf8Bytes(JSON.stringify(ctx.state));
  return card({ title: 'Backup', titleLevel: 2, subtitle: deviceSummary(ctx.state, bytes) },
    h('div', { class: 'stack' },
      h('div', { class: 'stack-sm' },
        button('Download backup', { icon: 'download', block: true, key: 'backup-plain', onClick: exportPlain }),
        h('p', { class: 'small muted' }, 'A readable JSON file. Anyone who opens it can read it.'),
      ),
      h('div', { class: 'stack-sm' },
        button('Download encrypted backup', { icon: 'lock', block: true, key: 'backup-encrypted', onClick: exportEncrypted }),
        h('p', { class: 'small muted' }, 'Locked with a passphrase you choose.'),
      ),
      h('div', { class: 'stack-sm' },
        button('Import a backup', { icon: 'upload', block: true, key: 'backup-import', onClick: importBackup }),
        h('p', { class: 'small muted' }, 'You’ll see what’s inside before anything is replaced.'),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

class SyncFail extends Error {
  readonly code: SyncErrorCode;
  constructor(code: SyncErrorCode) {
    super(code);
    this.code = code;
    this.name = 'SyncFail';
  }
}

function failCode(err: unknown, gen?: number): SyncErrorCode {
  if (err instanceof SyncFail) return err.code;
  // An erase aborts the request: that is not a timeout.
  if (gen !== undefined && datasetGeneration() !== gen) return 'replaced';
  return errorCodeOf(err, typeof navigator === 'undefined' || navigator.onLine !== false);
}

async function vaultRequest(method: 'GET' | 'PUT', token: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  const ctrl = new AbortController();
  syncAbort = ctrl; // erase aborts it (clearSyncSession)
  const timer = setTimeout(() => ctrl.abort(), SYNC_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(VAULT_URL, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store', credentials: 'same-origin', signal: ctrl.signal,
    });
    let json: unknown = null;
    try { json = await res.json(); } catch { json = null; }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
    if (syncAbort === ctrl) syncAbort = null;
  }
}

/** Stop an async sync step whose dataset was replaced or erased meanwhile (import, pull, erase; any tab). */
function assertSameDataset(gen: number): void {
  if (datasetGeneration() !== gen) throw new SyncFail('replaced');
}

function focusSoon(id: string): void {
  afterRender(() => document.getElementById(id)?.focus());
}

/** Check token/passphrase/connection before any request. Returns null (and shows why) when not ready. */
function readyToSync(ctx: ViewContext, ui: SyncUi, forPush: boolean): { token: string; pass: string } | null {
  const token = session.token.trim();
  const pass = session.pass;
  let code: SyncErrorCode | null = null;
  let focusId = '';
  if (!token) { code = 'missing_token'; focusId = 'sync-token'; }
  else if (!pass) { code = 'missing_pass'; focusId = 'sync-pass'; }
  else if (forPush && pass.length < MIN_PASSPHRASE) { code = 'short_pass'; focusId = 'sync-pass'; }
  else if (typeof navigator !== 'undefined' && navigator.onLine === false) code = 'offline';
  if (!code) return { token, pass };
  ui.error = syncErrorCopy(code);
  ctx.rerender();
  if (focusId) focusSoon(focusId);
  return null;
}

function setBusy(ctx: ViewContext, ui: SyncUi, busy: Busy): void {
  syncing = busy !== '';
  ui.busy = busy;
  if (busy) ui.error = '';
  ctx.rerender();
}

async function doPush(ctx: ViewContext, ui: SyncUi, ifRevOverride?: number): Promise<void> {
  if (syncing) return;
  const creds = readyToSync(ctx, ui, true);
  if (!creds) return;
  setBusy(ctx, ui, 'push');
  let conflictRev: number | null = null;
  const gen = datasetGeneration();
  try {
    // Encrypt exactly this snapshot and remember its updatedAt: edits made while the push is in flight
    // (it can take seconds) are not on the server, so they must still count as unsynced afterwards.
    // ifRev comes from the SAME snapshot, read before any await: if another tab pulls or pushes while
    // this one encrypts, the server is ahead of what is being sent and must answer 409, not accept it (A2).
    const sent = getState();
    const sentUpdatedAt = sent.updatedAt;
    const ifRev = ifRevOverride ?? sent.sync.rev;
    const env = await encryptJSON(exportPayload(sent), creds.pass);
    assertSameDataset(gen);
    const blob = JSON.stringify(env);
    if (utf8Bytes(blob) > MAX_SYNC_BLOB_BYTES) throw new SyncFail('too_large');
    const { status, json } = await vaultRequest('PUT', creds.token, { ifRev, blob });
    const out = classifyHttp(status, json);
    // Replaced/erased while the request was out: never mark the new dataset as synced at this revision.
    if (datasetGeneration() !== gen) throw new SyncFail(out.kind === 'ok' ? 'replaced_after_push' : 'replaced');
    if (out.kind === 'conflict') {
      conflictRev = out.rev;
    } else if (out.kind === 'error') {
      throw new SyncFail(out.code);
    } else {
      const put = parsePutBody(json);
      if (!put) throw new SyncFail('server');
      // Bookkeeping only: keep updatedAt as is so it isn't mistaken for a new change.
      update((d) => {
        d.sync.rev = put.rev;
        d.sync.lastSyncedAt = nowIso();
        d.sync.syncedUpdatedAt = sentUpdatedAt;
      }, { force: true, touch: false });
      toast(pushedMessage(put.rev), { tone: 'good' });
    }
  } catch (err) {
    ui.error = syncErrorCopy(failCode(err, gen));
  } finally {
    setBusy(ctx, ui, '');
  }
  if (conflictRev !== null && datasetGeneration() === gen) openConflict(ctx, ui, conflictRev);
}

async function doPull(ctx: ViewContext, ui: SyncUi, opts: { skipConfirm?: boolean } = {}): Promise<void> {
  if (syncing) return;
  const creds = readyToSync(ctx, ui, false);
  if (!creds) return;
  setBusy(ctx, ui, 'pull');
  let incoming: { state: AnchorState; rev: number } | null = null;
  // A pull started before an import/erase must never land after it (A3): checked after every await.
  const gen = datasetGeneration();
  try {
    const { status, json } = await vaultRequest('GET', creds.token);
    assertSameDataset(gen);
    const out = classifyHttp(status, json);
    if (out.kind !== 'ok') throw new SyncFail(out.kind === 'error' ? out.code : 'server');
    const got = parseGetBody(json);
    if (!got) throw new SyncFail('server');
    if (got.blob === null) {
      toast('Nothing on the server yet. Push from this device first.');
    } else {
      const data = await decryptJSON(got.blob, creds.pass);
      assertSameDataset(gen);
      if (!looksLikeAnchor(data)) throw new SyncFail('not_anchor');
      const prep = prepareImport(data);
      if (!prep.ok) throw new SyncFail('state_too_large');
      incoming = { state: prep.state, rev: got.rev };
    }
  } catch (err) {
    ui.error = syncErrorCopy(failCode(err, gen));
  } finally {
    setBusy(ctx, ui, '');
  }
  if (!incoming) return;

  const local = getState();
  if (!opts.skipConfirm) {
    if (incoming.rev === local.sync.rev && !hasUnsyncedChanges(local)) {
      toast('Already up to date.');
      return;
    }
    const unsynced = hasUnsyncedChanges(local);
    const ok = await confirmDialog({
      title: 'Use the server copy?',
      body: h('div', { class: 'stack-sm' },
        h('p', null, `This replaces everything on this device with server revision ${incoming.rev}.`),
        unsynced ? h('p', { class: 'text-warn' }, 'This device has changes that aren’t on the server. They’ll be replaced.') : null,
        previewTable(previewRows(local, incoming.state), 'Server'),
      ),
      confirmLabel: 'Replace this device',
      danger: unsynced,
    });
    if (!ok) return;
  }
  if (datasetGeneration() !== gen) {
    toast(syncErrorCopy('replaced'), { tone: 'warn' });
    return;
  }
  const rev = incoming.rev;
  replaceState(incoming.state, { preserve: ['lock'] });
  // This device now equals the server copy: record that without counting it as a change.
  update((d) => {
    d.sync.rev = rev;
    d.sync.lastSyncedAt = nowIso();
    d.sync.syncedUpdatedAt = d.updatedAt;
  }, { force: true, touch: false });
  toast(pulledMessage(rev), { tone: 'good' });
}

function openConflict(ctx: ViewContext, ui: SyncUi, serverRev: number): void {
  const localRev = getState().sync.rev;
  openSheet({
    title: 'Two different copies',
    kind: 'dialog',
    content: (close) => h('div', { class: 'stack' },
      h('p', null, conflictText(localRev, serverRev)),
      h('div', { class: 'stack-sm' },
        button('Use server copy (replace this device)', {
          icon: 'download', block: true,
          onClick: () => { close(); void doPull(ctx, ui, { skipConfirm: true }); },
        }),
        button('Overwrite server with this device', {
          icon: 'upload', block: true,
          onClick: () => { close(); void doPush(ctx, ui, serverRev); },
        }),
      ),
      h('p', { class: 'small muted' }, 'Not sure? Download a backup of this device first.'),
      h('div', { class: 'dialog__actions' },
        button('Download backup', { variant: 'ghost', icon: 'download', onClick: exportPlain }),
        button('Cancel', { variant: 'ghost', class: 'dialog__cancel', onClick: () => close() }),
      ),
    ),
  });
}

function syncCard(ctx: ViewContext): HTMLElement {
  const ui = ctx.draft<SyncUi>('sync', () => ({ busy: '', error: '', showPass: false }));
  const sync = ctx.state.sync;
  const busy = ui.busy !== '';
  const clearError = () => {
    if (ui.error) { ui.error = ''; ctx.rerender(); }
  };

  const tokenField = textField({
    id: 'sync-token', label: 'Sync token', type: 'password', value: session.token, autocomplete: 'off',
    hint: 'Saved on this device. It opens the vault door; it can’t read what’s inside.',
    attrs: { autocapitalize: 'off', spellcheck: false },
    onInput: (v) => {
      session.token = v;
      if (v.trim()) lsSet(TOKEN_KEY, v.trim()); else lsRemove(TOKEN_KEY);
      clearError();
    },
  });

  const passField = textField({
    id: 'sync-pass', label: 'Passphrase', type: ui.showPass ? 'text' : 'password', value: session.pass, autocomplete: 'off',
    hint: session.remember
      ? 'Remembered on this device.'
      : 'Kept in memory until you close Anchor. Never sent to the server.',
    attrs: { autocapitalize: 'off', spellcheck: false },
    onInput: (v) => {
      session.pass = v;
      if (session.remember) { if (v) lsSet(PASS_KEY, v); else lsRemove(PASS_KEY); }
      clearError();
    },
  });
  // Put a show/hide toggle beside the input (keeps label + hint wiring from textField).
  const input = passField.querySelector('input');
  if (input) {
    const row = h('div', { class: 'row', style: { gap: 'var(--space-2)', alignItems: 'center' } });
    input.replaceWith(row);
    input.style.flex = '1';
    input.style.minWidth = '0';
    row.append(input, iconButton(ui.showPass ? 'eye-off' : 'eye', 'Show passphrase', {
      key: 'sync-pass-toggle',
      attrs: { 'aria-pressed': ui.showPass, 'aria-controls': 'sync-pass' },
      onClick: () => { ui.showPass = !ui.showPass; ctx.rerender(); },
    }));
  }

  const unpushed = Boolean(sync.lastSyncedAt) && hasUnsyncedChanges(ctx.state);

  return card({
    title: 'Sync', titleLevel: 2, subtitle: 'Optional. End-to-end encrypted.',
    action: badge(sync.lastSyncedAt ? `Rev ${sync.rev}` : 'Not set up', sync.lastSyncedAt ? 'data' : 'muted'),
    attrs: { 'aria-busy': busy ? 'true' : undefined },
  },
  h('div', { class: 'stack' },
    h('div', { class: 'stack-sm' },
      h('p', { class: 'small tnum' }, syncStatusText(sync)),
      unpushed ? h('p', { class: 'small muted' }, 'This device has changes since then.') : null,
    ),
    tokenField,
    passField,
    checkboxRow({
      id: 'sync-remember', label: 'Remember passphrase on this device', checked: session.remember,
      hint: 'It’s saved unencrypted in this browser, where any page on bigf.me can reach it — not just Anchor. Leave it off unless this device is only yours and you don’t open other bigf.me pages in this browser.',
      onChange: (on) => {
        session.remember = on;
        if (on && session.pass) lsSet(PASS_KEY, session.pass);
        if (!on) lsRemove(PASS_KEY);
        ctx.rerender();
      },
    }),
    ui.error ? h('p', { class: 'field__error', role: 'alert' }, ui.error) : null,
    busy ? h('p', { class: 'small muted', role: 'status' }, BUSY_TEXT[ui.busy as Exclude<Busy, ''>]) : null,
    h('div', { class: 'grid-2' },
      button(ui.busy === 'push' ? 'Pushing…' : 'Push', {
        icon: 'upload', key: 'sync-push', disabled: busy, onClick: () => { void doPush(ctx, ui); },
      }),
      button(ui.busy === 'pull' ? 'Pulling…' : 'Pull', {
        icon: 'download', key: 'sync-pull', disabled: busy, onClick: () => { void doPull(ctx, ui); },
      }),
    ),
    h('p', { class: 'small muted' }, 'Push sends this device’s data. Pull replaces this device with the server copy.'),
  ));
}

// ---------------------------------------------------------------------------
// Secret entry sheet (PINs and passphrases). The sheet is never re-rendered, so it updates its own DOM.
// ---------------------------------------------------------------------------

interface SecretFieldSpec { id: string; label: string; kind: 'pin' | 'pass'; autocomplete: string }

/**
 * Ask for one or more secrets. `submit` returns an error message to show, or null when done.
 * Resolves true when submit succeeded, false when closed.
 */
function secretSheet(o: {
  title: string; intro?: Child; fields: SecretFieldSpec[]; confirmLabel: string; busyLabel: string; danger?: boolean;
  submit: (values: string[]) => Promise<string | null>;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    let busy = false;
    const values = o.fields.map(() => '');
    const err = h('p', { class: 'field__error', role: 'alert', hidden: true });
    const status = h('p', { class: 'small muted', role: 'status', 'aria-live': 'polite' });
    const confirm = button(o.confirmLabel, { variant: o.danger ? 'danger' : 'primary', type: 'submit' });
    const confirmLabel = confirm.querySelector('.btn__label');
    const setLabel = (t: string) => { if (confirmLabel) confirmLabel.textContent = t; };
    const fieldEls = o.fields.map((f, i) => textField({
      id: f.id, label: f.label, type: 'password', autocomplete: f.autocomplete,
      inputmode: f.kind === 'pin' ? 'numeric' : undefined,
      maxLength: f.kind === 'pin' ? 8 : undefined,
      enterkeyhint: i === o.fields.length - 1 ? 'done' : 'next',
      attrs: { autocapitalize: 'off', spellcheck: false, pattern: f.kind === 'pin' ? '[0-9]*' : undefined },
      onInput: (v) => { values[i] = v; if (!err.hidden) err.hidden = true; },
    }));

    openSheet({
      title: o.title,
      kind: 'dialog',
      initialFocus: `#${o.fields[0].id}`,
      onClose: () => resolve(done),
      content: (close) => form({
        onSubmit: async (f) => {
          if (busy) return;
          busy = true;
          confirm.disabled = true;
          f.setAttribute('aria-busy', 'true');
          setLabel(o.busyLabel);
          status.textContent = o.busyLabel;
          let msg: string | null;
          try {
            msg = await o.submit(values.slice());
          } catch {
            msg = 'Something went wrong. Nothing changed.';
          }
          busy = false;
          confirm.disabled = false;
          f.removeAttribute('aria-busy');
          setLabel(o.confirmLabel);
          status.textContent = '';
          if (msg === null) {
            done = true;
            close();
            return;
          }
          err.textContent = msg;
          err.hidden = false;
          const first = fieldEls[0]?.querySelector('input');
          first?.focus();
          first?.select();
        },
      },
      o.intro !== undefined ? h('div', { class: 'dialog__text' }, o.intro) : null,
      fieldEls,
      err,
      status,
      h('div', { class: 'dialog__actions' },
        button('Cancel', { variant: 'ghost', class: 'dialog__cancel', onClick: () => close() }),
        confirm,
      )),
    });
  });
}

// ---------------------------------------------------------------------------
// App lock
// ---------------------------------------------------------------------------

const NOT_CURRENT_PIN = 'That’s not your current PIN.';

async function checkCurrentPin(pin: string): Promise<boolean> {
  const { pinHash, pinSalt } = getState().lock;
  if (!pinHash || !pinSalt) return true;
  return verifyPin(pin, pinSalt, pinHash).catch(() => false);
}

async function savePin(pin: string): Promise<void> {
  const salt = randomSaltB64();
  const hash = await hashPin(pin, salt);
  update((d) => { d.lock.pinHash = hash; d.lock.pinSalt = salt; }, { force: true });
}

function setPinFlow(): void {
  void secretSheet({
    title: 'Set a PIN',
    intro: 'Use 4 to 8 digits. The PIN hides the screen. It doesn’t encrypt your data.',
    fields: [
      { id: 'pin-new', label: 'New PIN', kind: 'pin', autocomplete: 'new-password' },
      { id: 'pin-repeat', label: 'Same PIN again', kind: 'pin', autocomplete: 'new-password' },
    ],
    confirmLabel: 'Set PIN',
    busyLabel: 'Saving…',
    submit: async ([pin, repeat]) => {
      const issue = newPinIssue(pin, repeat);
      if (issue) return issue;
      await savePin(pin);
      toast('PIN set. Anchor will ask for it when you open the app.', { tone: 'good' });
      return null;
    },
  });
}

function changePinFlow(): void {
  void secretSheet({
    title: 'Change PIN',
    fields: [
      { id: 'pin-current', label: 'Current PIN', kind: 'pin', autocomplete: 'current-password' },
      { id: 'pin-new', label: 'New PIN', kind: 'pin', autocomplete: 'new-password' },
      { id: 'pin-repeat', label: 'Same new PIN again', kind: 'pin', autocomplete: 'new-password' },
    ],
    confirmLabel: 'Change PIN',
    busyLabel: 'Checking…',
    submit: async ([current, pin, repeat]) => {
      const issue = newPinIssue(pin, repeat);
      if (issue) return issue;
      if (!(await checkCurrentPin(current))) return NOT_CURRENT_PIN;
      await savePin(pin);
      toast('PIN changed.', { tone: 'good' });
      return null;
    },
  });
}

function removePinFlow(): void {
  void secretSheet({
    title: 'Remove PIN',
    intro: 'Anchor will open without a PIN on this device.',
    fields: [{ id: 'pin-current', label: 'Current PIN', kind: 'pin', autocomplete: 'current-password' }],
    confirmLabel: 'Remove PIN',
    busyLabel: 'Checking…',
    danger: true,
    submit: async ([current]) => {
      if (!current) return 'Enter your current PIN.';
      if (!(await checkCurrentPin(current))) return NOT_CURRENT_PIN;
      update((d) => { delete d.lock.pinHash; delete d.lock.pinSalt; }, { force: true });
      toast('PIN removed.');
      return null;
    },
  });
}

function lockCard(ctx: ViewContext): HTMLElement {
  const lock = ctx.state.lock;
  const pinSet = Boolean(lock.pinHash && lock.pinSalt);
  const honest = h('p', { class: 'small muted' },
    'A PIN hides Anchor from people nearby. It does not encrypt the data on this device — someone with access to this browser’s storage could still read it.');
  return card({
    title: 'App lock', titleLevel: 2, subtitle: 'Privacy screen',
    action: badge(pinSet ? 'On' : 'Off', pinSet ? 'good' : 'muted', { icon: pinSet ? 'lock' : undefined }),
  },
  pinSet
    ? h('div', { class: 'stack' },
        h('p', { class: 'small' }, `Locks when you open Anchor and ${lockAfterLabel(lock.lockAfterMin)}.`),
        honest,
        chips<string>({
          id: 'settings-lock-after', label: 'Lock when away for', size: 'sm',
          value: LOCK_AFTER_OPTIONS.some((x) => x.value === String(lock.lockAfterMin)) ? String(lock.lockAfterMin) : undefined,
          options: LOCK_AFTER_OPTIONS,
          onChange: (v) => { ctx.update((d) => { d.lock.lockAfterMin = Number(v); }); },
        }),
        h('div', { class: 'grid-2' },
          button('Change PIN', { icon: 'edit', key: 'pin-change', onClick: changePinFlow }),
          button('Lock now', { icon: 'lock', key: 'pin-lock-now', onClick: () => ctx.lockNow() }),
        ),
        button('Remove PIN', { variant: 'ghost', icon: 'x', key: 'pin-remove', onClick: removePinFlow }),
      )
    : h('div', { class: 'stack' },
        honest,
        button('Set a PIN', { icon: 'lock', block: true, key: 'pin-set', onClick: setPinFlow }),
      ),
  );
}

// ---------------------------------------------------------------------------
// Danger zone
// ---------------------------------------------------------------------------

async function eraseFlow(ctx: ViewContext): Promise<void> {
  const ok = await confirmDialog({
    title: 'Erase everything on this device?',
    body: 'Bets, talks, funnel, time, Heavy, your PIN and sync token — all removed from this device. This can’t be undone. The server copy, if any, stays.',
    confirmLabel: 'Erase',
    danger: true,
    requireText: 'ERASE',
  });
  if (!ok) return;
  eraseAll(); // also clears the sync session and every draft (onErase hook in app.ts)
  clearSyncSession();
  toast('Erased. Anchor is starting fresh on this device.');
  ctx.navigate('today');
}

function dangerCard(ctx: ViewContext): HTMLElement {
  return card({ title: 'Danger zone', titleLevel: 2, tone: 'danger' },
    h('div', { class: 'stack' },
      h('p', { class: 'small muted' }, 'Removes everything Anchor stored on this device. Download a backup first if you might want it back.'),
      button('Erase all data on this device', {
        variant: 'danger', icon: 'trash', block: true, key: 'erase-all', onClick: () => { void eraseFlow(ctx); },
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Privacy, in plain words (the method itself is on More → How Anchor works)
// ---------------------------------------------------------------------------

const HOW: readonly [string, string][] = [
  ['On this device.', 'Everything you enter is saved in this browser, on this device. No account, no tracking, no AI. Nothing leaves unless you export or sync.'],
  ['Backups.', 'A plain backup is a readable file — keep it private. An encrypted backup opens only with the passphrase you chose.'],
  ['Sync is optional and end-to-end encrypted.', 'Your passphrase locks the data on this device (AES-256-GCM, key from PBKDF2) before it’s sent. The server keeps one locked copy and can’t read it. The token only lets you reach that copy.'],
  ['The passphrase is the key.', 'It’s never sent anywhere. If you lose it, the synced copy can’t be opened, and no one can reset it.'],
  ['App lock.', 'The PIN hides the screen. It doesn’t encrypt your data. Forgot it? The lock screen lets you erase this device and pull from sync.'],
  ['Erase.', 'Removes Anchor’s data from this device only.'],
];

function howCard(): HTMLElement {
  return card({ title: 'Privacy, in plain words', titleLevel: 2, attrs: { id: 'how-anchor-works', tabindex: -1 } },
    h('ul', { class: 'stack settings-how', role: 'list' },
      HOW.map(([lead, text]) => h('li', { class: 'small' }, h('strong', null, lead), ' ', h('span', { class: 'muted' }, text))),
    ),
  );
}
