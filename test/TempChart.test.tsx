import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TempChart } from '@/features/dashboard/TempChart';
import { seedHistory } from '@/lib/tempHistory';

// jsdom has no layout engine, so the chart's width observer never fires.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const history = seedHistory({
  extruder: { temperatures: [200, 205, 210], targets: [210, 210, 210] },
  heater_bed: { temperatures: [58, 59, 60], targets: [60, 60, 60] },
  'temperature_sensor mcu': { temperatures: [40, 41, 42] },
});

function renderChart(visible: string[], onToggle = vi.fn()) {
  render(
    <TempChart
      history={history}
      minutes={10}
      visible={new Set(visible)}
      onToggle={onToggle}
    />,
  );
  return onToggle;
}

describe('TempChart', () => {
  it('draws one solid line and one target line per visible series', () => {
    const { container } = render(
      <TempChart
        history={history}
        minutes={10}
        visible={new Set(['extruder'])}
        onToggle={vi.fn()}
      />,
    );
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(2);
    expect(paths[0]?.getAttribute('stroke-dasharray')).toBe('4 4');
    expect(paths[1]?.getAttribute('stroke-width')).toBe('2');
  });

  it('draws nothing for series that are toggled off', () => {
    const { container } = render(
      <TempChart history={history} minutes={10} visible={new Set()} onToggle={vi.fn()} />,
    );
    expect(container.querySelectorAll('path')).toHaveLength(0);
  });

  it('lists every series in the legend, including hidden ones', () => {
    renderChart(['extruder']);
    expect(screen.getByRole('button', { name: /Extruder/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /Mcu/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('carries the current value as a visible label, not colour alone', () => {
    renderChart(['extruder', 'heater_bed']);
    // The relief rule: values are readable even where the hue is low-contrast.
    expect(screen.getByRole('button', { name: 'Extruder: 210.0° / 210°' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bett: 60.0° / 60°' })).toBeInTheDocument();
    // A plain sensor has no setpoint to show.
    expect(screen.getByRole('button', { name: 'Mcu: 42.0°' })).toBeInTheDocument();
  });

  it('reports the series a viewer taps in the legend', async () => {
    const onToggle = renderChart(['extruder']);
    await userEvent.click(screen.getByRole('button', { name: /Mcu/ }));
    expect(onToggle).toHaveBeenCalledWith('temperature_sensor mcu');
  });

  it('renders an empty history without crashing', () => {
    const { container } = render(
      <TempChart
        history={{ series: {}, lastSampleAt: 0, length: 0 }}
        minutes={10}
        visible={new Set()}
        onToggle={vi.fn()}
      />,
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
