// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebMidi } from '@adapters/midi';
import { standardFakeAccess } from '@adapters/midi/fake';
import { Autosave, MemoryKv, MemoryStorage, SettingsStore, SheetStore } from '@adapters/storage';
import { VirtualLaunchpad } from '@adapters/virtual';
import { BarEditor } from './BarEditor';
import { parseChordField, parseKeyField } from '@app/lib/barFields';
import type { BarPatch } from '@app/state/sessionController';
import { ChartGrid } from './ChartGrid';
import { barKeyAction } from '@app/lib/chartKeys';
import { LibraryPanel, SheetMetaEditor } from './SheetPanel';
import { DEMO_CHART } from '@app/state/demoSheet';
import { SessionController } from '@app/state/sessionController';
import { createSessionStore } from '@app/state/store';

afterEach(cleanup);

function make() {
  const access = standardFakeAccess();
  const midi = new WebMidi(() => Promise.resolve(access));
  const sheets = new SheetStore(new MemoryKv());
  let ctl: SessionController | null = null;
  const autosave = new Autosave(sheets, {
    debounceMs: 0,
    setTimer: (fn) => {
      fn();
      return 0;
    },
    clearTimer: () => undefined,
    onSaved: (id) => ctl?.onSaved(id),
    onError: (id, e) => ctl?.onSaveError(id, e),
  });
  const controller = new SessionController({
    midi,
    virtual: new VirtualLaunchpad(),
    setTimer: () => 0,
    clearTimer: () => undefined,
    persistence: { sheets, autosave, settings: new SettingsStore(new MemoryStorage()) },
  });
  ctl = controller;
  controller.loadChart(DEMO_CHART, 'demo');
  const store = createSessionStore(controller);
  return { access, controller, sheets, autosave, store };
}

describe('ChartGrid', () => {
  it('renders bars four per row with sections, inherited values greyed and the selection outlined', () => {
    const { controller } = make();
    const onSelect = vi.fn();
    const onEdit = vi.fn();
    render(
      <ChartGrid
        snap={controller.snapshot()}
        onSelect={onSelect}
        onEdit={onEdit}
        onInsert={() => undefined}
      />,
    );
    expect(screen.getAllByTestId(/^bar-/)).toHaveLength(8);
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByTestId('bar-1').textContent).toContain('{C}');
    expect(screen.getByTestId('bar-1').textContent).toContain('Cmaj7');
    expect(screen.getByTestId('bar-3').textContent).toContain('Dm7  G7');
    expect(screen.getByTestId('bar-1').dataset.selected).toBe('true');
    fireEvent.click(screen.getByTestId('bar-2'));
    expect(onSelect).toHaveBeenCalledWith(1);
    fireEvent.doubleClick(screen.getByTestId('bar-2'));
    expect(onEdit).toHaveBeenCalledWith(1);
  });

  it('greys inherited bars, highlights the playing bar and shows the empty state', () => {
    const { controller, access } = make();
    controller.loadChart('| C | | D |', 'inh');
    const { rerender } = render(
      <ChartGrid
        snap={controller.snapshot()}
        onSelect={() => undefined}
        onEdit={() => undefined}
        onInsert={() => undefined}
      />,
    );
    expect(screen.getByTestId('bar-2').querySelector('[data-inherited="true"]')?.textContent).toBe('C');
    expect(screen.getByTestId('bar-1').querySelector('[data-inherited="false"]')).toBeTruthy();
    void controller.requestAccess();
    return waitFor(() => {
      expect(controller.snapshot().selection.clockIn).toBe('in-clock');
    }).then(() => {
      const clock = access.inputs.get('in-clock')!;
      clock.receive([0xfa], 0);
      for (let i = 0; i < 97; i++) clock.receive([0xf8], i + 1);
      rerender(
        <ChartGrid
          snap={controller.snapshot()}
          onSelect={() => undefined}
          onEdit={() => undefined}
          onInsert={() => undefined}
        />,
      );
      expect(screen.getByTestId('bar-2').dataset.active).toBe('true');
      expect(screen.getByTestId('bar-1').dataset.active).toBe('false');
      controller.loadChart('title: empty\n', 'empty');
      const onInsert = vi.fn();
      rerender(
        <ChartGrid
          snap={controller.snapshot()}
          onSelect={() => undefined}
          onEdit={() => undefined}
          onInsert={onInsert}
        />,
      );
      fireEvent.click(screen.getByText('Add a bar'));
      expect(onInsert).toHaveBeenCalledWith(0);
    });
  });
});

describe('ChartGrid keyboard navigation (roadmap M7-T9)', () => {
  it('maps keys to selection, edit and insert actions with clamping', () => {
    expect(barKeyAction('ArrowRight', 0, 8)).toEqual({ type: 'select', index: 1 });
    expect(barKeyAction('ArrowLeft', 0, 8)).toEqual({ type: 'select', index: 0 });
    expect(barKeyAction('ArrowDown', 6, 8)).toEqual({ type: 'select', index: 7 });
    expect(barKeyAction('ArrowUp', 5, 8)).toEqual({ type: 'select', index: 1 });
    expect(barKeyAction('Home', 5, 8)).toEqual({ type: 'select', index: 0 });
    expect(barKeyAction('End', 5, 8)).toEqual({ type: 'select', index: 7 });
    expect(barKeyAction('Enter', 2, 8)).toEqual({ type: 'edit' });
    expect(barKeyAction('+', 2, 8)).toEqual({ type: 'insert' });
    expect(barKeyAction('a', 2, 8)).toBeNull();
  });

  it('keeps one bar in the tab order, moves selection and focus with the arrows, edits with Enter', () => {
    const { controller, store } = make();
    const onEdit = vi.fn();
    const onInsert = vi.fn();
    const View = () => (
      <ChartGrid
        snap={store.getState().snapshot}
        onSelect={(i) => {
          controller.selectBar(i + 1);
        }}
        onEdit={onEdit}
        onInsert={onInsert}
      />
    );
    const { rerender } = render(<View />);
    const tabbable = screen.getAllByTestId(/^bar-/).filter((b) => b.tabIndex === 0);
    expect(tabbable.map((b) => b.dataset.testid)).toEqual(['bar-1']);
    expect(screen.getByTestId('bar-3').getAttribute('aria-label')).toBe('Bar 3, Dm7  G7');
    expect(screen.getByTestId('bar-1').getAttribute('aria-label')).toContain('key C');

    act(() => {
      fireEvent.keyDown(screen.getByTestId('bar-1'), { key: 'ArrowRight' });
    });
    rerender(<View />);
    expect(controller.snapshot().selectedBar).toBe(2);
    expect(screen.getByTestId('bar-2').tabIndex).toBe(0);
    expect(document.activeElement).toBe(screen.getByTestId('bar-2'));

    act(() => {
      fireEvent.keyDown(screen.getByTestId('bar-2'), { key: 'ArrowDown' });
    });
    rerender(<View />);
    expect(controller.snapshot().selectedBar).toBe(6);

    fireEvent.keyDown(screen.getByTestId('bar-6'), { key: 'Enter' });
    expect(onEdit).toHaveBeenCalledWith(5);
    fireEvent.keyDown(screen.getByTestId('bar-6'), { key: 'Insert' });
    expect(onInsert).toHaveBeenCalledWith(6);
  });
});

describe('BarEditor', () => {
  it('validates fields and applies a patch', () => {
    const two = parseChordField('Dm7 G7');
    expect('chords' in two && two.chords.map((c) => c.symbol)).toEqual(['Dm7', 'G7']);
    const empty = parseChordField('');
    expect('error' in empty && empty.error).toMatch(/one or two/);
    expect(parseChordField('C D E')).toEqual({ error: 'at most two chords per bar' });
    const bad = parseChordField('Hm7');
    expect('error' in bad && bad.error).toMatch(/Hm7/);
    const key = parseKeyField('G dorian');
    expect('key' in key && key.key).toMatchObject({ root: 7, scale: 'dorian' });
    const badKey = parseKeyField('G bebop');
    expect('error' in badKey && badKey.error).toMatch(/bebop/);

    const { controller } = make();
    const onApply = vi.fn<(index: number, patch: BarPatch) => void>();
    const onRemove = vi.fn<(index: number) => void>();
    render(
      <BarEditor
        sheet={controller.snapshot().sheet}
        index={2}
        onClose={() => undefined}
        onApply={onApply}
        onRemove={onRemove}
        onInsertAfter={() => undefined}
      />,
    );
    expect(screen.getByText('Bar 3')).toBeTruthy();
    const chords = screen.getByLabelText<HTMLInputElement>('Chords');
    expect(chords.value).toBe('Dm7 G7');
    fireEvent.change(chords, { target: { value: 'Em7 Hx' } });
    expect(screen.getByTestId('chord-error').textContent).toMatch(/Hx/);
    expect(screen.getByTestId<HTMLButtonElement>('apply-bar').disabled).toBe(true);
    fireEvent.change(chords, { target: { value: 'Em7 A7' } });
    fireEvent.click(screen.getByText('Set', { selector: '[data-testid="key-mode"] button' }));
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'Em' } });
    fireEvent.change(screen.getByLabelText('Section label (starts a new row)'), {
      target: { value: 'Bridge' },
    });
    fireEvent.click(screen.getByTestId('apply-bar'));
    expect(onApply).toHaveBeenCalledTimes(1);
    const call = onApply.mock.calls[0]!;
    const index = call[0];
    const patch = call[1];
    expect(index).toBe(2);
    expect(patch.key).toMatchObject({ root: 4, scale: 'naturalMinor' });
    const patchChords = patch.chords;
    expect(
      patchChords !== undefined && patchChords !== 'inherit' ? patchChords.map((c) => c.symbol) : null,
    ).toEqual(['Em7', 'A7']);
    expect(patch.section).toBe('Bridge');
    fireEvent.click(screen.getByText('Delete bar'));
    expect(onRemove).toHaveBeenCalledWith(2);
  });
});

describe('SheetMetaEditor and LibraryPanel', () => {
  it('edits metadata with validation and lists the library', async () => {
    const { controller, autosave } = make();
    await autosave.settled();
    const { rerender } = render(
      <>
        <SheetMetaEditor snap={controller.snapshot()} controller={controller} />
        <LibraryPanel snap={controller.snapshot()} controller={controller} />
      </>,
    );
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Renamed' } });
    expect(controller.snapshot().sheet.title).toBe('Renamed');
    fireEvent.change(screen.getByLabelText('Loop end bar'), { target: { value: '99' } });
    rerender(
      <>
        <SheetMetaEditor snap={controller.snapshot()} controller={controller} />
        <LibraryPanel snap={controller.snapshot()} controller={controller} />
      </>,
    );
    expect(screen.getByTestId('meta-issues').textContent).toMatch(/loop/);
    expect(controller.snapshot().sheet.loop).toBeUndefined();
    fireEvent.change(screen.getByLabelText('Loop end bar'), { target: { value: '4' } });
    expect(controller.snapshot().sheet.loop).toEqual({ startBar: 1, endBar: 4 });
    await waitFor(() => {
      expect(screen.getByTestId('library-list').textContent).toContain('Renamed');
    });
    await act(async () => {
      fireEvent.click(screen.getByText('New'));
      await autosave.settled();
    });
    expect(controller.snapshot().sheet.title).toBe('Untitled');
    expect(controller.snapshot().sheet.bars).toHaveLength(4);
    expect((await controller.library()).map((s) => s.title).sort()).toEqual(['Renamed', 'Untitled']);
  });
});
