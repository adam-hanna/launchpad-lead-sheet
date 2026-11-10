import CoreMIDI
import Foundation

// Terminal-side protocol probe for gate G1 (docs/launchpad-protocol.md): inquiry, Programmer mode,
// layout query, a short LED pulse, restore Live mode. Prints every SysEx received with timing.
var client = MIDIClientRef(); MIDIClientCreateWithBlock("probe" as CFString, &client) { _ in }
var inPort = MIDIPortRef(); var outPort = MIDIPortRef()
let t0 = Date()
var received: [(Double, [UInt8])] = []
let lock = NSLock()
MIDIInputPortCreateWithProtocol(client, "in" as CFString, ._1_0, &inPort) { list, _ in
  for p in list.unsafeSequence() {
    let words = Array(MIDIEventPacket.WordCollection(&UnsafeMutablePointer(mutating: p).pointee))
    var bytes: [UInt8] = []
    var i = 0
    while i < words.count {
      let w = words[i]; let mt = (w >> 28) & 0xF
      if mt == 3, i + 1 < words.count { // SysEx7: 64-bit, status nibble + count, 6 data bytes
        let n = Int((w >> 16) & 0xF); let w2 = words[i + 1]
        let data: [UInt8] = [UInt8((w >> 8) & 0x7F), UInt8(w & 0x7F), UInt8((w2 >> 24) & 0x7F), UInt8((w2 >> 16) & 0x7F), UInt8((w2 >> 8) & 0x7F), UInt8(w2 & 0x7F)]
        bytes += Array(data.prefix(n)); i += 2
      } else if mt == 2 { bytes += [UInt8((w >> 16) & 0xFF), UInt8((w >> 8) & 0xFF), UInt8(w & 0xFF)]; i += 1 }
      else if mt == 1 { bytes += [UInt8((w >> 16) & 0xFF)]; i += 1 }
      else { i += 1 }
    }
    if bytes == [0xFE] || bytes == [0xF8] { continue } // Active Sensing / clock, ignored
    lock.lock(); received.append((Date().timeIntervalSince(t0) * 1000, bytes)); lock.unlock()
  }
}
MIDIOutputPortCreate(client, "out" as CFString, &outPort)
func find(_ name: String, src: Bool) -> MIDIEndpointRef? {
  let n = src ? MIDIGetNumberOfSources() : MIDIGetNumberOfDestinations()
  for i in 0..<n {
    let e = src ? MIDIGetSource(i) : MIDIGetDestination(i)
    var s: Unmanaged<CFString>?; MIDIObjectGetStringProperty(e, kMIDIPropertyDisplayName, &s)
    if (s?.takeRetainedValue() as String?) == name { return e }
  }
  return nil
}
guard let src = find("Launchpad Pro MK3 LPProMK3 MIDI", src: true), let dst = find("Launchpad Pro MK3 LPProMK3 MIDI", src: false) else { print("no LPProMK3 MIDI port"); exit(1) }
MIDIPortConnectSource(inPort, src, nil)
func send(_ b: [UInt8], _ label: String) {
  var pl = MIDIPacketList(); let pk = MIDIPacketListInit(&pl)
  _ = MIDIPacketListAdd(&pl, 1024, pk, 0, b.count, b)
  MIDISend(outPort, dst, &pl)
  print(String(format: "%7.1f ms  → %@  %@", Date().timeIntervalSince(t0) * 1000, label, b.map { String(format: "%02X", $0) }.joined(separator: " ")))
}
func wait(_ ms: Int) { RunLoop.current.run(until: Date().addingTimeInterval(Double(ms) / 1000)) }
func dump(_ label: String) {
  lock.lock(); let r = received; received.removeAll(); lock.unlock()
  for (t, b) in r { print(String(format: "%7.1f ms  ← %@  %@", t, label, b.map { String(format: "%02X", $0) }.joined(separator: " "))) }
  if r.isEmpty { print("           ← (nothing)") }
}
send([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7], "device inquiry"); wait(300); dump("inquiry reply")
send([0xF0, 0x00, 0x20, 0x29, 0x02, 0x0E, 0x00, 0xF7], "layout query"); wait(300); dump("layout")
send([0xF0, 0x00, 0x20, 0x29, 0x02, 0x0E, 0x0E, 0x01, 0xF7], "Programmer mode ON"); wait(2500); dump("after Programmer on (2.5 s)")
send([0xF0, 0x00, 0x20, 0x29, 0x02, 0x0E, 0x0E, 0x01, 0xF7], "Programmer mode ON again"); wait(1000); dump("after repeated on")
send([0xF0, 0x00, 0x20, 0x29, 0x02, 0x0E, 0x00, 0xF7], "layout query"); wait(300); dump("layout")
// Light pad 11 (bottom-left) pink via RGB, then all grid pads off.
send([0xF0, 0x00, 0x20, 0x29, 0x02, 0x0E, 0x03, 0x03, 0x0B, 0x7F, 0x00, 0x40, 0xF7], "LED pad 11 pink"); wait(800)
var off: [UInt8] = [0xF0, 0x00, 0x20, 0x29, 0x02, 0x0E, 0x03]
for r in 1...8 { for c in 1...8 { off += [0x00, UInt8(r * 10 + c), 0x00] } }
send(off + [0xF7], "all grid off"); wait(300); dump("during LED")
send([0xF0, 0x00, 0x20, 0x29, 0x02, 0x0E, 0x0E, 0x00, 0xF7], "Live mode (restore)"); wait(2500); dump("after restore (2.5 s)")
send([0xF0, 0x00, 0x20, 0x29, 0x02, 0x0E, 0x00, 0xF7], "layout query"); wait(300); dump("layout")
