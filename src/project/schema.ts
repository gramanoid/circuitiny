// project.json — single source of truth.
// IR (resolved buses, etc.) is derived from this in ir.ts.

export type Target = 'esp32' | 'esp32s2' | 'esp32s3' | 'esp32c3' | 'esp32c6' | 'esp32h2'

export type PinType =
  | 'power_in' | 'power_out' | 'ground'
  | 'digital_io' | 'digital_in' | 'digital_out'
  | 'analog_in' | 'analog_out'
  | 'i2c_sda' | 'i2c_scl'
  | 'spi_mosi' | 'spi_miso' | 'spi_sck' | 'spi_cs'
  | 'uart_tx' | 'uart_rx'
  | 'pwm' | 'nc'

export interface ComponentInstance {
  instance: string             // unique id within project, e.g. "temp1"
  componentId: string          // catalog id, e.g. "dht22"
  position?: [number, number, number]
  rotation?: [number, number, number]
  pinAssignments: Record<string, string>  // local pin id -> board GPIO label, e.g. { data: "GPIO4" }
  config?: Record<string, unknown>
  internalPullups?: Record<string, boolean> // pin id -> enable internal pullup
}

export interface Net {
  id: string
  endpoints: string[]          // ["temp1.data", "board.GPIO4"]
}

export type TriggerKind =
  | { type: 'sensor_threshold'; source: string; op: '>' | '<' | '>=' | '<=' | '=='; value: number }
  | { type: 'gpio_edge'; source: string; edge: 'rising' | 'falling' | 'both' }
  | { type: 'timer'; period_ms: number }
  | { type: 'mqtt_received'; topic: string }
  | { type: 'http_request'; method: 'GET' | 'POST'; path: string }
  | { type: 'boot' }
  | { type: 'wifi_connected' }

export type Action =
  | { type: 'set_output'; target: string; value: 'on' | 'off' }
  | { type: 'toggle'; target: string }
  | { type: 'read_sensor'; target: string; into: string }
  | { type: 'mqtt_publish'; topic: string; payload: string }
  | { type: 'http_get'; url: string; into?: string }
  | { type: 'http_post'; url: string; body: string }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'delay'; ms: number }
  | { type: 'sequence'; actions: Action[] }
  | { type: 'if'; cond: string; then: Action[]; else?: Action[] }
  | { type: 'call_user_fn'; name: string }

export interface Behavior {
  id: string
  trigger: TriggerKind
  debounce_ms?: number
  actions: Action[]
}

export interface AppConfig {
  wifi: { enabled: boolean; ssid?: string }   // password is in secrets store, not here
  mqtt?: { enabled: boolean; host: string; port: number; clientId?: string }
  http?: { client: boolean; server: boolean; serverPort?: number }
  log_level: 'verbose' | 'debug' | 'info' | 'warn' | 'error'
}

export interface Project {
  schemaVersion: 1
  name: string
  target: Target
  board: string                // catalog id, e.g. "esp32-devkitc-v4"
  components: ComponentInstance[]
  nets: Net[]
  behaviors: Behavior[]
  app: AppConfig
  drcOverrides?: string[]      // warning ids the user has dismissed
}

export const emptyProject = (
  name: string,
  boardId: string = 'esp32-devkitc-v4',
  target: Target = 'esp32'
): Project => ({
  schemaVersion: 1,
  name,
  target,
  board: boardId,
  components: [],
  nets: [],
  behaviors: [],
  app: { wifi: { enabled: false }, log_level: 'info' }
})
