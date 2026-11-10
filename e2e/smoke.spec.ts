import { expect, test } from '@playwright/test';
import { WEB_MIDI_MOCK_SCRIPT } from './fixtures/webmidi-mock';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(WEB_MIDI_MOCK_SCRIPT);
});

test('app shell renders with the Web MIDI mock installed', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Launchpad Lead Sheet' })).toBeVisible();
  await expect(page.getByTestId('chart-area')).toBeVisible();
  await expect(page.getByTestId('side-panel')).toBeVisible();
  await expect(page.getByTestId('status-device')).toContainText('No device');

  const portNames = await page.evaluate(async () => {
    const access = await navigator.requestMIDIAccess({ sysex: true });
    return [...access.inputs.values(), ...access.outputs.values()].map((p) => `${p.type}:${p.name ?? ''}`);
  });
  expect(portNames).toEqual([
    'input:LPProMK3 MIDI',
    'input:IAC Driver LS Clock',
    'output:LPProMK3 MIDI',
    'output:IAC Driver LS Notes',
  ]);
});
