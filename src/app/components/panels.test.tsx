// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LAYOUT_PROGRAMMER } from '@core/device';
import { WebMidi } from '@adapters/midi';
import { standardFakeAccess } from '@adapters/midi/fake';
import { VirtualLaunchpad } from '@adapters/virtual';
import { DegradedStates } from './DegradedStates';
import { SetupPanel } from './SetupPanel';
import { SettingsPanel } from './SettingsPanel';
import { TransportHeader } from './TransportHeader';
import { nextChord, positionMessage, transportLabel } from '@app/lib/transportText';
import { DEMO_CHART } from '@app/state/demoSheet';
import { SessionController } from '@app/state/sessionController';

afterEach(cleanup);

const LAYOUT_MSG = (layout: number) => [0xf0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x00, layout, 0x00, 0x00, 0xf7];

function make(opts: { grant?: boolean } = {}) {
  const access = standardFakeAccess();
  const midi = new WebMidi(opts.grant === false ? null : () => Promise.resolve(access));
  const controller = new SessionController({
    midi,
    virtual: new VirtualLaunchpad(),
    setTimer: () => 0,
    clearTimer: () => undefined,
  });
  controller.loadChart(DEMO_CHART, 'demo');
  return { access, midi, controller };
}

describe('TransportHeader', () => {
  it('labels states and messages (plan §4.4)', async () => {
    const { controller, access } = make();
    await controller.requestAccess();
    const clock = access.inputs.get('in-clock')!;
    expect(transportLabel(controller.snapshot())).toBe('Waiting for position');
    expect(positionMessage(controller.snapshot())).toMatch(/Press Play/);
    clock.receive([0xfa], 0);
    expect(transportLabel(controller.snapshot())).toBe('Playing');
    expect(positionMessage(controller.snapshot())).toBeNull();
    clock.receive([0xfc], 1);
    expect(transportLabel(controller.snapshot())).toBe('Stopped');
    access.unplug('in-clock');
    expect(transportLabel(controller.snapshot())).toBe('Clock input lost');
    controller.loadChart('title: x\n', 'empty');
    expect(positionMessage(controller.snapshot())).toBe('Empty sheet');
  });

  it('shows now and next chords, following splits and the loop', () => {
    const { controller } = make();
    controller.selectBar(2); // Am7, next Dm7
    expect(nextChord(controller.snapshot())).toBe('Dm7');
    controller.selectBar(3); // Dm7 G7: next is the second half
    expect(nextChord(controller.snapshot())).toBe('G7');
    controller.loadChart('loop: 1-2\n| C | D | E |', 'loop');
    controller.selectBar(2);
    expect(nextChord(controller.snapshot())).toBe('C');
    render(<TransportHeader snap={controller.snapshot()} />);
    expect(screen.getByTestId('now-chord').textContent).toBe('D');
    expect(screen.getByTestId('next-chord').textContent).toBe('C');
    expect(screen.getByTestId('status-transport').textContent).toBe('Waiting for position');
  });
});

describe('SetupPanel', () => {
  it('connects, auto-detects and controls the device; shows lights and held notes', async () => {
    const { controller, access } = make();
    const { rerender } = render(<SetupPanel snap={controller.snapshot()} controller={controller} />);
    expect(screen.getByTestId('light-device').dataset.ok).toBe('false');
    await act(async () => {
      fireEvent.click(screen.getByText('Connect MIDI'));
      await Promise.resolve();
    });
    rerender(<SetupPanel snap={controller.snapshot()} controller={controller} />);
    expect(controller.snapshot().selection.lpIn).toBe('in-lp');
    expect(screen.queryByText('Connect MIDI')).toBeNull();
    fireEvent.click(screen.getByText('Take the Launchpad'));
    access.inputs.get('in-lp')!.receive(LAYOUT_MSG(LAYOUT_PROGRAMMER));
    rerender(<SetupPanel snap={controller.snapshot()} controller={controller} />);
    expect(screen.getByTestId('light-device').dataset.ok).toBe('true');
    access.inputs.get('in-lp')!.receive([0x90, 11, 100]);
    rerender(<SetupPanel snap={controller.snapshot()} controller={controller} />);
    expect(screen.getByTestId('held-notes').textContent).toMatch(/Holding 1 note/);
    fireEvent.click(screen.getByText('Panic'));
    rerender(<SetupPanel snap={controller.snapshot()} controller={controller} />);
    expect(screen.queryByTestId('held-notes')).toBeNull();
    fireEvent.click(screen.getByText('Test pattern'));
    fireEvent.click(screen.getByText('Restore Launchpad'));
    expect(controller.snapshot().ownership.status).toBe('released');
    access.unplug('out-notes');
    access.inputs.get('in-lp')!.receive(LAYOUT_MSG(LAYOUT_PROGRAMMER));
    rerender(<SetupPanel snap={controller.snapshot()} controller={controller} />);
    expect(screen.getByTestId('light-notes').dataset.ok).toBe('false');
  });
});

describe('DegradedStates', () => {
  it('renders the right banners', async () => {
    const unsupported = make({ grant: false });
    const { rerender } = render(
      <DegradedStates
        snap={unsupported.controller.snapshot()}
        tabRole="passive"
        onTakeOver={() => undefined}
        onRetryDevice={() => undefined}
      />,
    );
    expect(screen.getByTestId('banner-unsupported')).toBeTruthy();
    expect(screen.getByTestId('banner-other-tab')).toBeTruthy();
    const denied = new SessionController({
      midi: new WebMidi(() => Promise.reject(new Error('no'))),
      virtual: new VirtualLaunchpad(),
    });
    await denied.requestAccess();
    rerender(
      <DegradedStates
        snap={denied.snapshot()}
        tabRole="owner"
        onTakeOver={() => undefined}
        onRetryDevice={() => undefined}
      />,
    );
    expect(screen.getByTestId('banner-denied').textContent).toMatch(/denied/);
    const { controller, access } = make();
    await controller.requestAccess();
    controller.selectPorts({ clockIn: undefined });
    rerender(
      <DegradedStates
        snap={controller.snapshot()}
        tabRole="owner"
        onTakeOver={() => undefined}
        onRetryDevice={() => undefined}
      />,
    );
    expect(screen.getByTestId('banner-ports').textContent).toMatch(/clockIn/);
    controller.autodetect();
    controller.enterProgrammer();
    const lpIn = access.inputs.get('in-lp')!;
    for (let i = 0; i < 4; i++) {
      lpIn.receive(LAYOUT_MSG(LAYOUT_PROGRAMMER));
      lpIn.receive(LAYOUT_MSG(0x00));
    }
    expect(controller.snapshot().ownership.status).toBe('conflict');
    const { container } = render(
      <DegradedStates
        snap={controller.snapshot()}
        tabRole="owner"
        onTakeOver={() => undefined}
        onRetryDevice={() => undefined}
      />,
    );
    expect(container.querySelector('[data-testid="banner-conflict"]')).toBeTruthy();
    expect(
      render(
        <DegradedStates
          snap={controller.snapshot()}
          tabRole="owner"
          onTakeOver={() => undefined}
          onRetryDevice={() => undefined}
        />,
      ).container,
    ).toBeTruthy();
  });
});

describe('SettingsPanel', () => {
  it('changes settings through the controller', () => {
    const { controller } = make();
    const { rerender } = render(<SettingsPanel snap={controller.snapshot()} controller={controller} />);
    fireEvent.click(screen.getByText('Chord'));
    expect(controller.snapshot().settings.displayMode).toBe('chord');
    fireEvent.click(screen.getByText('Fixed shape'));
    rerender(<SettingsPanel snap={controller.snapshot()} controller={controller} />);
    expect(controller.snapshot().settings.relative).toBe(true);
    fireEvent.click(screen.getByText('Key root'));
    expect(controller.snapshot().settings.anchor).toBe('keyRoot');
    fireEvent.click(screen.getByText('Thirds'));
    expect(controller.snapshot().settings.layout.rowOffset).toBe(4);
    fireEvent.click(screen.getByLabelText('Octave up'));
    rerender(<SettingsPanel snap={controller.snapshot()} controller={controller} />);
    expect(screen.getByTestId('octave-shift').textContent).toBe('+1');
    fireEvent.change(screen.getByLabelText('MIDI channel to Live'), { target: { value: '5' } });
    expect(controller.snapshot().settings.notesChannel).toBe(4);
    fireEvent.change(screen.getByLabelText('Row offset (semitones)'), { target: { value: '99' } });
    expect(controller.snapshot().settings.layout.rowOffset).toBe(12);
    fireEvent.click(screen.getByText('Go dark'));
    expect(controller.snapshot().settings.pastEnd).toBe('dark');
    fireEvent.click(screen.getByText('Pink, red, orange'));
    expect(controller.snapshot().settings.themeName).toBe('pinkRedOrange');
    fireEvent.click(screen.getByText('Custom'));
    expect(controller.snapshot().settings.layout.rowOffset).toBe(7);
  });
});
