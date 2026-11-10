/**
 * A fake Web MIDI implementation installed with `page.addInitScript` before the app loads.
 *
 * It exposes the ports we care about (the Launchpad Pro MK3 "MIDI" pair and two IAC buses) and records
 * every byte the app sends on `window.__midiMock.sent`, so e2e tests can assert on device commands
 * without hardware. Tests can inject incoming messages with `window.__midiMock.receive(portId, bytes)`.
 *
 * This file is serialised into the page, so it must not import anything.
 */
export const WEB_MIDI_MOCK_SCRIPT = String.raw`
(() => {
  const listeners = new Map(); // portId -> Set<fn>
  const sent = [];

  function makePort(id, name, type) {
    const port = {
      id, name, type, manufacturer: 'Mock', state: 'connected', connection: 'closed', version: '1',
      onmidimessage: null, onstatechange: null,
      open() { port.connection = 'open'; return Promise.resolve(port); },
      close() { port.connection = 'closed'; return Promise.resolve(port); },
      addEventListener(ev, fn) { if (ev === 'midimessage') { (listeners.get(id) || listeners.set(id, new Set()).get(id)).add(fn); } },
      removeEventListener(ev, fn) { listeners.get(id)?.delete(fn); },
      dispatchEvent() { return true; },
    };
    if (type === 'output') port.send = (data, timestamp) => { sent.push({ portId: id, data: Array.from(data), timestamp }); };
    return port;
  }

  const inputs = new Map([
    ['in-lp', makePort('in-lp', 'LPProMK3 MIDI', 'input')],
    ['in-clock', makePort('in-clock', 'IAC Driver LS Clock', 'input')],
  ]);
  const outputs = new Map([
    ['out-lp', makePort('out-lp', 'LPProMK3 MIDI', 'output')],
    ['out-notes', makePort('out-notes', 'IAC Driver LS Notes', 'output')],
  ]);

  const access = {
    inputs, outputs, sysexEnabled: true, onstatechange: null,
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  };

  window.__midiMock = {
    sent,
    receive(portId, bytes) {
      const port = inputs.get(portId);
      const event = { data: new Uint8Array(bytes), timeStamp: performance.now(), target: port, currentTarget: port };
      if (port && typeof port.onmidimessage === 'function') port.onmidimessage(event);
      for (const fn of listeners.get(portId) || []) fn(event);
    },
    reset() { sent.length = 0; },
  };

  Object.defineProperty(navigator, 'requestMIDIAccess', {
    configurable: true,
    value: () => Promise.resolve(access),
  });
})();
`;
