/** Klipper printer-object shapes and Moonraker response types. */

export type WebhooksObject = {
  state?: 'ready' | 'startup' | 'shutdown' | 'error';
  state_message?: string;
}

export type PrintStatsObject = {
  filename?: string;
  total_duration?: number;
  print_duration?: number;
  filament_used?: number;
  state?: 'standby' | 'printing' | 'paused' | 'complete' | 'cancelled' | 'error';
  message?: string;
  info?: { total_layer_count?: number | null; current_layer?: number | null };
}

export type DisplayStatusObject = {
  progress?: number;
  message?: string | null;
}

export type VirtualSdcardObject = {
  progress?: number;
  file_position?: number;
  file_size?: number;
  file_path?: string | null;
  is_active?: boolean;
}

export type ToolheadObject = {
  position?: [number, number, number, number];
  homed_axes?: string;
  axis_minimum?: [number, number, number, number];
  axis_maximum?: [number, number, number, number];
  extruder?: string;
  max_velocity?: number;
  max_accel?: number;
  max_accel_to_decel?: number;
  square_corner_velocity?: number;
  estimated_print_time?: number;
  print_time?: number;
}

export type GcodeMoveObject = {
  speed_factor?: number;
  extrude_factor?: number;
  speed?: number;
  absolute_coordinates?: boolean;
  absolute_extrude?: boolean;
  homing_origin?: [number, number, number, number];
  position?: [number, number, number, number];
  gcode_position?: [number, number, number, number];
}

export type HeaterObject = {
  temperature?: number;
  target?: number;
  power?: number;
  can_extrude?: boolean;
  pressure_advance?: number;
  smooth_time?: number;
}

export type TemperatureSensorObject = {
  temperature?: number;
  measured_min_temp?: number;
  measured_max_temp?: number;
}

export type TemperatureFanObject = {
  temperature?: number;
  target?: number;
  speed?: number;
  rpm?: number | null;
}

export type FanObject = {
  speed?: number;
  rpm?: number | null;
}

export type OutputPinObject = {
  value?: number;
}

export type McuObject = {
  mcu_version?: string;
  mcu_constants?: Record<string, unknown>;
  last_stats?: Record<string, number>;
}

export type ConfigFileObject = {
  config?: Record<string, Record<string, string>>;
  settings?: Record<string, Record<string, unknown>>;
  save_config_pending?: boolean;
  save_config_pending_items?: Record<string, Record<string, unknown>>;
  warnings?: Array<Record<string, string>>;
  file_config?: Record<string, Record<string, string>>;
}

export type BedMeshObject = {
  profile_name?: string;
  mesh_min?: [number, number];
  mesh_max?: [number, number];
  probed_matrix?: number[][];
  mesh_matrix?: number[][];
  profiles?: Record<string, unknown>;
}

export type ExcludeObjectObject = {
  objects?: Array<{ name: string; center?: number[]; polygon?: number[][] }>;
  excluded_objects?: string[];
  current_object?: string | null;
}

export type FilamentSensorObject = {
  filament_detected?: boolean;
  enabled?: boolean;
}

export type IdleTimeoutObject = {
  state?: 'Idle' | 'Printing' | 'Ready';
  printing_time?: number;
}

export type MotionReportObject = {
  live_position?: [number, number, number, number];
  live_velocity?: number;
  live_extruder_velocity?: number;
}

export type PauseResumeObject = {
  is_paused?: boolean;
}

/** Active during PROBE_CALIBRATE, Z_ENDSTOP_CALIBRATE and other manual probing. */
export type ManualProbeObject = {
  is_active?: boolean;
  z_position?: number | null;
  z_position_lower?: number | null;
  z_position_upper?: number | null;
}

export type BedScrewsObject = {
  is_active?: boolean;
  state?: 'adjust' | 'fine' | null;
  current_screw?: number;
  accepted_screws?: number;
}

export type ScrewsTiltAdjustObject = {
  error?: boolean;
  max_deviation?: number | null;
  results?: Record<string, { z: number; sign: 'CW' | 'CCW'; adjust: string; is_base: boolean }>;
}

export type FirmwareRetractionObject = {
  retract_length?: number;
  retract_speed?: number;
  unretract_extra_length?: number;
  unretract_speed?: number;
}

/**
 * Flat map of every subscribed printer object, keyed exactly as Klipper names
 * them ("heater_bed", "temperature_sensor raspberry_pi", ...). Known objects are
 * typed; dynamic ones fall back to a record.
 */
export interface PrinterStatus {
  webhooks?: WebhooksObject;
  print_stats?: PrintStatsObject;
  display_status?: DisplayStatusObject;
  virtual_sdcard?: VirtualSdcardObject;
  toolhead?: ToolheadObject;
  gcode_move?: GcodeMoveObject;
  extruder?: HeaterObject;
  heater_bed?: HeaterObject;
  fan?: FanObject;
  configfile?: ConfigFileObject;
  bed_mesh?: BedMeshObject;
  exclude_object?: ExcludeObjectObject;
  idle_timeout?: IdleTimeoutObject;
  motion_report?: MotionReportObject;
  pause_resume?: PauseResumeObject;
  mcu?: McuObject;
  manual_probe?: ManualProbeObject;
  bed_screws?: BedScrewsObject;
  screws_tilt_adjust?: ScrewsTiltAdjustObject;
  firmware_retraction?: FirmwareRetractionObject;
  [key: string]: Record<string, unknown> | undefined;
}

export type KlippyState = 'ready' | 'startup' | 'shutdown' | 'error' | 'disconnected';

export interface ServerInfo {
  klippy_connected: boolean;
  klippy_state: KlippyState;
  components: string[];
  failed_components?: string[];
  registered_directories?: string[];
  warnings?: string[];
  websocket_count?: number;
  moonraker_version?: string;
  api_version?: number[];
  api_version_string?: string;
}

export interface PrinterInfo {
  state: string;
  state_message: string;
  hostname: string;
  software_version: string;
  cpu_info?: string;
  klipper_path?: string;
  config_file?: string;
}

export interface FileEntry {
  path: string;
  modified: number;
  size: number;
  permissions?: string;
}

export interface DirectoryFile {
  filename: string;
  modified: number;
  size: number;
  permissions?: string;
  /** Present when `extended: true` was requested for the gcodes root. */
  estimated_time?: number;
  filament_total?: number;
  filament_weight_total?: number;
  object_height?: number;
  layer_height?: number;
  first_layer_height?: number;
  slicer?: string;
  slicer_version?: string;
  thumbnails?: GcodeThumbnail[];
  print_start_time?: number | null;
  job_id?: string | null;
  gcode_start_byte?: number;
  gcode_end_byte?: number;
  nozzle_diameter?: number;
  filament_name?: string;
  filament_type?: string;
  first_layer_extr_temp?: number;
  first_layer_bed_temp?: number;
  chamber_temp?: number;
}

export interface DirectoryDir {
  dirname: string;
  modified: number;
  size: number;
  permissions?: string;
}

export interface DirectoryInfo {
  dirs: DirectoryDir[];
  files: DirectoryFile[];
  disk_usage?: { total: number; used: number; free: number };
  root_info?: { name: string; permissions: string };
}

export interface GcodeThumbnail {
  width: number;
  height: number;
  size: number;
  relative_path: string;
}

export interface GcodeMetadata extends DirectoryFile {
  filename: string;
}

export interface HistoryJob {
  job_id: string;
  filename: string;
  status: string;
  start_time: number;
  end_time: number | null;
  print_duration: number;
  total_duration: number;
  filament_used: number;
  exists: boolean;
  metadata?: Partial<GcodeMetadata>;
}

export interface HistoryTotals {
  total_jobs: number;
  total_time: number;
  total_print_time: number;
  total_filament_used: number;
  longest_job: number;
  longest_print: number;
}

export interface TemperatureStoreEntry {
  temperatures: number[];
  targets?: number[];
  powers?: number[];
  speeds?: number[];
}

export type TemperatureStore = Record<string, TemperatureStoreEntry>;

export interface GcodeStoreEntry {
  message: string;
  time: number;
  type: 'command' | 'response';
}

export interface WebcamConfig {
  name: string;
  location?: string;
  service?: string;
  enabled?: boolean;
  icon?: string;
  target_fps?: number;
  target_fps_idle?: number;
  stream_url: string;
  snapshot_url: string;
  flip_horizontal?: boolean;
  flip_vertical?: boolean;
  rotation?: 0 | 90 | 180 | 270;
  aspect_ratio?: string;
  uid?: string;
  source?: string;
}

export interface SystemInfo {
  cpu_info?: Record<string, unknown>;
  distribution?: Record<string, unknown>;
  network?: Record<string, unknown>;
  virtualization?: Record<string, unknown>;
  available_services?: string[];
  service_state?: Record<string, { active_state: string; sub_state: string }>;
}

export interface ProcStats {
  moonraker_stats?: Array<{ time: number; cpu_usage: number; memory: number; mem_units: string }>;
  cpu_temp?: number | null;
  network?: Record<string, { rx_bytes: number; tx_bytes: number; bandwidth: number }>;
  system_cpu_usage?: Record<string, number>;
  system_memory?: { total: number; available: number; used: number };
  system_uptime?: number;
  websocket_connections?: number;
  throttled_state?: { bits: number; flags: string[] } | null;
}

export interface PowerDevice {
  device: string;
  status: 'on' | 'off' | 'init' | 'error';
  locked_while_printing?: boolean;
  type?: string;
}

export interface UpdateComponent {
  name?: string;
  configured_type?: string;
  version?: string;
  remote_version?: string;
  full_version_string?: string;
  is_dirty?: boolean;
  is_valid?: boolean;
  corrupt?: boolean;
  commits_behind?: unknown[];
  commits_behind_count?: number;
  package_count?: number;
  package_list?: string[];
}

export interface UpdateStatus {
  busy?: boolean;
  github_rate_limit?: number | null;
  version_info: Record<string, UpdateComponent>;
}
