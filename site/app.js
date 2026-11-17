const $ = (id) => document.getElementById(id);

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs || {})) {
    if (value === false || value == null) continue;
    if (name === 'class') el.className = value;
    else if (name === 'text') el.textContent = value;
    else el.setAttribute(name, value === true ? '' : value);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const KEYS = { ip: 'IP address', network: 'network (/24 or /64)', email: 'email address' };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const count = (n) => n.toLocaleString('en-US');

function span(seconds) {
  if (seconds % 3600 === 0) return plural(seconds / 3600, 'hour');
  if (seconds % 60 === 0) return plural(seconds / 60, 'minute');
  return plural(seconds, 'second');
}

function startEngine() {
  const waiting = new Map();
  let worker = null;
  let local = null;
  let next = 0;

  const direct = async (call, payload) => {
    const engine = await local;
    if (call === 'load') return engine.load();
    if (call === 'score') return engine.score(payload.input, payload.options);
    return engine.reset();
  };

  const fallBack = () => {
    if (worker) worker.terminate();
    worker = null;
    local = local || import('./engine.js');
    for (const [id, job] of waiting) {
      waiting.delete(id);
      direct(job.call, job.payload).then(job.done, job.fail);
    }
  };

  try {
    worker = new Worker('worker.js', { type: 'module' });
    worker.addEventListener('message', (event) => {
      const job = waiting.get(event.data.id);
      if (!job) return;
      waiting.delete(event.data.id);
      if ('error' in event.data) job.fail(new Error(event.data.error));
      else job.done(event.data.value);
    });
    worker.addEventListener('error', fallBack);
  } catch {
    fallBack();
  }

  return (call, payload) => {
    if (!worker) return direct(call, payload);
    return new Promise((done, fail) => {
      next += 1;
      waiting.set(next, { call, payload, done, fail });
      worker.postMessage({ id: next, call, payload });
    });
  };
}

let page = null;
try {
  const res = await fetch('data.json');
  if (!res.ok) throw new Error(String(res.status));
  page = await res.json();
} catch {
  $('hero-preview').replaceChildren(h('p', { class: 'muted', text: 'The example could not be loaded.' }));
}

function reasonItem(r) {
  return h(
    'li',
    { class: 'reason' },
    h('p', { class: 'r-head' }, h('code', { text: r.code }), h('span', { class: `pts${r.points > 0 ? ' on' : ''}`, text: `+${r.points}` })),
    h('p', { class: 'r-msg', text: r.message }),
    r.hint ? h('p', { class: 'r-hint' }, h('span', { class: 'r-hint-l', text: 'Hint for the user: ' }), r.hint) : h('p', { class: 'r-hint', text: 'No hint: information for your logs.' }),
  );
}

if (page) {
  const example = page.examples[page.first];
  const result = page.preview;
  const input = [];
  if (example.input.email) input.push(h('code', { text: example.input.email }));
  if (example.input.ip) input.push(input.length ? ' from ' : '', h('code', { text: example.input.ip }));
  $('sample-cap').replaceChildren(`${example.label}: `, ...input, ', scored by the library when the page was built. ', h('a', { href: '#try', text: 'Open the scorer' }));
  $('hero-preview').replaceChildren(
    h(
      'div',
      { class: `sample-row dec ${result.decision}` },
      h('span', { class: 'sample-l', text: 'Decision' }),
      h('span', { class: 'sample-v', text: result.decision }),
      h('span', { class: 'sample-out', text: `${plural(result.score, 'point')}. Review starts at ${page.thresholds.review}, block at ${page.thresholds.block}.` }),
    ),
    ...result.reasons.map((r) =>
      h(
        'div',
        { class: 'sample-row' },
        h('code', { class: 'sample-l', text: r.code }),
        h('span', { class: 'sample-v mono', text: `+${r.points}` }),
        h('span', { class: 'sample-out', text: r.message }),
      ),
    ),
  );
}

const form = $('form');
const status = $('status');
const go = $('go');
let engine = null;
let ready = null;
let thresholds = page ? page.thresholds : { review: 30, block: 70 };
let turn = 0;
let preset = null;
let readyText = '';

function begin() {
  if (ready) return ready;
  engine = startEngine();
  status.textContent = 'Loading the data snapshot.';
  ready = engine('load').then(
    (info) => {
      thresholds = info.thresholds;
      const stamp = info.info.ipRanges.updatedAt.slice(0, 10);
      readyText = `Snapshot of ${stamp} ready: ${count(info.counts.disposableDomains)} domains and ${count(info.counts.ipv4Ranges + info.counts.ipv6Ranges)} IP ranges, downloaded in ${info.fetchMs} ms and indexed in ${info.buildMs} ms. Nothing is sent from here on.`;
      status.textContent = readyText;
      $('count-note').textContent = `Each press records one attempt, as a sign-up form would. The default rules: ${info.rules.map((r) => `${r.limit} per ${KEYS[r.key] ?? r.key} in ${span(r.windowSeconds)}`).join(', ')}. The counters live in this tab.`;
      go.disabled = false;
      return info;
    },
    (err) => {
      status.textContent = `The data snapshot could not be loaded (${err.message}). Reload the page to try again.`;
      $('v-word').textContent = 'No data';
      $('v-score').textContent = 'The snapshot did not load.';
      $('result').setAttribute('aria-busy', 'false');
      throw err;
    },
  );
  ready.catch(() => {});
  return ready;
}

function facts(result) {
  const rows = [];
  if (result.email) {
    rows.push(['Email', result.email.valid ? `valid, check duplicates against ${result.email.normalized}` : 'not valid']);
  }
  if (result.suggestion) rows.push(['Suggestion', `did you mean ${result.suggestion}?`]);
  if (result.ip) {
    let text = 'not an IP address';
    if (result.ip.valid && !result.ip.public) text = `${result.ip.ip}, ${result.ip.special.description}`;
    else if (result.ip.valid) text = `${result.ip.ip}, ${result.ip.matches.length ? `in ${plural(result.ip.matches.length, 'listed range')}` : 'in no listed range'}`;
    rows.push(['IP address', text]);
  }
  return rows.map(([label, value]) => h('div', {}, h('dt', { text: label }), h('dd', { text: value })));
}

function show({ result, velocity }) {
  const verdict = $('verdict');
  verdict.className = `verdict ${result.decision}`;
  $('v-word').textContent = result.decision;
  $('v-score').textContent = `${plural(result.score, 'point')}. Review starts at ${thresholds.review}, block at ${thresholds.block}.`;
  $('result').setAttribute('aria-busy', 'false');

  const top = Math.max(100, thresholds.block + 30);
  const scale = $('scale');
  scale.hidden = false;
  scale.style.setProperty('--review', `${(thresholds.review / top) * 100}%`);
  scale.style.setProperty('--block', `${(thresholds.block / top) * 100}%`);
  scale.style.setProperty('--at', `${(Math.min(result.score, top) / top) * 100}%`);
  scale.className = `scale ${result.decision}`;
  $('tick-review').textContent = `${thresholds.review} review`;
  $('tick-block').textContent = `${thresholds.block} block`;

  $('reasons-box').hidden = false;
  $('reasons-h').textContent = result.reasons.length ? `${plural(result.reasons.length, 'reason')}, in the order the library returned them` : 'Reasons';
  $('reasons').replaceChildren(
    ...(result.reasons.length ? result.reasons.map(reasonItem) : [h('li', { class: 'reason none', text: 'No reasons. Nothing in the input matched a list or a limit.' })]),
  );

  const rows = facts(result);
  $('facts').hidden = rows.length === 0;
  $('facts').replaceChildren(...rows);

  $('velocity-box').hidden = velocity === null;
  if (velocity) {
    $('velocity').replaceChildren(
      ...velocity.results.map((r) =>
        h(
          'tr',
          { class: r.exceeded ? 'over' : null },
          h('th', { scope: 'row' }, h('code', { text: r.rule })),
          h('td', {}, h('code', { text: r.value })),
          h('td', { class: 'num', text: String(r.count) }),
          h('td', { class: 'num', text: `${r.limit} in ${span(r.windowSeconds)}` }),
        ),
      ),
    );
    if (velocity.results.length === 0) $('velocity').replaceChildren(h('tr', {}, h('td', { colspan: '4', text: 'Nothing to count: enter a valid IP address or email address.' })));
  }

  $('raw-box').hidden = false;
  $('raw').textContent = JSON.stringify(result, null, 2);
}

function bringIntoView() {
  const box = $('result').getBoundingClientRect();
  if (box.top < window.innerHeight - 160) return;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('result').scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
}

async function score(reveal = false) {
  const mine = ++turn;
  const email = $('email').value;
  const ip = $('ip').value;
  const input = preset ? { ...preset.input } : {};
  if (email !== '') input.email = email;
  if (ip !== '') input.ip = ip;
  const counting = $('count').checked;
  const freeMail = $('free-mail').checked;
  try {
    await begin();
    const out = await engine('score', { input, options: { count: counting, freeMail } });
    if (mine !== turn) return;
    status.textContent = readyText;
    show(out);
    if (reveal) bringIntoView();
  } catch (err) {
    if (mine !== turn) return;
    $('verdict').className = 'verdict wait';
    $('v-word').textContent = 'Not scored';
    $('v-score').textContent = err.message;
  }
}

const select = $('ex-select');

function pick(example, button, reveal = true) {
  preset = example;
  $('email').value = example.input.email ?? '';
  $('ip').value = example.input.ip ?? '';
  for (const b of buttons) b.setAttribute('aria-pressed', String(b === button));
  select.value = String(buttons.indexOf(button));
  score(reveal);
}

const buttons = (page ? page.examples : []).map((example) => {
  const button = h(
    'button',
    { class: 'ex', type: 'button', 'aria-pressed': 'false' },
    h('span', { class: 'ex-l', text: example.label }),
    h('span', { class: `ex-d ${example.decision}`, text: example.decision }),
  );
  button.addEventListener('click', () => pick(example, button));
  return button;
});
$('examples').append(...buttons);
(page ? page.examples : []).forEach((example, i) => select.append(h('option', { value: String(i), text: `${example.label}, ${example.decision}` })));
select.addEventListener('change', () => {
  const i = Number(select.value);
  if (select.value !== '' && buttons[i]) pick(page.examples[i], buttons[i]);
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  score(true);
});
form.addEventListener('input', (event) => {
  if (event.target === $('count')) {
    $('reset').hidden = !$('count').checked;
    return;
  }
  if (event.target === $('free-mail')) return;
  preset = null;
  for (const b of buttons) b.setAttribute('aria-pressed', 'false');
  select.value = '';
});
$('reset').addEventListener('click', async () => {
  await begin();
  await engine('reset');
  $('velocity-box').hidden = true;
  status.textContent = 'Counters cleared.';
});

function first() {
  if (ready) return;
  if (page) pick(page.examples[page.first], buttons[page.first], false);
  else begin();
}

if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      first();
    },
    { rootMargin: '600px 0px' },
  );
  io.observe($('try'));
} else {
  first();
}
form.addEventListener('focusin', first, { once: true });
