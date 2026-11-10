// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { led } from '@core/lighting';
import { VirtualLaunchpad as VirtualDevice } from '@adapters/virtual';
import { VirtualLaunchpad } from './VirtualLaunchpad';

afterEach(cleanup);

describe('<VirtualLaunchpad />', () => {
  it('renders 64 pads and 33 buttons lit from the device frame', () => {
    const device = new VirtualDevice();
    device.send([{ pad: 11, state: led.rgb(127, 0, 0) }]);
    render(<VirtualLaunchpad device={device} />);
    expect(screen.getAllByTestId(/^pad-/)).toHaveLength(64);
    expect(screen.getAllByTestId(/^button-/)).toHaveLength(33);
    expect(screen.getByTestId('pad-11').style.background).toBe('rgb(255, 0, 0)');
    expect(screen.getByTestId('pad-12').style.background).toBe('rgb(20, 20, 20)');
    expect(screen.getByTestId('virtual-launchpad').dataset.layout).toBe(String(0x04));
  });

  it('pointer down/up presses and releases pads; buttons report values', () => {
    const device = new VirtualDevice(() => 5);
    const pad = vi.fn();
    const button = vi.fn();
    device.onPad(pad);
    device.onButton(button);
    render(<VirtualLaunchpad device={device} />);
    const p = screen.getByTestId('pad-45');
    fireEvent.pointerDown(p);
    expect(p.getAttribute('aria-pressed')).toBe('true');
    fireEvent.pointerUp(p);
    expect(pad.mock.calls).toEqual([
      [45, 100, 5],
      [45, 0, 5],
    ]);
    fireEvent.pointerDown(screen.getByTestId('button-80'));
    fireEvent.pointerUp(screen.getByTestId('button-80'));
    expect(button.mock.calls).toEqual([
      [80, 127, 5],
      [80, 0, 5],
    ]);
  });

  it('pointer leave/cancel and window blur release held pads', () => {
    const device = new VirtualDevice();
    render(<VirtualLaunchpad device={device} />);
    const p = screen.getByTestId('pad-21');
    fireEvent.pointerDown(p);
    fireEvent.pointerLeave(p);
    expect(device.state().pressed.size).toBe(0);
    fireEvent.pointerDown(p);
    fireEvent.pointerCancel(p);
    expect(device.state().pressed.size).toBe(0);
    fireEvent.pointerDown(p);
    fireEvent.blur(window);
    expect(device.state().pressed.size).toBe(0);
  });

  it('re-renders when the device frame changes after mount', () => {
    const device = new VirtualDevice();
    render(<VirtualLaunchpad device={device} />);
    act(() => {
      device.send([{ pad: 88, state: led.palette(3) }]);
    });
    expect(screen.getByTestId('pad-88').style.background).toBe('rgb(255, 255, 255)');
    act(() => {
      device.enterProgrammerMode();
    });
    expect(screen.getByTestId('virtual-launchpad').dataset.layout).toBe(String(0x11));
  });
});
