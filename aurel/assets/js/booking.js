/* ═══════════════════════════════════════════════════════════
   booking.js — six questions, one at a time.

   Six steps rather than one long form, because the long form
   is where people stop. Each step asks one thing, the answer
   is a tap, and the two steps that need typing are last —
   by which point somebody has invested five taps and will
   finish.

   The rules this follows:

     · never block on a question that has an honest default
       (step 2 defaults to "no preference" and is skippable)
     · never offer a slot the studio is closed for. Saturday
       has no evening, Sunday has no slots at all.
     · validate on leaving a step, never on every keystroke —
       an error appearing under a field you are still typing
       into is the rudest pattern in forms
     · the confirmation shows the whole booking back, because
       "thanks!" with no detail is where people start to
       wonder whether it went through

   Nothing is transmitted. This is a design concept and the
   submit handler is deliberately not wired to anything; the
   note under step five says so rather than implying a booking
   was actually made.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var AUREL = global.AUREL, U = AUREL.U, el = AUREL.el, $ = AUREL.$, $$ = AUREL.$$;
  var doc = global.document;

  var form = $('#bookform');
  if (!form) return;

  var stage = $('#bookstage'), rail = $('#bookrail'), fill = $('#bookfill');
  var count = $('#bookcount'), backBtn = $('#bookback'), nextBtn = $('#booknext');
  var acts = $('#bookacts');
  var steps = $$('.book__step', form);
  var LAST = 6;

  var state = { treatment: null, dentist: 'any', date: null, time: null };
  var step = 1;
  var STEP_NAMES = ['Treatment', 'Clinician', 'Date', 'Time', 'Details', 'Confirm'];
  /* set once the person has actually pressed something. Until
     then go() must not move focus — the first call happens at
     load, and stealing focus into a form six screens down is
     the rudest thing a page can do on arrival. */
  var interacted = false;

  /* ── month state ─────────────────────────────────────── */
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var view = new Date(today.getFullYear(), today.getMonth(), 1);
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];

  /* Deterministic "already booked" days and slots. A random
     one would move every time the section re-rendered, which
     reads as broken rather than busy. */
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }
  function key(d) {
    return d.getFullYear() + '-' + AUREL.U.pad(d.getMonth() + 1) + '-' + AUREL.U.pad(d.getDate());
  }
  function closed(d) { return d.getDay() === 0; }                 /* Sunday */
  function full(d)   { return hash(key(d) + 'day') < 0.18; }

  /* ── calendar ────────────────────────────────────────── */
  var grid = $('#calgrid'), monthLbl = $('#calmonth');

  function drawMonth() {
    monthLbl.textContent = MONTHS[view.getMonth()] + ' ' + view.getFullYear();
    grid.replaceChildren();

    /* Monday-first: JS gives Sunday as 0, so rotate */
    var first = new Date(view.getFullYear(), view.getMonth(), 1);
    var lead = (first.getDay() + 6) % 7;
    var days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();

    for (var i = 0; i < lead; i++) {
      var pad = el('span', 'cal__pad');
      pad.setAttribute('aria-hidden', 'true');
      grid.appendChild(pad);
    }

    for (var d = 1; d <= days; d++) {
      var date = new Date(view.getFullYear(), view.getMonth(), d);
      var b = el('button', 'cal__day');
      b.type = 'button';
      b.textContent = String(d);
      b.setAttribute('data-date', key(date));

      var past = date < today;
      var off = past || closed(date) || full(date);
      if (off) {
        b.disabled = true;
        b.className += past ? ' is-past' : closed(date) ? ' is-closed' : ' is-full';
        b.setAttribute('aria-label', d + ' ' + MONTHS[view.getMonth()] + ' — ' +
          (past ? 'in the past' : closed(date) ? 'the studio is closed' : 'fully booked'));
      } else {
        b.setAttribute('aria-label', date.toDateString());
        if (state.date === key(date)) b.classList.add('is-on');
        b.addEventListener('click', pick);
      }
      grid.appendChild(b);
    }

    /* no month-before-this-one */
    $('#calprev').disabled = view.getFullYear() === today.getFullYear() && view.getMonth() === today.getMonth();
  }

  function pick(e) {
    var b = e.currentTarget;
    state.date = b.getAttribute('data-date');
    state.time = null;
    $$('.cal__day', grid).forEach(function (x) { x.classList.toggle('is-on', x === b); });
    drawTimes();
    valid();
  }

  $('#calprev').addEventListener('click', function () {
    view = new Date(view.getFullYear(), view.getMonth() - 1, 1); drawMonth();
  });
  $('#calnext').addEventListener('click', function () {
    view = new Date(view.getFullYear(), view.getMonth() + 1, 1); drawMonth();
  });
  drawMonth();

  /* ── times ───────────────────────────────────────────── */
  var timeBox = $('#opttime');

  function drawTimes() {
    timeBox.replaceChildren();
    if (!state.date) return;

    var parts = state.date.split('-');
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    var dow = d.getDay();
    var band = dow === 5 ? AUREL.HOURS.fri : dow === 6 ? AUREL.HOURS.sat : AUREL.HOURS.week;

    var head = el('p', 'book__daylabel', d.toLocaleDateString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long'
    }));
    timeBox.appendChild(head);

    var wrap = el('div', 'times');
    var free = 0;

    band.forEach(function (t) {
      var taken = hash(state.date + t) < 0.32;
      var lab = el('label', 'time' + (taken ? ' is-taken' : ''));
      lab.innerHTML =
        '<input type="radio" name="time" value="' + t + '"' + (taken ? ' disabled' : '') + '>' +
        '<span class="time__in">' + t + '</span>';
      if (taken) lab.title = 'Already booked';
      else free++;
      wrap.appendChild(lab);
    });

    timeBox.appendChild(wrap);
    timeBox.appendChild(el('p', 'book__free', free + ' of ' + band.length + ' slots free · appointments run to the minute'));
  }

  /* ── step machine ────────────────────────────────────────
     Steps are stacked absolutely inside a stage whose height
     is animated to the active one. That is the only way to
     cross-fade two steps of different heights without the
     page under the form jumping as they swap. */
  function sizeStage() {
    var on = steps[step - 1];
    stage.style.height = on.offsetHeight + 'px';
  }

  function go(n, dir) {
    var from = steps[step - 1];
    step = U.clamp(n, 1, LAST);
    var to = steps[step - 1];

    from.classList.remove('is-on');
    from.classList.add('is-past');
    from.setAttribute('aria-hidden', 'true');
    /* inputs in a hidden step must leave the tab order, or Tab
       walks off into a step nobody can see */
    $$('input, textarea, button', from).forEach(function (f) { f.tabIndex = -1; });

    to.classList.remove('is-past');
    to.classList.add('is-on');
    to.removeAttribute('aria-hidden');
    to.setAttribute('data-dir', dir || 'fwd');
    $$('input, textarea, button', to).forEach(function (f) { f.removeAttribute('tabindex'); });

    global.requestAnimationFrame(sizeStage);

    /* the counter carries the step's name as well, so the rail
       can drop its labels on narrow screens without the person
       losing track of what they are answering */
    count.textContent = 'Step ' + step + ' of ' + LAST + ' · ' + STEP_NAMES[step - 1];
    fill.style.setProperty('--p', ((step - 1) / (LAST - 1)) + '');
    $$('li', rail).forEach(function (li) {
      var n2 = +li.getAttribute('data-step');
      li.classList.toggle('is-on', n2 === step);
      li.classList.toggle('is-done', n2 < step);
    });

    acts.hidden = step === LAST;
    backBtn.disabled = step === 1;
    nextBtn.textContent = step === 5 ? 'Confirm booking' : 'Continue';

    if (step === LAST) confirm();

    /* move focus into the step so the keyboard follows, but
       never scroll — the browser's own scroll-into-view here
       fights the smooth scroll and lands halfway */
    var target = to.querySelector('input:not([disabled]), button:not([disabled]), textarea');
    if (target && interacted && !AUREL.reduced()) global.setTimeout(function () {
      if (steps[step - 1] === to) target.focus({ preventScroll: true });
    }, 240);

    valid();
    AUREL.measure();
  }

  /* ── validation ──────────────────────────────────────────
     Gate the Continue button rather than let someone press it
     and be told no. The message under the button says what is
     missing, so a disabled button is never a dead end. */
  var hint = el('p', 'book__hint');
  hint.setAttribute('aria-live', 'polite');
  acts.appendChild(hint);

  function valid() {
    var ok = true, why = '';
    if (step === 1 && !state.treatment) { ok = false; why = 'Choose a treatment to continue.'; }
    if (step === 3 && !state.date)      { ok = false; why = 'Choose a day to continue.'; }
    if (step === 4 && !state.time)      { ok = false; why = state.date ? 'Choose a time to continue.' : 'Go back and choose a day first.'; }
    nextBtn.disabled = !ok;
    hint.textContent = why;
    return ok;
  }

  form.addEventListener('change', function (e) {
    var t = e.target;
    interacted = true;
    if (t.name === 'treatment') state.treatment = t.value;
    if (t.name === 'dentist')   state.dentist = t.value;
    if (t.name === 'time')      state.time = t.value;
    valid();
    /* choosing an option is a decision — advance on it rather
       than making someone confirm their own tap. Not on the
       last two steps, where the answer may be revised. */
    if ((t.name === 'treatment' || t.name === 'dentist') && step < 3 && !AUREL.reduced()) {
      global.setTimeout(function () { if (valid()) go(step + 1); }, 260);
    }
  });

  /* ── step five ───────────────────────────────────────── */
  var FIELDS = [
    { id: 'f-name',  err: 'e-name',  label: 'name',   test: function (v) { return v.trim().length > 1; },
      msg: 'We need a name for the appointment.' },
    { id: 'f-phone', err: 'e-phone', label: 'phone',  test: function (v) { return v.replace(/[^\d]/g, '').length >= 7; },
      msg: 'A number we can reach you on.' },
    { id: 'f-mail',  err: 'e-mail',  label: 'email',  test: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); },
      msg: 'That address does not look complete.' }
  ];

  function checkFields(show) {
    var ok = true, firstBad = null;
    FIELDS.forEach(function (f) {
      var input = doc.getElementById(f.id), errEl = doc.getElementById(f.err);
      var good = f.test(input.value);
      if (!good) { ok = false; if (!firstBad) firstBad = input; }
      if (show) {
        input.parentNode.classList.toggle('is-bad', !good);
        input.setAttribute('aria-invalid', good ? 'false' : 'true');
        errEl.textContent = good ? '' : f.msg;
      }
      /* once a field has been marked bad, correct it live —
         at that point live feedback is help, not nagging */
      if (!input.dataset.watched) {
        input.dataset.watched = '1';
        input.addEventListener('input', function () {
          if (!input.parentNode.classList.contains('is-bad')) return;
          var g = f.test(input.value);
          input.parentNode.classList.toggle('is-bad', !g);
          input.setAttribute('aria-invalid', g ? 'false' : 'true');
          doc.getElementById(f.err).textContent = g ? '' : f.msg;
        });
      }
    });
    if (show && firstBad) firstBad.focus({ preventScroll: true });
    return ok;
  }

  /* ── confirmation ────────────────────────────────────── */
  function confirm() {
    var list = $('#donelist');
    var tx = (AUREL.TREATMENTS.filter(function (t) { return t.id === state.treatment; })[0] || {}).name || '—';
    var dr = state.dentist === 'any'
      ? 'First available specialist'
      : (AUREL.DENTISTS.filter(function (d) { return d.id === state.dentist; })[0] || {}).name || '—';

    var when = '—';
    if (state.date) {
      var p = state.date.split('-');
      when = new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(undefined, {
        weekday: 'long', day: 'numeric', month: 'long'
      }) + (state.time ? ' · ' + state.time : '');
    }

    list.replaceChildren();
    [['Treatment', tx], ['Clinician', dr], ['When', when],
     ['Name', doc.getElementById('f-name').value.trim() || '—'],
     ['We will call', doc.getElementById('f-phone').value.trim() || '—']
    ].forEach(function (row) {
      var d = el('div');
      d.appendChild(el('dt', null, row[0]));
      d.appendChild(el('dd', null, row[1]));
      list.appendChild(d);
    });

    $('#done').classList.add('is-in');
  }

  /* ── wiring ──────────────────────────────────────────── */
  nextBtn.addEventListener('click', function () {
    interacted = true;
    if (step === 5) { if (!checkFields(true)) return; go(6); return; }
    if (!valid()) return;
    if (step === 2 && !state.date) drawMonth();
    if (step === 3) drawTimes();
    go(step + 1);
  });

  backBtn.addEventListener('click', function () { interacted = true; go(step - 1, 'back'); });

  form.addEventListener('submit', function (e) { e.preventDefault(); });
  form.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    if (!nextBtn.disabled && step < LAST) nextBtn.click();
  });

  $('#bookagain').addEventListener('click', function () {
    interacted = true;
    form.reset();
    state = { treatment: null, dentist: 'any', date: null, time: null };
    $$('.cal__day.is-on', grid).forEach(function (x) { x.classList.remove('is-on'); });
    timeBox.replaceChildren();
    $('#done').classList.remove('is-in');
    FIELDS.forEach(function (f) {
      doc.getElementById(f.id).parentNode.classList.remove('is-bad');
      doc.getElementById(f.err).textContent = '';
    });
    go(1, 'back');
  });

  /* ── start ───────────────────────────────────────────────
     Everything above this line has been building a form that,
     with scripting off, is six visible fieldsets in a column —
     a usable form. This is where it becomes one step at a
     time, and it only happens if the script ran. */
  steps.forEach(function (s, i) {
    if (i === 0) return;
    s.classList.remove('is-on');
    s.setAttribute('aria-hidden', 'true');
    $$('input, textarea, button', s).forEach(function (f) { f.tabIndex = -1; });
  });
  form.classList.add('is-stepped');
  go(1);
  global.addEventListener('resize', sizeStage, { passive: true });
  global.addEventListener('load', sizeStage);
})(window);
