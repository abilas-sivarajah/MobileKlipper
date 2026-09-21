import { describe, expect, it } from 'vitest';
import {
  joinPath,
  MoonrakerClient,
  mergeStatus,
  normalizeBaseUrl,
  pickSubscribedObjects,
  websocketUrlFor,
} from '@/moonraker/client';

describe('normalizeBaseUrl', () => {
  it('adds the scheme and Moonraker default port for a bare host', () => {
    expect(normalizeBaseUrl('192.168.1.42')).toBe('http://192.168.1.42:7125');
    expect(normalizeBaseUrl('printer.local')).toBe('http://printer.local:7125');
  });

  it('never overrides a port the user named', () => {
    expect(normalizeBaseUrl('printer.local:80')).toBe('http://printer.local');
    expect(normalizeBaseUrl('http://printer.local:8080')).toBe('http://printer.local:8080');
    // https defaults to 443 and must not gain Moonraker's port either.
    expect(normalizeBaseUrl('https://printer.example.com')).toBe('https://printer.example.com');
  });

  it('strips trailing slashes and tolerates whitespace', () => {
    expect(normalizeBaseUrl('  http://printer.local:7125/// ')).toBe('http://printer.local:7125');
  });

  it('keeps a reverse-proxy subpath', () => {
    expect(normalizeBaseUrl('https://home.example.com/printer')).toBe(
      'https://home.example.com/printer',
    );
  });
});

describe('websocketUrlFor', () => {
  it('maps http to ws and https to wss', () => {
    expect(websocketUrlFor('http://printer.local:7125')).toBe('ws://printer.local:7125/websocket');
    expect(websocketUrlFor('https://printer.local')).toBe('wss://printer.local/websocket');
  });

  it('appends to a subpath rather than replacing it', () => {
    expect(websocketUrlFor('https://home.example.com/printer')).toBe(
      'wss://home.example.com/printer/websocket',
    );
  });
});

describe('pickSubscribedObjects', () => {
  it('takes core objects and every dynamic heater, fan and sensor', () => {
    const picked = pickSubscribedObjects([
      'webhooks',
      'toolhead',
      'extruder',
      'extruder1',
      'heater_bed',
      'heater_generic chamber',
      'temperature_sensor mcu',
      'fan_generic filter',
      'output_pin caselight',
      'gcode_macro START_PRINT',
      'gcode_button foo',
      'stepper_enable',
    ]);
    expect(picked).toContain('extruder1');
    expect(picked).toContain('heater_generic chamber');
    expect(picked).toContain('temperature_sensor mcu');
    expect(picked).toContain('gcode_macro START_PRINT');
    // Objects with nothing worth watching are left out of the subscription.
    expect(picked).not.toContain('gcode_button foo');
    expect(picked).not.toContain('stepper_enable');
  });

  it('never subscribes to an object the printer does not have', () => {
    expect(pickSubscribedObjects(['toolhead'])).toEqual(['toolhead']);
  });
});

describe('mergeStatus', () => {
  it('merges field by field instead of replacing whole objects', () => {
    const base = { extruder: { temperature: 200, target: 210 }, fan: { speed: 1 } };
    const merged = mergeStatus(base, { extruder: { temperature: 205 } });
    expect(merged.extruder).toEqual({ temperature: 205, target: 210 });
    expect(merged.fan).toEqual({ speed: 1 });
  });

  it('adds objects that appear for the first time', () => {
    const merged = mergeStatus({}, { heater_bed: { temperature: 60 } });
    expect(merged.heater_bed).toEqual({ temperature: 60 });
  });

  it('does not mutate the previous state', () => {
    const base = { extruder: { temperature: 200 } };
    mergeStatus(base, { extruder: { temperature: 210 } });
    expect(base.extruder.temperature).toBe(200);
  });
});

describe('joinPath', () => {
  it('resolves . and .. segments', () => {
    expect(joinPath('prints', '.thumbs/cube.png')).toBe('prints/.thumbs/cube.png');
    expect(joinPath('prints/sub', '../cube.png')).toBe('prints/cube.png');
    expect(joinPath('', 'cube.png')).toBe('cube.png');
  });
});

describe('url helpers', () => {
  const client = new MoonrakerClient({ baseUrl: 'http://printer.local:7125' });

  it('encodes each path segment, keeping the separators', () => {
    expect(client.fileUrl('gcodes', 'my prints/part #3.gcode')).toBe(
      'http://printer.local:7125/server/files/gcodes/my%20prints/part%20%233.gcode',
    );
  });

  it('resolves a thumbnail relative to its gcode file', () => {
    expect(client.thumbnailUrl('prints/cube.gcode', '.thumbs/cube-300x300.png')).toBe(
      'http://printer.local:7125/server/files/gcodes/prints/.thumbs/cube-300x300.png',
    );
    // A thumbnail next to the file, with no leading "./", resolves the same way.
    expect(client.thumbnailUrl('prints/cube.gcode', 'cube-32x32.png')).toBe(
      'http://printer.local:7125/server/files/gcodes/prints/cube-32x32.png',
    );
  });

  it('leaves absolute webcam urls alone and prefixes relative ones', () => {
    expect(client.resolveUrl('http://cam.local/stream')).toBe('http://cam.local/stream');
    expect(client.resolveUrl('/webcam/?action=stream')).toBe(
      'http://printer.local:7125/webcam/?action=stream',
    );
  });

  it('passes the api key as a query param for img tags', () => {
    const authed = new MoonrakerClient({ baseUrl: 'http://printer.local:7125', apiKey: 'abc123' });
    expect(authed.fileUrl('gcodes', 'cube.gcode')).toContain('?apikey=abc123');
  });
});
