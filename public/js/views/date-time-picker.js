// A custom date-and-time picker for the Janazah date and prayer time field.
//
// Replaces the native <input type="datetime-local">, whose calendar/clock
// popup is a browser-drawn overlay this app has no control over (styling it
// to match a dark, calm interface is not possible beyond a couple of
// Chromium-only pseudo-elements, and Safari/Firefox expose even less). This
// builds the same idea from the app's own pieces instead: a trigger + panel
// in the shape already established by directionsMenu() in ui.js, opening a
// calendar grid and a compact time list rather than the OS-drawn widget.
//
// The real form value is a hidden <input type="hidden" name="janazahAt">
// carrying the same "YYYY-MM-DDTHH:mm" string a datetime-local input always
// produced, so readForm()/fillForm()/gapIn() in notices.js, validateNoticeForm
// and formatJanazahTime in model.js, and store.js all keep reading exactly
// what they read today. The picker only ever writes to that input; nothing
// downstream needed to change.

import { el, icon } from '../ui.js';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES_5 = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,...,55

const pad2 = (n) => String(n).padStart(2, '0');

/** "2026-12-01T13:30" -> {year, month(0-based), day, hour(0-23), minute} or null. */
function parseValue(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '');
  if (!m) return null;
  const year = +m[1];
  const month = +m[2] - 1;
  const day = +m[3];
  const hour = +m[4];
  const minute = +m[5];
  const probe = new Date(year, month, day, hour, minute);
  if (probe.getFullYear() !== year || probe.getMonth() !== month || probe.getDate() !== day) return null;
  return { year, month, day, hour, minute };
}

function toValue(parts) {
  return `${parts.year}-${pad2(parts.month + 1)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

function toDate(parts) {
  return new Date(parts.year, parts.month, parts.day, parts.hour, parts.minute);
}

const TRIGGER_FORMAT = new Intl.DateTimeFormat('en-CA', {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  hour: 'numeric', minute: '2-digit',
});
const MONTH_YEAR_FORMAT = new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric' });

function formatTriggerLabel(parts) {
  return parts ? TRIGGER_FORMAT.format(toDate(parts)) : null;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function sameDay(a, b) {
  return !!a && !!b && a.year === b.year && a.month === b.month && a.day === b.day;
}

function to12Hour(hour24) {
  const period = hour24 < 12 ? 'AM' : 'PM';
  const h = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12: h, period };
}

function to24Hour(hour12, period) {
  const base = hour12 % 12;
  return period === 'PM' ? base + 12 : base;
}

/**
 * @param {object} opts
 * @param {string} opts.id - id given to the visible trigger button; a
 *   <label for="..."> pointed at the old datetime-local input keeps working
 *   unchanged when pointed at this id.
 * @param {string} [opts.name] - form field name for the real value. Defaults to id.
 * @param {string} [opts.value] - initial "YYYY-MM-DDTHH:mm" value, or ''.
 * @param {boolean} [opts.required]
 * @returns {{ node: HTMLElement, input: HTMLInputElement, trigger: HTMLButtonElement }}
 */
export function dateTimePicker({ id, name = id, value = '', required = false }) {
  let state = parseValue(value);
  const today = new Date();
  let viewYear = state ? state.year : today.getFullYear();
  let viewMonth = state ? state.month : today.getMonth();
  let lastFocusedDay = state ? state.day : today.getDate();

  const input = el('input', {
    type: 'hidden', id: `${id}-value`, name, required: required || null, value: value || '',
  });

  const valueLabel = el('span', { class: 'dt-picker__value' }, 'Select date and time');
  const trigger = el('button', {
    class: 'field dt-picker__trigger',
    type: 'button',
    id,
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
  }, [valueLabel, icon('clock', { size: 16 })]);

  const monthHeading = el('h3', { class: 'dt-picker__month', 'aria-live': 'polite' });
  const grid = el('div', {
    class: 'dt-picker__grid', role: 'grid', 'aria-labelledby': `${id}-month`,
  });
  monthHeading.id = `${id}-month`;

  const prevBtn = el('button', {
    class: 'btn btn--small dt-picker__nav', type: 'button', 'aria-label': 'Previous month',
  }, icon('arrowLeft', { size: 15 }));
  const nextBtn = el('button', {
    class: 'btn btn--small dt-picker__nav dt-picker__nav--next', type: 'button', 'aria-label': 'Next month',
  }, icon('arrowLeft', { size: 15 }));

  const hourList = el('div', {
    class: 'dt-picker__col', role: 'listbox', 'aria-label': 'Hour', tabindex: '0',
  });
  const minuteList = el('div', {
    class: 'dt-picker__col', role: 'listbox', 'aria-label': 'Minute', tabindex: '0',
  });
  const amBtn = el('button', {
    class: 'btn btn--small dt-picker__period', type: 'button', role: 'radio', 'aria-checked': 'false',
  }, 'AM');
  const pmBtn = el('button', {
    class: 'btn btn--small dt-picker__period', type: 'button', role: 'radio', 'aria-checked': 'false',
  }, 'PM');

  const doneBtn = el('button', { class: 'btn btn--primary btn--small dt-picker__done', type: 'button' }, 'Done');

  const panel = el('div', {
    class: 'dt-picker__panel', hidden: true, role: 'dialog', 'aria-modal': 'false',
    'aria-label': 'Choose date and time',
  }, [
    el('div', { class: 'dt-picker__backdrop' }),
    el('div', { class: 'dt-picker__sheet' }, [
      el('div', { class: 'dt-picker__sheet-grip' }),
      el('div', { class: 'dt-picker__header' }, [
        prevBtn,
        monthHeading,
        nextBtn,
      ]),
      el('div', { class: 'dt-picker__weekdays', 'aria-hidden': 'true' },
        WEEKDAY_LABELS.map((d) => el('span', { text: d }))),
      grid,
      el('div', { class: 'dt-picker__time' }, [
        el('div', { class: 'dt-picker__time-cols' }, [
          hourList,
          el('span', { class: 'dt-picker__colon', 'aria-hidden': 'true', text: ':' }),
          minuteList,
        ]),
        el('div', { class: 'dt-picker__period-group', role: 'radiogroup', 'aria-label': 'AM or PM' }, [
          amBtn, pmBtn,
        ]),
      ]),
      el('div', { class: 'dt-picker__actions' }, [doneBtn]),
    ]),
  ]);

  const wrap = el('div', { class: 'dt-picker' }, [trigger, panel, input]);

  // ---------------------------------------------------------------- render

  function renderValueLabel() {
    const label = formatTriggerLabel(state);
    valueLabel.textContent = label || 'Select date and time';
    valueLabel.classList.toggle('dt-picker__value--placeholder', !label);
  }

  function commit(next) {
    state = next;
    input.value = toValue(state);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    renderValueLabel();
  }

  function renderGrid() {
    monthHeading.textContent = MONTH_YEAR_FORMAT.format(new Date(viewYear, viewMonth, 1));
    grid.replaceChildren();
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const total = daysInMonth(viewYear, viewMonth);
    const isTodayMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
    const focusDay = Math.min(lastFocusedDay, total);

    let row = el('div', { class: 'dt-picker__row', role: 'row' });
    grid.append(row);
    for (let i = 0; i < firstWeekday; i += 1) {
      row.append(el('span', { class: 'dt-picker__cell dt-picker__cell--blank', role: 'presentation' }));
    }
    for (let day = 1; day <= total; day += 1) {
      if (row.children.length === 7) {
        row = el('div', { class: 'dt-picker__row', role: 'row' });
        grid.append(row);
      }
      const isToday = isTodayMonth && day === today.getDate();
      const isSelected = sameDay(state, { year: viewYear, month: viewMonth, day });
      const weekdayName = WEEKDAY_FULL[new Date(viewYear, viewMonth, day).getDay()];
      const btn = el('button', {
        type: 'button',
        class: `dt-picker__cell dt-picker__day${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}`,
        role: 'gridcell',
        tabindex: day === focusDay ? '0' : '-1',
        'aria-selected': isSelected ? 'true' : 'false',
        'aria-label': `${weekdayName}, ${MONTH_YEAR_FORMAT.format(new Date(viewYear, viewMonth, day))} ${day}`,
        text: String(day),
      });
      btn.addEventListener('click', () => selectDay(day));
      row.append(btn);
    }
  }

  function selectDay(day) {
    lastFocusedDay = day;
    const base = state || { hour: 12, minute: 0 };
    commit({
      year: viewYear, month: viewMonth, day, hour: base.hour, minute: base.minute,
    });
    renderGrid();
    renderTime();
    focusDay(day);
  }

  function focusDay(day) {
    const btn = [...grid.querySelectorAll('.dt-picker__day')].find((b) => Number(b.textContent) === day);
    btn?.focus();
  }

  function changeMonth(delta) {
    viewMonth += delta;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    lastFocusedDay = 1;
    renderGrid();
    focusDay(Math.min(lastFocusedDay, daysInMonth(viewYear, viewMonth)));
  }

  prevBtn.addEventListener('click', () => changeMonth(-1));
  nextBtn.addEventListener('click', () => changeMonth(1));

  grid.addEventListener('keydown', (event) => {
    const days = [...grid.querySelectorAll('.dt-picker__day')];
    const focused = document.activeElement;
    const idx = days.indexOf(focused);
    if (idx === -1) return;
    const total = days.length;
    const deltas = {
      ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
    };
    if (event.key in deltas) {
      event.preventDefault();
      const target = idx + deltas[event.key];
      if (target < 0) {
        changeMonth(-1);
        const newDays = [...grid.querySelectorAll('.dt-picker__day')];
        lastFocusedDay = newDays.length + target + 1;
        renderGrid();
        focusDay(lastFocusedDay);
      } else if (target >= total) {
        changeMonth(1);
        lastFocusedDay = target - total + 1;
        renderGrid();
        focusDay(lastFocusedDay);
      } else {
        lastFocusedDay = Number(days[target].textContent);
        days[target].focus();
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectDay(Number(focused.textContent));
    }
  });

  // ------------------------------------------------------------------ time

  function buildTimeList(container, values, formatter, kind) {
    container.replaceChildren(...values.map((v) => {
      const opt = el('button', {
        type: 'button', class: 'dt-picker__option', role: 'option', 'aria-selected': 'false', text: formatter(v),
      });
      opt.addEventListener('click', () => setTime(kind, v));
      return opt;
    }));
  }
  buildTimeList(hourList, HOURS_12, (h) => String(h), 'hour');
  buildTimeList(minuteList, MINUTES_5, (m) => pad2(m), 'minute');

  function setTime(kind, v) {
    const current = state || {
      year: viewYear, month: viewMonth, day: lastFocusedDay, hour: today.getHours(), minute: 0,
    };
    const { hour12, period } = to12Hour(current.hour);
    let nextHour12 = hour12;
    let nextMinute = current.minute;
    let nextPeriod = period;
    if (kind === 'hour') nextHour12 = v;
    if (kind === 'minute') nextMinute = v;
    if (kind === 'period') nextPeriod = v;
    commit({
      ...current, hour: to24Hour(nextHour12, nextPeriod), minute: nextMinute,
    });
    renderTime();
    renderGrid();
  }

  function renderTime() {
    const parts = state || { hour: today.getHours(), minute: 0 };
    const { hour12, period } = to12Hour(parts.hour);
    const nearestMinute = MINUTES_5.reduce((best, m) => (
      Math.abs(m - parts.minute) < Math.abs(best - parts.minute) ? m : best), 0);

    for (const opt of hourList.children) {
      const active = state && Number(opt.textContent) === hour12;
      opt.classList.toggle('is-selected', !!active);
      opt.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) opt.scrollIntoView({ block: 'nearest' });
    }
    for (const opt of minuteList.children) {
      const active = state && Number(opt.textContent) === nearestMinute;
      opt.classList.toggle('is-selected', !!active);
      opt.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) opt.scrollIntoView({ block: 'nearest' });
    }
    amBtn.classList.toggle('is-active', !!state && period === 'AM');
    amBtn.setAttribute('aria-checked', state && period === 'AM' ? 'true' : 'false');
    pmBtn.classList.toggle('is-active', !!state && period === 'PM');
    pmBtn.setAttribute('aria-checked', state && period === 'PM' ? 'true' : 'false');
  }

  amBtn.addEventListener('click', () => setTime('period', 'AM'));
  pmBtn.addEventListener('click', () => setTime('period', 'PM'));

  for (const list of [hourList, minuteList]) {
    list.addEventListener('keydown', (event) => {
      const opts = [...list.children];
      const activeIdx = opts.findIndex((o) => o.classList.contains('is-selected'));
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const dir = event.key === 'ArrowDown' ? 1 : -1;
        const next = opts[(((activeIdx === -1 ? 0 : activeIdx) + dir) + opts.length) % opts.length];
        next.click();
        next.focus();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        document.activeElement?.click?.();
      }
    });
  }

  // ---------------------------------------------------------------- open/close

  function open() {
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('is-dt-picker-open');
    renderGrid();
    renderTime();
    focusDay(Math.min(lastFocusedDay, daysInMonth(viewYear, viewMonth)));
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKeyDown);
  }

  function close({ refocus = false } = {}) {
    if (panel.hidden) return;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('is-dt-picker-open');
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKeyDown);
    if (refocus) trigger.focus();
  }

  function onDocClick(event) {
    if (!wrap.contains(event.target)) close();
  }
  function onKeyDown(event) {
    if (event.key === 'Escape') { event.stopPropagation(); close({ refocus: true }); }
  }

  trigger.addEventListener('click', () => {
    if (panel.hidden) open(); else close();
  });
  doneBtn.addEventListener('click', () => close({ refocus: true }));
  panel.querySelector('.dt-picker__backdrop').addEventListener('click', () => close());

  renderValueLabel();

  return { node: wrap, input, trigger };
}
