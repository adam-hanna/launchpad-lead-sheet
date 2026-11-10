import { describe, expect, it, vi } from 'vitest';
import { WebMidi } from '@adapters/midi';
import { standardFakeAccess } from '@adapters/midi/fake';
import { VirtualLaunchpad } from '@adapters/virtual';
import { DEMO_CHART } from '@app/state/demoSheet';
import { SessionController } from './sessionController';
import { animationFrameScheduler, createSessionStore } from './store';

function controller() {
  const midi = new WebMidi(() => Promise.resolve(standardFakeAccess()));
  const c = new SessionController({
    midi,
    virtual: new VirtualLaunchpad(),
    setTimer: () => 0,
    clearTimer: () => undefined,
  });
  c.loadChart(DEMO_CHART, 'demo');
  return c;
}

describe('session store update scheduling (roadmap M7-T10)', () => {
  it('mirrors every snapshot immediately by default', () => {
    const c = controller();
    const store = createSessionStore(c);
    c.selectBar(3);
    expect(store.getState().snapshot.selectedBar).toBe(3);
  });

  it('coalesces a burst of snapshots into one frame and keeps the latest', () => {
    const frames: (() => void)[] = [];
    let flushOnVisible: (() => void) | null = null;
    const schedule = animationFrameScheduler(
      (cb) => frames.push(cb),
      (flush) => {
        flushOnVisible = flush;
      },
    );
    const c = controller();
    const store = createSessionStore(c, 'owner', schedule);
    const setState = vi.spyOn(store, 'setState');
    for (let bar = 2; bar <= 8; bar++) c.selectBar(bar);
    expect(frames).toHaveLength(1);
    expect(setState).not.toHaveBeenCalled();
    expect(store.getState().snapshot.selectedBar).toBe(1);
    frames[0]!();
    expect(setState).toHaveBeenCalledTimes(1);
    expect(store.getState().snapshot.selectedBar).toBe(8);

    // A hidden tab: the frame never fires, visibility returning flushes the pending update instead.
    c.selectBar(4);
    expect(frames).toHaveLength(2);
    flushOnVisible!();
    expect(store.getState().snapshot.selectedBar).toBe(4);
    frames[1]!(); // the late frame finds nothing pending
    expect(setState).toHaveBeenCalledTimes(2);
  });
});
