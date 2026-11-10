import { useMemo, useState } from 'react';
import { Grid3x3, Play, Save, Table2, Trash2, Upload } from 'lucide-react';
import { Badge, Button, Card, SegmentedControl, TextInput } from '@/components/ui';
import {
  divergingColor,
  flatnessVerdict,
  getMeshView,
  meshProfiles,
  type MeshPoint,
  type MeshView,
} from '@/lib/bedMesh';
import { getHomedAxes, isPrinting } from '@/lib/derive';
import { bedMeshProfile } from '@/lib/gcode';
import { useResolvedTheme } from '@/lib/useTheme';
import { confirmAction } from '@/store/confirm';
import { usePrinterStore } from '@/store/printer';

type Source = 'probed' | 'mesh';
const SOURCES: Source[] = ['probed', 'mesh'];
const SOURCE_LABELS: Record<Source, string> = { probed: 'Gemessen', mesh: 'Interpoliert' };

function signed(z: number, digits = 3): string {
  return `${z > 0 ? '+' : z < 0 ? '−' : '±'}${Math.abs(z).toFixed(digits)}`;
}

export function BedMeshCard() {
  const mesh = usePrinterStore((s) => s.status.bed_mesh);
  const status = usePrinterStore((s) => s.status);
  const sendGcode = usePrinterStore((s) => s.sendGcode);
  const theme = useResolvedTheme();
  const [source, setSource] = useState<Source>('probed');
  const [asTable, setAsTable] = useState(false);
  const [active, setActive] = useState<MeshPoint | null>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const view = useMemo(() => getMeshView(mesh, source), [mesh, source]);
  const profiles = meshProfiles(mesh);
  const loaded = mesh?.profile_name || null;
  const printing = isPrinting(status);
  const homed = getHomedAxes(status);

  const calibrate = async () => {
    const ok = await confirmAction({
      title: 'Bett vermessen?',
      message:
        'BED_MESH_CALIBRATE tastet das Bett ab und speichert das Ergebnis als Profil „default". Am genauesten bei Drucktemperatur des Betts.',
      confirmLabel: 'Messen',
      tone: 'accent',
    });
    if (!ok) return;
    setBusy(true);
    const allHomed = homed.x && homed.y && homed.z;
    await sendGcode(`${allHomed ? '' : 'G28\n'}BED_MESH_CALIBRATE`);
    setBusy(false);
  };

  const removeProfile = async (name: string) => {
    const ok = await confirmAction({
      title: `Profil „${name}" löschen?`,
      message: 'Wird mit dem nächsten SAVE_CONFIG aus der printer.cfg entfernt.',
      confirmLabel: 'Löschen',
    });
    if (ok) void sendGcode(bedMeshProfile('REMOVE', name));
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Grid3x3 className="size-4 text-muted" /> Bed Mesh
        </span>
      }
      action={
        <Button size="sm" tone="accent" onClick={() => void calibrate()} disabled={printing || busy}>
          <Play className="size-3.5" /> {busy ? 'Misst …' : 'Messen'}
        </Button>
      }
    >
      {view ? (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-[11px] text-muted">Spannweite</p>
              <p className="tabular text-2xl font-semibold leading-tight">
                {view.range.toFixed(3)} <span className="text-sm font-normal text-muted">mm</span>
              </p>
            </div>
            <VerdictBadge range={view.range} />
          </div>

          <div className="flex gap-2">
            <SegmentedControl
              options={SOURCES}
              value={source}
              onChange={(s) => {
                setSource(s);
                setActive(null);
              }}
              formatLabel={(s) => SOURCE_LABELS[s]}
              className="flex-1"
            />
            <Button
              size="sm"
              tone={asTable ? 'accent' : 'default'}
              aria-pressed={asTable}
              aria-label="Als Tabelle"
              onClick={() => setAsTable((v) => !v)}
            >
              <Table2 className="size-3.5" />
            </Button>
          </div>

          {asTable ? (
            <MeshTable view={view} />
          ) : (
            <>
              <p className="tabular h-4 text-center text-xs text-muted" aria-live="polite">
                {active
                  ? `X ${active.x.toFixed(1)} · Y ${active.y.toFixed(1)} → ${signed(active.z)} mm`
                  : 'Feld antippen für den Messwert'}
              </p>
              <Heatmap view={view} theme={theme} active={active} onActive={setActive} />
              <Legend maxAbs={view.maxAbs} theme={theme} />
            </>
          )}

          <dl className="grid grid-cols-2 gap-x-4 text-xs tabular">
            {[
              ['Tiefster Punkt', view.min],
              ['Höchster Punkt', view.max],
            ].map(([label, p]) => {
              const point = p as MeshPoint;
              return (
                <div key={label as string}>
                  <dt className="text-muted">{label as string}</dt>
                  <dd>
                    {signed(point.z)} mm
                    <span className="ml-1 text-muted">
                      X{point.x.toFixed(0)} Y{point.y.toFixed(0)}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Kein Mesh geladen. „Messen" tastet das Bett ab, oder lade unten ein gespeichertes Profil.
        </p>
      )}

      <div className="mt-4 space-y-2 border-t border-line pt-3">
        <p className="text-xs font-medium text-muted">Profile</p>
        {profiles.length ? (
          <ul className="divide-y divide-line">
            {profiles.map((name) => (
              <li key={name} className="flex items-center gap-2 py-1.5">
                <span className="flex-1 truncate font-mono text-xs">{name}</span>
                {loaded === name && <Badge tone="accent">geladen</Badge>}
                <Button
                  size="sm"
                  onClick={() => void sendGcode(bedMeshProfile('LOAD', name))}
                  disabled={loaded === name}
                  aria-label={`${name} laden`}
                >
                  <Upload className="size-3.5" />
                </Button>
                <Button size="sm" tone="ghost" onClick={() => void removeProfile(name)} aria-label={`${name} löschen`}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-muted">Noch keine Profile gespeichert.</p>
        )}
        {view && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              void sendGcode(bedMeshProfile('SAVE', newName));
              setNewName('');
            }}
          >
            <TextInput
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Aktuelles Mesh speichern als …"
              autoCapitalize="none"
            />
            <Button type="submit" size="sm" disabled={!newName.trim()} aria-label="Profil speichern">
              <Save className="size-3.5" />
            </Button>
          </form>
        )}
        {view && (
          <Button block size="sm" tone="ghost" onClick={() => void sendGcode('BED_MESH_CLEAR')}>
            Mesh deaktivieren (BED_MESH_CLEAR)
          </Button>
        )}
      </div>
    </Card>
  );
}

function VerdictBadge({ range }: { range: number }) {
  const verdict = flatnessVerdict(range);
  if (verdict === 'gut') return <Badge tone="ok">✓ sehr eben</Badge>;
  if (verdict === 'ok') return <Badge tone="warn">≈ das Mesh gleicht das aus</Badge>;
  return <Badge tone="danger">! Bett nachjustieren</Badge>;
}

function Heatmap({
  view,
  theme,
  active,
  onActive,
}: {
  view: MeshView;
  theme: 'light' | 'dark';
  active: MeshPoint | null;
  onActive: (point: MeshPoint) => void;
}) {
  const rows = view.rows.length;
  const cols = view.rows[0]!.length;
  const spanX = (view.xs.at(-1)! - view.xs[0]!) || 1;
  const spanY = (view.ys.at(-1)! - view.ys[0]!) || 1;
  const width = 300;
  const height = Math.round(width * Math.min(1.5, Math.max(0.5, spanY / spanX)));
  const cw = width / cols;
  const ch = height / rows;

  return (
    <div>
      <div className="mb-1 text-center text-[10px] uppercase tracking-wide text-muted">hinten</div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full touch-manipulation"
        role="img"
        aria-label={`Bed Mesh ${cols}×${rows}, Spannweite ${view.range.toFixed(3)} mm`}
      >
        {view.rows.map((row, r) =>
          row.map((z, c) => {
            const point: MeshPoint = { x: view.xs[c]!, y: view.ys[r]!, z, row: r, col: c };
            // Row 0 is the front of the bed, drawn at the bottom.
            const y = height - (r + 1) * ch;
            const isActive = active?.row === r && active?.col === c;
            return (
              <rect
                key={`${r}-${c}`}
                x={c * cw}
                y={y}
                width={cw}
                height={ch}
                rx={2}
                fill={divergingColor(z, view.maxAbs, theme)}
                stroke={isActive ? 'var(--color-ink)' : 'var(--color-surface)'}
                strokeWidth={isActive ? 2.5 : 2}
                vectorEffect="non-scaling-stroke"
                onPointerEnter={() => onActive(point)}
                onClick={() => onActive(point)}
                className="cursor-pointer"
              >
                <title>{`X ${point.x.toFixed(1)} Y ${point.y.toFixed(1)}: ${signed(z)} mm`}</title>
              </rect>
            );
          }),
        )}
        {[view.min, view.max].map((p, i) => (
          <circle
            key={i}
            cx={p.col * cw + cw / 2}
            cy={height - p.row * ch - ch / 2}
            r={Math.min(cw, ch) * 0.18}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ))}
      </svg>
      <div className="mt-1 text-center text-[10px] uppercase tracking-wide text-muted">vorne</div>
    </div>
  );
}

function Legend({ maxAbs, theme }: { maxAbs: number; theme: 'light' | 'dark' }) {
  const stops = [-1, -0.5, 0, 0.5, 1].map((t) => divergingColor(t * maxAbs, maxAbs, theme));
  return (
    <div className="space-y-1">
      <div
        className="h-2 rounded-full"
        style={{ background: `linear-gradient(to right, ${stops.join(', ')})` }}
        aria-hidden
      />
      <div className="flex justify-between text-[11px] text-muted tabular">
        <span>{signed(-maxAbs, 2)} tiefer</span>
        <span>0</span>
        <span>höher {signed(maxAbs, 2)}</span>
      </div>
    </div>
  );
}

function MeshTable({ view }: { view: MeshView }) {
  // Back row first, matching the heatmap orientation.
  const ordered = [...view.rows.map((row, r) => ({ row, y: view.ys[r]! }))].reverse();
  return (
    <div className="overflow-x-auto no-scrollbar">
      <table className="w-full border-separate border-spacing-0 font-mono text-[10px] tabular">
        <thead>
          <tr>
            <th className="px-1 py-0.5 text-left font-normal text-muted">Y \ X</th>
            {view.xs.map((x) => (
              <th key={x} className="px-1 py-0.5 text-right font-normal text-muted">
                {x.toFixed(0)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map(({ row, y }) => (
            <tr key={y}>
              <th className="px-1 py-0.5 text-left font-normal text-muted">{y.toFixed(0)}</th>
              {row.map((z, c) => (
                <td key={c} className="px-1 py-0.5 text-right text-ink">
                  {z.toFixed(3)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
