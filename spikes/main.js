// Spike harness for the feasibility gate (docs/plan.md §5). Throwaway code: plain JS, no build step
// beyond `vite serve spikes`. Every gate G1–G8 has a section below; the runbook in docs/spikes/README.md
// says what to click and what to record.

import {
  ALL_LED_INDICES,
  INQUIRY,
  LP,
  RT,
  RT_NAMES,
  SimplePosition,
  allOff,
  decodeInquiry,
  decodeLayout,
  download,
  expectedKind,
  fourthsNote,
  hex,
  isGridPad,
  ledMessages,
  noteName,
  padsForNote,
  spec,
  sppTo16ths,
  stamp,
} from './midi.js';

// ---------------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------------
const S = {
  access: null,
  lpIn: null,
  lpOut: null,
  clockIn: null,
  notesOut: null,
  desiredProgrammer: false,
  observedLayout: null,
  reentries: [], // timestamps of automatic re-entries (bounded recovery check)
  forwardClock: true,
  pos: new SimplePosition(),
  // routing
  baseNote: 36,
  rowOffset: 5,
  notesChannel: 0,
  held: new Map(), // pad -> {note, channel}
  pressFeedback: true,
  // recorders
  trace: null, // {scenario, startedAt, events: []}
  latency: null, // {inputs: [], outputs: [], unmatched: 0, extra: 0}
  stress: null, // interval id
  // endurance
  endurance: { bars: 0, lastBar: 0, startedAt: 0, maxHeldAgeMs: 0 },
  // versions (manual)
  versions: { macos: '', live: '', firmware: '', model: '' },
  t0: performance.now(),
};

const log = (() => {
  const el = document.getElementById('log');
  const entries = [];
  const showClock = document.getElementById('log-clock');
  const showPressure = document.getElementById('log-pressure');
  function add(kind, text, opts = {}) {
    const t = (performance.now() - S.t0).toFixed(1).padStart(10);
    const entry = { t: Number(t), kind, text, ...opts };
    entries.push(entry);
    if (opts.clock && !showClock.checked) return;
    if (opts.pressure && !showPressure.checked) return;
    const line = document.createElement('div');
    line.className = kind;
    line.textContent = `${t}  ${text}`;
    el.appendChild(line);
    if (el.childElementCount > 4000) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }
  document.getElementById('log-clear').onclick = () => {
    el.textContent = '';
    entries.length = 0;
  };
  document.getElementById('log-export').onclick = () =>
    download(`spike-log-${stamp()}.json`, JSON.stringify({ versions: versionsBlock(), entries }, null, 1));
  return { add, entries };
})();

const pills = {
  midi: document.getElementById('pill-midi'),
  device: document.getElementById('pill-device'),
  mode: document.getElementById('pill-mode'),
  pos: document.getElementById('pill-pos'),
};
function setPill(p, text, cls = '') {
  p.textContent = text;
  p.className = `pill ${cls}`;
}

function versionsBlock() {
  return { ...S.versions, userAgent: navigator.userAgent, recordedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------------------------------
// UI builders
// ---------------------------------------------------------------------------------------------------
const controls = document.getElementById('controls');
function section(title, sub = '') {
  const s = document.createElement('section');
  s.innerHTML = `<h2>${title}<small>${sub}</small></h2>`;
  controls.appendChild(s);
  return s;
}
function row(parent, ...children) {
  const r = document.createElement('div');
  r.className = 'row';
  for (const c of children)
    r.appendChild(
      typeof c === 'string' ? Object.assign(document.createElement('label'), { textContent: c }) : c,
    );
  parent.appendChild(r);
  return r;
}
function btn(text, onClick, cls = '') {
  const b = document.createElement('button');
  b.textContent = text;
  b.onclick = onClick;
  if (cls) b.className = cls;
  return b;
}
function sel(onChange) {
  const s = document.createElement('select');
  s.onchange = () => onChange(s.value);
  return s;
}
function num(value, onChange, attrs = {}) {
  const i = Object.assign(document.createElement('input'), { type: 'number', value, ...attrs });
  i.onchange = () => onChange(Number(i.value));
  return i;
}
function text(value, placeholder, onChange, size = 10) {
  const i = Object.assign(document.createElement('input'), { type: 'text', value, placeholder, size });
  i.onchange = () => onChange(i.value);
  return i;
}
function check(label, checked, onChange) {
  const l = document.createElement('label');
  const c = Object.assign(document.createElement('input'), { type: 'checkbox', checked });
  c.onchange = () => onChange(c.checked);
  l.append(c, ` ${label}`);
  return l;
}
function kv(parent) {
  const d = document.createElement('div');
  d.className = 'kv';
  parent.appendChild(d);
  return (pairs) => {
    d.innerHTML = pairs.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
  };
}

// ---------------------------------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------------------------------
function sendLp(bytes, label) {
  if (!S.lpOut) return log.add('warn', `no Launchpad output; wanted to send ${label ?? hex(bytes)}`);
  S.lpOut.send(bytes);
  log.add('out', `→ LP   ${label ?? ''} ${bytes.length > 24 ? hex(bytes.slice(0, 24)) + ' …' : hex(bytes)}`);
}
function sendLpQuiet(bytes) {
  S.lpOut?.send(bytes);
}

// ---------------------------------------------------------------------------------------------------
// §0 Access and ports (G8)
// ---------------------------------------------------------------------------------------------------
const secAccess = section('0 · Web MIDI and ports', 'G8 lifecycle');
const lpInSel = sel((id) => bindLpIn(id));
const lpOutSel = sel((id) => {
  S.lpOut = S.access?.outputs.get(id) ?? null;
  log.add('sys', `LP out = ${S.lpOut?.name ?? '—'}`);
});
const clockInSel = sel((id) => bindClockIn(id));
const notesOutSel = sel((id) => {
  S.notesOut = S.access?.outputs.get(id) ?? null;
  log.add('sys', `notes out = ${S.notesOut?.name ?? '—'}`);
});
row(
  secAccess,
  btn('Request MIDI access (SysEx)', requestAccess, 'primary'),
  btn('Auto-detect ports', autodetect),
);
row(secAccess, 'LP in', lpInSel);
row(secAccess, 'LP out', lpOutSel);
row(secAccess, 'Clock in', clockInSel);
row(secAccess, 'Notes out', notesOutSel);
const accessInfo = kv(secAccess);
row(
  secAccess,
  'macOS',
  text('', 'e.g. 15.1', (v) => (S.versions.macos = v), 8),
  'Live',
  text('', 'e.g. 12.1.5', (v) => (S.versions.live = v), 8),
);

async function requestAccess() {
  if (!navigator.requestMIDIAccess) {
    setPill(pills.midi, 'Web MIDI: unsupported', 'bad');
    return log.add('bad', 'navigator.requestMIDIAccess is undefined (use Chrome/Edge)');
  }
  try {
    const t = performance.now();
    S.access = await navigator.requestMIDIAccess({ sysex: true });
    setPill(pills.midi, `Web MIDI: ok, sysex=${S.access.sysexEnabled}`, 'ok');
    log.add(
      'ok',
      `MIDI access granted in ${(performance.now() - t).toFixed(0)} ms, sysex=${S.access.sysexEnabled}`,
    );
    S.access.onstatechange = onStateChange;
    refreshPorts();
    autodetect();
  } catch (e) {
    setPill(pills.midi, 'Web MIDI: denied', 'bad');
    log.add('bad', `requestMIDIAccess failed: ${e?.name ?? ''} ${e?.message ?? e}`);
  }
}
function refreshPorts() {
  const fill = (s, ports) => {
    const cur = s.value;
    s.innerHTML =
      '<option value="">—</option>' +
      [...ports.values()].map((p) => `<option value="${p.id}">${p.name} [${p.state}]</option>`).join('');
    if ([...ports.keys()].includes(cur)) s.value = cur;
  };
  fill(lpInSel, S.access.inputs);
  fill(clockInSel, S.access.inputs);
  fill(lpOutSel, S.access.outputs);
  fill(notesOutSel, S.access.outputs);
  accessInfo([
    ['inputs', [...S.access.inputs.values()].map((p) => p.name).join(', ') || '—'],
    ['outputs', [...S.access.outputs.values()].map((p) => p.name).join(', ') || '—'],
  ]);
}
function autodetect() {
  if (!S.access) return;
  const find = (map, re) => [...map.values()].find((p) => re.test(p.name ?? ''));
  const lpIn = find(S.access.inputs, /LPProMK3 MIDI|Launchpad Pro MK3.*MIDI/i);
  const lpOut = find(S.access.outputs, /LPProMK3 MIDI|Launchpad Pro MK3.*MIDI/i);
  const clk = find(S.access.inputs, /LS Clock|IAC.*Clock/i);
  const notes = find(S.access.outputs, /LS Notes|IAC.*Notes/i);
  if (lpIn) {
    lpInSel.value = lpIn.id;
    bindLpIn(lpIn.id);
  }
  if (lpOut) {
    lpOutSel.value = lpOut.id;
    S.lpOut = lpOut;
  }
  if (clk) {
    clockInSel.value = clk.id;
    bindClockIn(clk.id);
  }
  if (notes) {
    notesOutSel.value = notes.id;
    S.notesOut = notes;
  }
  log.add(
    'sys',
    `autodetect: LP in=${lpIn?.name ?? '—'} LP out=${lpOut?.name ?? '—'} clock=${clk?.name ?? '—'} notes=${notes?.name ?? '—'}`,
  );
  setPill(
    pills.device,
    `Device: ${lpIn && lpOut ? 'ports bound' : 'not found'}`,
    lpIn && lpOut ? 'ok' : 'bad',
  );
}
let lastDisconnectAt = 0;
function onStateChange(e) {
  const p = e.port;
  log.add('sys', `statechange ${p.type} "${p.name}" state=${p.state} connection=${p.connection}`);
  refreshPorts();
  const isLp = /LPProMK3 MIDI|Launchpad Pro MK3.*MIDI/i.test(p.name ?? '');
  if (isLp && p.state === 'disconnected') {
    lastDisconnectAt = performance.now();
    S.observedLayout = null;
    setPill(pills.device, 'Device: disconnected', 'bad');
    setPill(pills.mode, 'Mode: —');
    releaseAllHeld('device disconnected');
  }
  if (isLp && p.state === 'connected' && p.type === 'input') {
    const dt = lastDisconnectAt ? (performance.now() - lastDisconnectAt).toFixed(0) : '?';
    log.add(
      'ok',
      `LP reconnected ${dt} ms after disconnect; re-binding${S.desiredProgrammer ? ' and re-entering Programmer mode' : ''}`,
    );
    autodetect();
    if (S.desiredProgrammer) {
      S.reconnectStartedAt = performance.now();
      enterProgrammer(true);
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// §1 Device control (G1, G2)
// ---------------------------------------------------------------------------------------------------
const secDev = section('1 · Device control', 'G1 mode/frames/index map · G2 Live coexistence');
row(
  secDev,
  btn('Inquiry', () => sendLp(INQUIRY, 'inquiry')),
  btn('Enter Programmer', () => enterProgrammer(false), 'primary'),
  btn('Restore Live mode', restoreLive),
  btn('Query layout', () => sendLp(LP.layoutQuery(), 'layout?')),
);
row(
  secDev,
  check('auto re-enter when kicked out (max 3 in 10 s)', true, (v) => (S.autoReenter = v)),
);
S.autoReenter = true;
row(
  secDev,
  btn('All off', () => allOff().forEach((m) => sendLp(m, 'all off'))),
  btn('Index sweep', indexSweep),
  btn('Index map test (press pads)', indexMapTest),
  btn('Stop test', stopTests),
);
const devInfo = kv(secDev);
function enterProgrammer(auto) {
  S.desiredProgrammer = true;
  S.programmerRequestedAt = performance.now();
  sendLp(LP.programmerMode(true), auto ? 'programmer ON (auto)' : 'programmer ON');
  // The device does not announce a SysEx-initiated mode switch (G1 probe): confirm by query.
  sendLp(LP.layoutQuery(), 'layout?');
}
function restoreLive() {
  releaseAllHeld('restore');
  S.desiredProgrammer = false;
  sendLp(LP.programmerMode(false), 'LIVE mode');
  sendLp(LP.layoutQuery(), 'layout?');
}
let testTimer = null;
function stopTests() {
  if (testTimer) (clearInterval(testTimer), (testTimer = null));
  S.indexTest = false;
  log.add('sys', 'tests stopped');
}
function indexSweep() {
  stopTests();
  const idx = [...ALL_LED_INDICES];
  let i = 0;
  testTimer = setInterval(() => {
    const prev = idx[(i - 1 + idx.length) % idx.length];
    const cur = idx[i];
    sendLpQuiet(ledMessages([spec.palette(prev, 0), spec.rgb(cur, 127, 127, 127)])[0]);
    devInfo([['sweep', `index ${cur} (${expectedKind(cur)})`]]);
    i = (i + 1) % idx.length;
    if (i === 0) {
      stopTests();
      sendLpQuiet(allOff()[0]);
    }
  }, 120);
}
function indexMapTest() {
  stopTests();
  S.indexTest = true;
  allOff().forEach(sendLpQuiet);
  log.add(
    'sys',
    'INDEX MAP TEST: press every pad and button. Each press is checked against the documented map (grid=notes 11..88, buttons=CCs incl. Shift 90 and 101..108; logo 99 is light-only). Press "Stop test" when done.',
  );
  S.indexSeen = new Set();
}

// ---------------------------------------------------------------------------------------------------
// §2 Clock (G3) — trace recorder + forwarding
// ---------------------------------------------------------------------------------------------------
const secClock = section('2 · Live clock', 'G3 traces · forwards clock to the Launchpad for flash sync');
const scenarioSel = document.createElement('select');
[
  'start-from-1.1.1',
  'start-mid-song',
  'continue',
  'seek-while-stopped',
  'seek-while-playing',
  'loop-wrap',
  'stop',
  'clock-stall',
  'long-stop-then-continue',
  'reconnect-while-running',
  'custom',
].forEach((s) => scenarioSel.append(new Option(s)));
const recBtn = btn('● Record', toggleRecord, 'primary');
row(secClock, 'scenario', scenarioSel, recBtn);
row(
  secClock,
  check('forward clock/transport to Launchpad', true, (v) => (S.forwardClock = v)),
);
const clockInfo = kv(secClock);
let clockCount = 0,
  lastClockAt = 0,
  clockGapMax = 0,
  tempoEst = 0;
function toggleRecord() {
  if (S.trace) {
    const t = S.trace;
    S.trace = null;
    recBtn.textContent = '● Record';
    recBtn.className = 'primary';
    const out = {
      schema: 1,
      scenario: t.scenario,
      startedAt: t.startedAt,
      port: S.clockIn?.name ?? null,
      versions: versionsBlock(),
      notes: '',
      events: t.events,
    };
    download(`g3-${t.scenario}-${stamp()}.json`, JSON.stringify(out));
    log.add('ok', `trace saved: ${t.events.length} events (${t.scenario})`);
  } else {
    S.trace = {
      scenario: scenarioSel.value,
      startedAt: new Date().toISOString(),
      tRef: performance.now(),
      events: [],
    };
    recBtn.textContent = '■ Stop & save';
    recBtn.className = '';
    log.add('ok', `recording trace "${S.trace.scenario}" — perform the scenario in Live now`);
  }
}
function bindClockIn(id) {
  if (S.clockIn) S.clockIn.onmidimessage = null;
  S.clockIn = S.access?.inputs.get(id) ?? null;
  if (!S.clockIn) return;
  S.clockIn.onmidimessage = onClockMessage;
  log.add('sys', `clock in = ${S.clockIn.name}`);
}
function onClockMessage(e) {
  const d = e.data;
  const s = d[0];
  if (S.trace)
    S.trace.events.push({ t: Math.round((e.timeStamp - S.trace.tRef) * 1000) / 1000, bytes: Array.from(d) });
  if (S.forwardClock && S.lpOut && (s === RT.CLOCK || s === RT.START || s === RT.CONTINUE || s === RT.STOP))
    S.lpOut.send(d);
  S.pos.on(d);
  if (s === RT.CLOCK) {
    clockCount++;
    if (lastClockAt) {
      const gap = e.timeStamp - lastClockAt;
      if (gap > clockGapMax) clockGapMax = gap;
      tempoEst = tempoEst ? tempoEst * 0.9 + (60000 / 24 / gap) * 0.1 : 60000 / 24 / gap;
    }
    lastClockAt = e.timeStamp;
    log.add('in', `← CLK  F8`, { clock: true });
  } else if (s === RT.SPP) {
    log.add(
      'in',
      `← CLK  SPP ${sppTo16ths(d)} sixteenths (= bar ${Math.floor(sppTo16ths(d) / 16) + 1} in 4/4)  ${hex(d)}`,
    );
  } else if (RT_NAMES[s]) {
    log.add('in', `← CLK  ${RT_NAMES[s]}  ${hex(d)}`);
  } else {
    log.add('in', `← CLK  ${hex(d)}`);
  }
  setPill(pills.pos, `Pos: ${S.pos.label()}`, S.pos.valid ? 'ok' : '');
  const bar = Math.floor(S.pos.tick / 96) + 1;
  if (S.pos.playing && bar !== S.endurance.lastBar) {
    S.endurance.lastBar = bar;
    S.endurance.bars++;
  }
  clockInfo([
    ['clocks', clockCount],
    ['tempo est', tempoEst ? tempoEst.toFixed(1) : '—'],
    ['max gap ms', clockGapMax.toFixed(1)],
    ['position', S.pos.label()],
    ['bars seen', S.endurance.bars],
  ]);
  if (S.stressRepaintOnBeat && s === RT.CLOCK && S.pos.tick % 24 === 0) paintRoles();
}

// ---------------------------------------------------------------------------------------------------
// §3 Routing (G4, G5, G6)
// ---------------------------------------------------------------------------------------------------
const secRoute = section('3 · Mapped round trip', 'G4 routing/pressure · G5 latency workload · G6 endurance');
row(
  secRoute,
  'base note',
  num(
    S.baseNote,
    (v) => {
      S.baseNote = v;
      paintRoles();
    },
    { min: 0, max: 100 },
  ),
  'row offset',
  num(
    S.rowOffset,
    (v) => {
      S.rowOffset = v;
      paintRoles();
    },
    { min: 1, max: 12 },
  ),
  'channel',
  num(1, (v) => (S.notesChannel = v - 1), { min: 1, max: 16 }),
);
row(
  secRoute,
  btn('Octave −', () => {
    S.baseNote -= 12;
    paintRoles();
    log.add('sys', `base note ${S.baseNote} (held notes keep their original pitch)`);
  }),
  btn('Octave +', () => {
    S.baseNote += 12;
    paintRoles();
    log.add('sys', `base note ${S.baseNote}`);
  }),
  btn('Panic', () => releaseAllHeld('panic')),
);
row(
  secRoute,
  check('press feedback (all pads with the same note)', true, (v) => (S.pressFeedback = v)),
  check('route pads to notes out', true, (v) => (S.route = v)),
);
S.route = true;
row(
  secRoute,
  check('repaint full frame on every beat (LED stress)', false, (v) => (S.stressRepaintOnBeat = v)),
  check('repaint full frame every 50 ms (heavy)', false, (v) => {
    if (S.stress) (clearInterval(S.stress), (S.stress = null));
    if (v) S.stress = setInterval(paintRoles, 50);
  }),
);
const routeInfo = kv(secRoute);
const latBtn = btn('Start G5 workload count', toggleLatency);
row(secRoute, latBtn, btn('Export G5 CSV', exportLatency));
row(
  secRoute,
  btn('Start endurance timer', () => {
    S.endurance = { bars: 0, lastBar: 0, startedAt: performance.now(), maxHeldAgeMs: 0 };
    log.add('ok', 'endurance timer started');
  }),
);

function bindLpIn(id) {
  if (S.lpIn) S.lpIn.onmidimessage = null;
  S.lpIn = S.access?.inputs.get(id) ?? null;
  if (!S.lpIn) return;
  S.lpIn.onmidimessage = onLpMessage;
  log.add('sys', `LP in = ${S.lpIn.name}`);
}
function onLpMessage(e) {
  const d = e.data;
  const s = d[0] & 0xf0;
  const ch = d[0] & 0x0f;
  if (d[0] === 0xf0) return onLpSysEx(d);
  if (s === 0x90 || s === 0x80) {
    const pad = d[1],
      vel = s === 0x80 ? 0 : d[2];
    if (S.indexTest) return checkIndex('note', pad, vel);
    if (vel > 0) onPadDown(pad, vel, e.timeStamp);
    else onPadUp(pad, e.timeStamp);
    return;
  }
  if (s === 0xb0) {
    if (S.indexTest) return checkIndex('cc', d[1], d[2]);
    log.add('in', `← LP   CC ${d[1]} = ${d[2]} (ch ${ch + 1})`);
    if (d[2] > 0 && d[1] === 80) {
      S.baseNote += 12;
      paintRoles();
      log.add('sys', `octave + via button 80 → base ${S.baseNote}`);
    }
    if (d[2] > 0 && d[1] === 70) {
      S.baseNote -= 12;
      paintRoles();
      log.add('sys', `octave − via button 70 → base ${S.baseNote}`);
    }
    return;
  }
  if (s === 0xa0) {
    // poly pressure: remap through held table, never through the current mapping
    const pad = d[1];
    const h = S.held.get(pad);
    log.add('in', `← LP   polyAT pad ${pad} = ${d[2]}${h ? ` → note ${h.note}` : ' (unheld, dropped)'}`, {
      pressure: true,
    });
    if (h && S.route && S.notesOut) S.notesOut.send([0xa0 | h.channel, h.note, d[2]]);
    return;
  }
  if (s === 0xd0) {
    // channel pressure: forward on the output channel
    log.add('in', `← LP   chanAT = ${d[1]}`, { pressure: true });
    if (S.route && S.notesOut) S.notesOut.send([0xd0 | S.notesChannel, d[1]]);
    return;
  }
  log.add('in', `← LP   ${hex(d)}`);
}
function onLpSysEx(d) {
  const inq = decodeInquiry(d);
  if (inq) {
    S.versions.model = inq.model;
    S.versions.firmware = inq.version;
    setPill(
      pills.device,
      `Device: ${inq.model.includes('Pro MK3') ? 'Pro MK3' : inq.model} fw ${inq.version}`,
      'ok',
    );
    devInfo([
      ['model', inq.model],
      ['firmware', inq.version],
    ]);
    return log.add('ok', `← LP   inquiry reply: ${inq.model}, firmware ${inq.version}`);
  }
  const lay = decodeLayout(d);
  if (lay) {
    S.observedLayout = lay.layout;
    const inProg = lay.layout === LP.LAYOUT_PROGRAMMER;
    setPill(pills.mode, `Mode: ${lay.name}`, inProg ? 'ok' : S.desiredProgrammer ? 'bad' : '');
    let extra = '';
    if (inProg && S.programmerRequestedAt) {
      extra = ` (${(performance.now() - S.programmerRequestedAt).toFixed(0)} ms after request)`;
      S.programmerRequestedAt = 0;
    }
    if (inProg && S.reconnectStartedAt) {
      extra += ` [reconnect→programmer ${(performance.now() - S.reconnectStartedAt).toFixed(0)} ms]`;
      S.reconnectStartedAt = 0;
    }
    log.add(inProg ? 'ok' : 'warn', `← LP   layout changed → ${lay.name} (page ${lay.page})${extra}`);
    if (inProg) {
      S.frameCacheValid = false;
      paintRoles();
      log.add('sys', 'full repaint after acquiring Programmer mode');
    }
    if (!inProg && S.desiredProgrammer && S.autoReenter) {
      const now = performance.now();
      S.reentries = S.reentries.filter((t) => now - t < 10000);
      if (S.reentries.length < 3) {
        S.reentries.push(now);
        releaseAllHeld('mode lost');
        log.add('warn', `kicked out of Programmer mode → re-entering (${S.reentries.length}/3 within 10 s)`);
        enterProgrammer(true);
      } else
        log.add(
          'bad',
          'CONFLICT: left Programmer mode 3× within 10 s — something else is controlling the Launchpad. Automatic recovery suspended; press Enter Programmer to retry.',
        );
    }
    return;
  }
  log.add('in', `← LP   sysex ${hex(d)}`);
}
function checkIndex(kind, index, value) {
  if (value === 0) return;
  const exp = expectedKind(index);
  const ok = (exp === 'note' && kind === 'note') || (exp === 'cc' && kind === 'cc');
  S.indexSeen.add(index);
  const row = Math.floor(index / 10),
    col = index % 10;
  log.add(
    ok ? 'ok' : 'bad',
    `index ${index} sent as ${kind} — expected ${exp} ${isGridPad(index) ? `(grid row ${row} col ${col})` : ''} ${ok ? '✓' : '✗ MISMATCH'}  seen ${S.indexSeen.size}/105`,
  );
  sendLpQuiet(ledMessages([ok ? spec.rgb(index, 0, 127, 0) : spec.rgb(index, 127, 0, 0)])[0]);
}
function onPadDown(pad, vel, ts) {
  if (S.palettePage !== undefined && isGridPad(pad)) {
    const idx = S.palettePage + (8 - Math.floor(pad / 10)) * 8 + ((pad % 10) - 1);
    return log.add('ok', `palette index ${idx} (pad ${pad})`);
  }
  const note = fourthsNote(pad, S.baseNote, S.rowOffset);
  if (note === null) return log.add('warn', `pad ${pad} unmapped`);
  if (S.held.has(pad)) return log.add('warn', `duplicate Note On for held pad ${pad} — ignored (idempotent)`);
  S.held.set(pad, { note, channel: S.notesChannel, at: ts });
  if (S.route) {
    sendNotesQuiet([0x90 | S.notesChannel, note, vel]);
    log.add('out', `→ IAC  NoteOn ${noteName(note)} (${note}) vel ${vel} from pad ${pad}`);
  }
  if (S.latency) S.latency.inputs.push({ t: ts, note, pad, sentAt: performance.now() });
  if (S.pressFeedback)
    sendLpQuiet(
      ledMessages(padsForNote(note, S.baseNote, S.rowOffset).map((p) => spec.rgb(p, 127, 127, 127)))[0],
    );
  routeInfo([
    ['held', [...S.held.values()].map((h) => noteName(h.note)).join(' ') || '—'],
    ['base', `${S.baseNote} (${noteName(S.baseNote)})`],
  ]);
}
function onPadUp(pad, ts) {
  const h = S.held.get(pad);
  if (!h) return log.add('warn', `Note Off for unheld pad ${pad} — ignored`);
  S.held.delete(pad);
  const age = ts - h.at;
  if (age > S.endurance.maxHeldAgeMs) S.endurance.maxHeldAgeMs = age;
  const stillHeld = [...S.held.values()].some((x) => x.note === h.note && x.channel === h.channel);
  if (S.route && !stillHeld) {
    sendNotesQuiet([0x80 | h.channel, h.note, 0]);
    log.add('out', `→ IAC  NoteOff ${noteName(h.note)} from pad ${pad}`);
  } else if (stillHeld)
    log.add('sys', `pad ${pad} released but ${noteName(h.note)} still held by another pad — no Note Off`);
  if (S.pressFeedback) {
    paintRoles(padsForNote(h.note, S.baseNote, S.rowOffset));
  }
  routeInfo([
    ['held', [...S.held.values()].map((x) => noteName(x.note)).join(' ') || '—'],
    ['base', `${S.baseNote} (${noteName(S.baseNote)})`],
  ]);
}
function sendNotesQuiet(bytes) {
  S.notesOut?.send(bytes);
}
function releaseAllHeld(reason) {
  if (!S.held.size) return;
  for (const [pad, h] of S.held) {
    sendNotesQuiet([0x80 | h.channel, h.note, 0]);
    log.add('out', `→ IAC  NoteOff ${noteName(h.note)} (pad ${pad}) — ${reason}`);
  }
  S.held.clear();
  routeInfo([['held', '—']]);
}
function toggleLatency() {
  if (S.latency) {
    const L = S.latency;
    S.latency = null;
    latBtn.textContent = 'Start G5 workload count';
    log.add(
      'ok',
      `G5 in-page count: ${L.inputs.length} inputs. The authoritative numbers come from the external MIDI monitor; export the CSV to cross-check counts.`,
    );
  } else {
    S.latency = { inputs: [] };
    latBtn.textContent = 'Stop G5 count';
    log.add(
      'ok',
      'G5 workload: press pads one at a time, fully released, no overlaps. Each input must produce exactly one Note On on LS Notes.',
    );
  }
}
function exportLatency() {
  const L = S.latency ?? S.lastLatency;
  if (!L) return log.add('warn', 'no G5 data');
  const csv = [
    'input_ts_ms,note,pad,sent_wallclock_ms,in_page_delay_ms',
    ...L.inputs.map(
      (i) => `${i.t.toFixed(3)},${i.note},${i.pad},${i.sentAt.toFixed(3)},${(i.sentAt - i.t).toFixed(3)}`,
    ),
  ].join('\n');
  download(`g5-inpage-${stamp()}.csv`, csv, 'text/csv');
}

// ---------------------------------------------------------------------------------------------------
// §4 Colour and flash (G7)
// ---------------------------------------------------------------------------------------------------
const secColour = section('4 · Colour and flash', 'G7 roles · palette · flash phase');
const roles = [
  ['chordRoot', [127, 0, 64]],
  ['third', [127, 40, 0]],
  ['fifth', [127, 110, 0]],
  ['seventh', [90, 90, 90]],
  ['extension', [0, 110, 127]],
  ['scale', [0, 0, 40]],
  ['keyRoot', [40, 0, 20]],
  ['pressed', [127, 127, 127]],
];
S.flashA = 53;
S.flashB = 54;
row(
  secColour,
  btn('Paint role rows', paintRoleRows),
  btn('Palette page 0–63', () => paintPalette(0)),
  btn('Palette 64–127', () => paintPalette(64)),
);
row(
  secColour,
  'flash A',
  num(S.flashA, (v) => (S.flashA = v), { min: 0, max: 127 }),
  'B',
  num(S.flashB, (v) => (S.flashB = v), { min: 0, max: 127 }),
  btn('Flash row 1', () =>
    sendLp(
      ledMessages([11, 12, 13, 14, 15, 16, 17, 18].map((i) => spec.flash(i, S.flashB, S.flashA)))[0],
      `flash ${S.flashA}/${S.flashB}`,
    ),
  ),
  btn('Pulse row 2', () =>
    sendLp(ledMessages([21, 22, 23, 24, 25, 26, 27, 28].map((i) => spec.pulse(i, S.flashA)))[0], 'pulse'),
  ),
);
row(
  secColour,
  btn('Paint harmony demo (C major / Cmaj7)', () => paintRoles()),
);
const colourNote = document.createElement('div');
colourNote.className = 'note';
colourNote.textContent =
  'Flash/pulse phase is driven by the clock forwarded from Live (section 2). Check phase after Start, Continue mid-song and a reconnect.';
secColour.appendChild(colourNote);
function paintRoleRows() {
  const specs = [];
  roles.forEach(([, rgb], r) => {
    for (let c = 1; c <= 8; c++)
      specs.push(spec.rgb((8 - r) * 10 + c, ...rgb.map((v) => Math.round((v * (c + 1)) / 9))));
  });
  sendLp(ledMessages(specs)[0], 'role rows (brightness ramps left→right)');
  log.add('sys', 'rows top→bottom: ' + roles.map(([n]) => n).join(', '));
}
function paintPalette(start) {
  const specs = [];
  for (let i = 0; i < 64; i++) {
    const r = 8 - Math.floor(i / 8),
      c = (i % 8) + 1;
    specs.push(spec.palette(r * 10 + c, start + i));
  }
  sendLp(ledMessages(specs)[0], `palette ${start}–${start + 63}`);
  log.add(
    'sys',
    `palette page: top-left = ${start}, increasing left→right, top→bottom. Press a pad to log its palette index.`,
  );
  S.palettePage = start;
}
/** Demo harmony: C major scale, Cmaj7 chord. Pressed pads override. */
function paintRoles(onlyPads) {
  const scale = new Set([0, 2, 4, 5, 7, 9, 11]);
  const chord = new Map([
    [0, 'chordRoot'],
    [4, 'third'],
    [7, 'fifth'],
    [11, 'seventh'],
  ]);
  const heldNotes = new Set([...S.held.values()].map((h) => h.note));
  const specs = [];
  for (let r = 1; r <= 8; r++)
    for (let c = 1; c <= 8; c++) {
      const pad = r * 10 + c;
      if (onlyPads && !onlyPads.includes(pad)) continue;
      const n = fourthsNote(pad, S.baseNote, S.rowOffset);
      if (n === null) {
        specs.push(spec.palette(pad, 0));
        continue;
      }
      const pc = n % 12;
      let role = chord.get(pc) ?? (scale.has(pc) ? 'scale' : null);
      if (heldNotes.has(n)) role = 'pressed';
      if (!role) {
        specs.push(spec.palette(pad, 0));
        continue;
      }
      if (role === 'chordRoot' && S.pos.playing && S.forwardClock)
        specs.push(spec.flash(pad, S.flashB, S.flashA));
      else specs.push(spec.rgb(pad, ...roles.find(([k]) => k === role)[1]));
    }
  ledMessages(specs).forEach(sendLpQuiet);
}

// ---------------------------------------------------------------------------------------------------
// §5 Results export
// ---------------------------------------------------------------------------------------------------
const secExport = section('5 · Export', 'attach to docs/spikes/');
row(
  secExport,
  btn('Export versions + summary', () =>
    download(
      `spike-summary-${stamp()}.json`,
      JSON.stringify(
        {
          versions: versionsBlock(),
          endurance: {
            ...S.endurance,
            elapsedMin: S.endurance.startedAt
              ? ((performance.now() - S.endurance.startedAt) / 60000).toFixed(1)
              : 0,
          },
          clock: { clockCount, clockGapMax, tempoEst },
          heldNow: [...S.held.values()],
        },
        null,
        2,
      ),
    ),
  ),
);
window.__spike = S; // for ad-hoc inspection in the console
log.add(
  'sys',
  'Spike harness ready. 1) Request MIDI access. 2) Enter Programmer. 3) Follow docs/spikes/README.md.',
);
