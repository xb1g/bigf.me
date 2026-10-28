// Stop or switch the shared timer from any screen (Today, Time, the shell's timebox banner, escape Go).
// - A timer past its cap (its box + 30 min, or 16 h without a box) was probably forgotten: instead of logging
//   one huge block, ask when it really stopped.
// - A time-boxed timer asks "What moved?" (optional) and saves the answer in the entry's note.
// startTimerSafely() runs the same questions before a new timer replaces a running one.

import type { ActiveTimer, TimeCategory, TimeEntry } from '../core/types.ts';
import { h } from '../core/dom.ts';
import { getState, startTimer, stopTimer, update } from '../core/store.ts';
import type { StartTimerOptions } from '../core/store.ts';
import { timerElapsedMs, timerOverCap } from '../core/metrics.ts';
import { formatDateTime, formatMinutes } from '../core/dates.ts';
import { MAX_BLOCK_HOURS, TIME_CATEGORIES, labelOf } from '../core/constants.ts';
import { button, dateField, form, openSheet, textArea, textField, toast } from '../core/ui.ts';
import { stopMessage, stopTimeDefault, validateStopTime } from './time.logic.ts';

const MOVED_MAX = 280;

/** Options for startTimerSafely (how the running timer closes is asked, not passed). */
export type SafeStartOptions = Omit<StartTimerOptions, 'prev'>;

export interface SafeStartResult {
  /** false when the user closed the question sheet ("Keep running"): nothing changed. */
  started: boolean;
  /** The block logged for the timer that was running before (null: none, under a minute, or not logged). */
  logged: TimeEntry | null;
}

/** True when stopping (or replacing) this timer asks something first: it's past its cap, or it has a timebox. */
export function stopNeedsQuestions(t: ActiveTimer, now: Date = new Date()): boolean {
  return timerOverCap(t, now) || Boolean(t.timeboxMin && t.timeboxMin > 0);
}

function loggedToast(e: TimeEntry | null): void {
  toast(stopMessage(e), { tone: e ? 'good' : 'default' });
}

/**
 * Stop and log the running timer. Asks "When did you stop?" for a forgotten timer and "What moved?" for a
 * time-boxed one (both optional to answer; closing the sheet keeps it running). Toasts what was logged.
 * Resolves true when the timer stopped.
 */
export function stopRunningTimer(): Promise<boolean> {
  const t = getState().activeTimer;
  if (!t) return Promise.resolve(false);
  if (!stopNeedsQuestions(t)) {
    loggedToast(stopTimer());
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    askStop(t, {
      onDone: (end, moved, discard) => {
        if (discard) {
          dropTimer(t);
          toast('Not logged. The timer is off.');
        } else {
          loggedToast(stopTimer({ end, moved }));
        }
        resolve(true);
      },
      onCancel: () => resolve(false),
    });
  });
}

/**
 * Start a timer from any view. With nothing running, or a plain running timer, it starts right away (the
 * running one is logged up to now). When the running timer is forgotten (past its cap) or time-boxed, it
 * first asks "When did you stop?" / "What moved?", then logs it and starts the new one in one step.
 * Never toasts: the caller says what started; `logged` is the block closed for the previous timer.
 */
export function startTimerSafely(category: TimeCategory, opts: SafeStartOptions = {}): Promise<SafeStartResult> {
  const t = getState().activeTimer;
  if (!t || !stopNeedsQuestions(t)) {
    return Promise.resolve({ started: true, logged: startTimer(category, opts).logged });
  }
  return new Promise((resolve) => {
    askStop(t, {
      nextLabel: labelOf(TIME_CATEGORIES, category),
      onDone: (end, moved, discard) => {
        if (discard) {
          dropTimer(t);
          startTimer(category, opts);
          resolve({ started: true, logged: null });
          return;
        }
        resolve({ started: true, logged: startTimer(category, { ...opts, prev: { end, moved } }).logged });
      },
      onCancel: () => resolve({ started: false, logged: null }),
    });
  });
}

/** Forget a forgotten timer without logging it (only if it is still the same timer). */
function dropTimer(t: ActiveTimer): void {
  update((d) => {
    if (d.activeTimer && d.activeTimer.startedAt === t.startedAt) d.activeTimer = undefined;
  }, { force: true });
}

interface AskOpts {
  /** Set when a new timer starts after this one (changes the button label). */
  nextLabel?: string;
  /** end: only for a forgotten timer; moved: the optional answer; discard: "Don't log it". */
  onDone: (end: Date | undefined, moved: string, discard: boolean) => void;
  onCancel: () => void;
}

function askStop(t: ActiveTimer, o: AskOpts): void {
  const forgotten = timerOverCap(t);
  const boxed = Boolean(t.timeboxMin && t.timeboxMin > 0);
  const label = labelOf(TIME_CATEGORIES, t.category);
  const v = stopTimeDefault(t);
  let moved = '';
  let finished = false;
  const err = h('p', { class: 'field__error', role: 'alert', hidden: true });
  const title = forgotten ? 'When did you stop?' : 'What moved?';
  const primary = o.nextLabel ? `Log it, start ${o.nextLabel}` : 'Log it';

  const stillSame = (close: () => void): boolean => {
    const cur = getState().activeTimer;
    if (cur && cur.startedAt === t.startedAt) return true;
    finished = true;
    close();
    toast('That timer has already stopped.');
    o.onCancel();
    return false;
  };

  openSheet({
    title,
    kind: 'dialog',
    dismissOnBackdrop: false,
    initialFocus: forgotten ? '#timer-stop-time' : '#timer-stop-moved',
    onClose: () => { if (!finished) { finished = true; o.onCancel(); } },
    content: (close) => form({
      ariaLabel: title,
      onSubmit: () => {
        if (!stillSame(close)) return;
        let end: Date | undefined;
        if (forgotten) {
          const r = validateStopTime(t, v);
          if (!r.ok) {
            err.textContent = r.error;
            err.hidden = false;
            return;
          }
          end = r.end;
        }
        finished = true;
        close();
        o.onDone(end, moved.trim(), false);
      },
    },
    h('div', { class: 'dialog__text' },
      forgotten
        ? [
            h('p', null, boxed
              ? `This timer has run since ${formatDateTime(t.startedAt)}, past its ${t.timeboxMin} min box.`
              : `This timer has run since ${formatDateTime(t.startedAt)}. That looks like a forgotten timer.`),
            h('p', { class: 'small muted' }, boxed
              ? 'When did you really stop? The end of the box is filled in.'
              : `Pick the time you really stopped. Up to ${MAX_BLOCK_HOURS} hours.`),
          ]
        : h('p', null, `${formatMinutes(timerElapsedMs(t) / 60_000)} of ${label}${t.timeboxMin ? ` (a ${t.timeboxMin} min box)` : ''}. One line is enough.`),
    ),
    forgotten
      ? h('div', { class: 'grid-2' },
          dateField({
            id: 'timer-stop-date', label: 'Date', value: v.date,
            onInput: (val) => { v.date = val; err.hidden = true; }, onChange: (val) => { v.date = val; err.hidden = true; },
          }),
          textField({
            id: 'timer-stop-time', label: 'Stopped at', type: 'time', value: v.time,
            onInput: (val) => { v.time = val; err.hidden = true; }, onChange: (val) => { v.time = val; err.hidden = true; },
          }),
        )
      : null,
    boxed
      ? textArea({
          id: 'timer-stop-moved', label: 'What moved?', optional: true, rows: 2, maxLength: MOVED_MAX,
          placeholder: 'A number, a reply, a decision', hint: 'Saved with this block.',
          onInput: (val) => { moved = val; },
        })
      : null,
    err,
    h('div', { class: 'dialog__actions' },
      forgotten
        ? button('Don’t log it', {
            variant: 'ghost',
            onClick: () => {
              if (!stillSame(close)) return;
              finished = true;
              close();
              o.onDone(undefined, '', true);
            },
          })
        : null,
      button('Keep running', { variant: 'ghost', class: 'dialog__cancel', onClick: () => close() }),
      button(primary, { variant: 'primary', type: 'submit', icon: 'stop' }),
    )),
  });
}
