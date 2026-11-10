import { beforeEach, describe, expect, it } from 'vitest';
import { usePrintersStore } from '@/store/printers';

describe('printers store', () => {
  beforeEach(() => {
    usePrintersStore.setState({ printers: [], activeId: null });
  });

  it('seeds a new printer from its model profile', () => {
    const printer = usePrintersStore
      .getState()
      .addPrinter({ name: 'Ender', baseUrl: '192.168.1.20', model: 'ender3v2' });
    expect(printer.model).toBe('ender3v2');
    expect(printer.feedrateZ).toBe(5);
    expect(printer.filament.unloadLength).toBe(400);
    expect(printer.baseUrl).toBe('http://192.168.1.20:7125');
  });

  it('re-applies a profile without touching connection settings', () => {
    const store = usePrintersStore.getState();
    const printer = store.addPrinter({ name: 'N4', baseUrl: 'neptune.local', apiKey: 'k' });
    store.toggleFavoriteMacro(printer.id, 'PRINT_START');
    store.applyProfile(printer.id, 'neptune4');
    const updated = usePrintersStore.getState().printers[0]!;
    expect(updated.model).toBe('neptune4');
    expect(updated.feedrateXY).toBe(150);
    expect(updated.apiKey).toBe('k');
    expect(updated.favoriteMacros).toEqual(['PRINT_START']);
  });

  it('backfills settings added after a printer was saved', async () => {
    // A config persisted before profiles existed: no model, no filament.
    localStorage.setItem(
      'mobileklipper.printers',
      JSON.stringify({
        state: {
          activeId: 'old',
          printers: [{ id: 'old', name: 'Alt', baseUrl: 'http://x:7125', moveSteps: [1], filament: { unloadLength: 300 } }],
        },
        version: 1,
      }),
    );
    await usePrintersStore.persist.rehydrate();
    const printer = usePrintersStore.getState().printers[0]!;
    expect(printer.model).toBe('generic');
    expect(printer.moveSteps).toEqual([1]);
    expect(printer.filament.unloadLength).toBe(300);
    expect(printer.filament.purgeSpeed).toBeGreaterThan(0);
  });
});
