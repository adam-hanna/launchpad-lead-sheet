// Shared MIDI helpers for the spike harness. Plain ES module, browser only, throwaway (plan §5).

export const LP = {
  HEADER: [0xf0, 0x00, 0x20, 0x29, 0x02, 0x0e], // Launchpad Pro MK3 SysEx header
  programmerMode: (on) => [0xf0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x0e, on ? 0x01 : 0x00, 0xf7],
  layoutQuery: () => [0xf0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x00, 0xf7],
  selectLayout: (layout, page = 0) => [0xf0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x00, layout, page, 0x00, 0xf7],
  LAYOUT_PROGRAMMER: 0x11,
  LAYOUT_NAMES: {
    0x00: 'Session',
    0x01: 'Fader',
    0x02: 'Chord',
    0x03: 'Custom',
    0x04: 'Note/Drum',
    0x05: 'Scale settings',
    0x11: 'Programmer',
    0x12: 'Settings',
    0x13: 'Custom settings',
  },
};

export const INQUIRY = [0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7]; // Universal device inquiry

export function hex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

export function isLpSysEx(data) {
  return data.length >= 7 && LP.HEADER.every((b, i) => data[i] === b);
}

/** Decode an inquiry reply. Returns null if it is not one. */
export function decodeInquiry(data) {
  if (data.length < 15 || data[0] !== 0xf0 || data[1] !== 0x7e || data[3] !== 0x06 || data[4] !== 0x02)
    return null;
  const manufacturer = hex(data.slice(5, 8));
  const family = data[8];
  const member = data[9];
  const version = Array.from(data.slice(12, 16)).join('');
  const model =
    manufacturer === '00 20 29'
      ? family === 0x23 && member === 0x01
        ? 'Launchpad Pro MK3 (application)'
        : family === 0x23 && member === 0x11
          ? 'Launchpad Pro MK3 (bootloader)'
          : `Novation family ${family} member ${member}`
      : `manufacturer ${manufacturer}`;
  return { model, version, raw: hex(data) };
}

/** Decode a select-layout message emitted by the device when its view changes. */
export function decodeLayout(data) {
  if (!isLpSysEx(data) || data[6] !== 0x00 || data.length < 9) return null;
  const layout = data[7];
  return { layout, name: LP.LAYOUT_NAMES[layout] ?? `0x${layout.toString(16)}`, page: data[8] };
}

// ---- Programmer-mode surface --------------------------------------------------------------------

export function isGridPad(index) {
  const row = Math.floor(index / 10);
  const col = index % 10;
  return row >= 1 && row <= 8 && col >= 1 && col <= 8;
}

/** Expected message type for a programmer-mode index: grid pads send notes, everything else CCs. */
export function expectedKind(index) {
  if (isGridPad(index)) return 'note';
  const row = Math.floor(index / 10);
  const col = index % 10;
  if (index >= 91 && index <= 98) return 'cc'; // top row
  if (index >= 1 && index <= 8) return 'cc'; // bottom row
  if (col === 0 && row >= 1 && row <= 8) return 'cc'; // left column 10..80
  if (col === 9 && row >= 1 && row <= 8) return 'cc'; // right column 19..89
  if (index === 99) return 'logo';
  return 'unknown';
}

export const ALL_LED_INDICES = (() => {
  const out = [];
  for (let i = 1; i <= 8; i++) out.push(i);
  for (let r = 1; r <= 8; r++) for (let c = 0; c <= 9; c++) out.push(r * 10 + c);
  for (let i = 91; i <= 99; i++) out.push(i);
  return out; // 8 + 80 + 9 = 97 addressable here; the reference allows up to 106 specs per message
})();

// ---- LED SysEx -----------------------------------------------------------------------------------

export const spec = {
  palette: (index, p) => [0x00, index, p],
  flash: (index, b, a) => [0x01, index, b, a],
  pulse: (index, p) => [0x02, index, p],
  rgb: (index, r, g, b) => [0x03, index, clamp7(r), clamp7(g), clamp7(b)],
};

function clamp7(v) {
  return Math.max(0, Math.min(127, Math.round(v)));
}

/** Build one or more LED SysEx messages (max 106 specs each). */
export function ledMessages(specs) {
  const out = [];
  for (let i = 0; i < specs.length; i += 106) {
    out.push([...LP.HEADER, 0x03, ...specs.slice(i, i + 106).flat(), 0xf7]);
  }
  return out;
}

export function allOff() {
  return ledMessages(ALL_LED_INDICES.map((i) => spec.palette(i, 0)));
}

// ---- Grid mapping (fourths) ----------------------------------------------------------------------

/** Live-style fourths layout: each row is 5 semitones above the one below. */
export function fourthsNote(index, baseNote, rowOffset = 5) {
  if (!isGridPad(index)) return null;
  const row = Math.floor(index / 10) - 1;
  const col = (index % 10) - 1;
  const note = baseNote + row * rowOffset + col;
  return note >= 0 && note <= 127 ? note : null;
}

export function padsForNote(note, baseNote, rowOffset = 5) {
  const out = [];
  for (let r = 1; r <= 8; r++)
    for (let c = 1; c <= 8; c++)
      if (fourthsNote(r * 10 + c, baseNote, rowOffset) === note) out.push(r * 10 + c);
  return out;
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function noteName(n) {
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 2}`; // Live's naming: C3 = 60
}

// ---- Realtime / transport ------------------------------------------------------------------------

export const RT = { CLOCK: 0xf8, START: 0xfa, CONTINUE: 0xfb, STOP: 0xfc, SPP: 0xf2 };
export const RT_NAMES = {
  0xf8: 'Clock',
  0xfa: 'Start',
  0xfb: 'Continue',
  0xfc: 'Stop',
  0xf2: 'SPP',
  0xfe: 'ActiveSensing',
};

export function sppTo16ths(data) {
  return data[1] + (data[2] << 7);
}

/** Minimal position tracker (4/4) for the trace recorder display. Not the real ClockEngine. */
export class SimplePosition {
  constructor() {
    this.reset();
  }
  reset() {
    this.tick = 0; // absolute ticks since 1.1.1 (24 per quarter)
    this.playing = false;
    this.pendingFirstClock = false;
    this.valid = false;
  }
  on(data) {
    const s = data[0];
    if (s === RT.START) {
      this.tick = 0;
      this.valid = true;
      this.playing = true;
      this.pendingFirstClock = true;
    } else if (s === RT.CONTINUE) {
      this.playing = true;
      this.pendingFirstClock = true;
    } else if (s === RT.STOP) {
      this.playing = false;
    } else if (s === RT.SPP) {
      this.tick = sppTo16ths(data) * 6;
      this.valid = true;
      this.pendingFirstClock = true;
    } else if (s === RT.CLOCK && this.playing) {
      if (this.pendingFirstClock) this.pendingFirstClock = false;
      else this.tick += 1;
    }
  }
  /** 4/4 bar.beat.tick for display */
  label() {
    if (!this.valid) return 'unsynced';
    const bar = Math.floor(this.tick / 96) + 1;
    const beat = Math.floor((this.tick % 96) / 24) + 1;
    const t = this.tick % 24;
    return `${bar}.${beat}.${String(t).padStart(2, '0')}${this.playing ? '' : ' (stopped)'}`;
  }
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
