// In-memory catalog for M2. Will be replaced by disk-backed loader (~/esp-ai/catalog/) in M9.

import type { ComponentDef, BoardDef, PinDef } from '../project/component'
import type { PinType } from '../project/schema'

const ledRed: ComponentDef = {
  id: 'led-5mm-red',
  name: 'LED 5mm Red',
  version: '0.1.0',
  category: 'actuator',
  model: 'led.glb',
  pins: [
    { id: 'anode',   label: 'A+', type: 'digital_in',
      voltage: { min: 1.8, max: 3.3, nominal: 2.0 },
      position: [-0.0012, -0.005, 0], normal: [0, -1, 0] },
    { id: 'cathode', label: 'K-', type: 'ground',
      position: [ 0.0012, -0.005, 0], normal: [0, -1, 0] }
  ],
  power: { current_ma: 10, rail: '3v3' },
  driver: { language: 'c', defaultPinAssignments: { anode: 'GPIO2' }, includes: ['driver/gpio.h'] },
  schematic: { autoGenerate: true, shape: 'circle' }
}

// Helper to lay out a board pin header along the long edge of the PCB.
// Board placeholder is 55x28mm centered at origin. Headers run along ±Z edges, x from -0.022..+0.022.
function headerPins(side: 'left' | 'right', labels: { id: string; label: string; type: PinType }[]): PinDef[] {
  const z = side === 'left' ? -0.0145 : 0.0145
  const xs = labels.map((_, i) => -0.022 + i * (0.044 / Math.max(labels.length - 1, 1)))
  return labels.map((p, i) => ({
    id: p.id, label: p.label, type: p.type,
    position: [xs[i], 0.006, z],
    normal: [0, 1, 0]
  }))
}

const devkitc: BoardDef = {
  id: 'esp32-devkitc-v4',
  name: 'ESP32-DevKitC v4',
  version: '0.1.0',
  category: 'misc',
  model: 'esp32-devkitc.glb',
  target: 'esp32',
  inputOnlyPins: ['GPIO34', 'GPIO35', 'GPIO36', 'GPIO39'],
  strappingPins: ['GPIO0', 'GPIO2', 'GPIO5', 'GPIO12', 'GPIO15'],
  flashPins: ['GPIO6', 'GPIO7', 'GPIO8', 'GPIO9', 'GPIO10', 'GPIO11'],
  usbPins: [],
  adc1Pins: ['GPIO32', 'GPIO33', 'GPIO34', 'GPIO35', 'GPIO36', 'GPIO39'],
  adc2Pins: ['GPIO0', 'GPIO2', 'GPIO4', 'GPIO12', 'GPIO13', 'GPIO14', 'GPIO15', 'GPIO25', 'GPIO26', 'GPIO27'],
  railBudgetMa: { '3v3': 500 },
  pins: [
    ...headerPins('left', [
      { id: '3v3', label: '3V3', type: 'power_out' },
      { id: 'gnd_l', label: 'GND', type: 'ground' },
      { id: 'gpio15', label: '15', type: 'digital_io' },
      { id: 'gpio2',  label: '2',  type: 'digital_io' },
      { id: 'gpio4',  label: '4',  type: 'digital_io' },
      { id: 'gpio16', label: '16', type: 'digital_io' },
      { id: 'gpio17', label: '17', type: 'digital_io' },
      { id: 'gpio5',  label: '5',  type: 'digital_io' },
      { id: 'gpio18', label: '18', type: 'spi_sck' },
      { id: 'gpio19', label: '19', type: 'spi_miso' },
      { id: 'gpio21', label: '21', type: 'i2c_sda' },
      { id: 'gpio22', label: '22', type: 'i2c_scl' },
      { id: 'gpio23', label: '23', type: 'spi_mosi' }
    ]),
    ...headerPins('right', [
      { id: 'vin', label: 'VIN', type: 'power_in' },
      { id: 'gnd_r', label: 'GND', type: 'ground' },
      { id: 'gpio13', label: '13', type: 'digital_io' },
      { id: 'gpio12', label: '12', type: 'digital_io' },
      { id: 'gpio14', label: '14', type: 'digital_io' },
      { id: 'gpio27', label: '27', type: 'digital_io' },
      { id: 'gpio26', label: '26', type: 'digital_io' },
      { id: 'gpio25', label: '25', type: 'digital_io' },
      { id: 'gpio33', label: '33', type: 'analog_in' },
      { id: 'gpio32', label: '32', type: 'analog_in' },
      { id: 'gpio35', label: '35', type: 'analog_in' },
      { id: 'gpio34', label: '34', type: 'analog_in' },
      { id: 'gpio39', label: '39', type: 'analog_in' }
    ])
  ]
}

const components: Record<string, ComponentDef> = { [ledRed.id]: ledRed }
const boards: Record<string, BoardDef> = { [devkitc.id]: devkitc }
const glbBlobs: Record<string, string> = {}   // componentId -> blob URL

export const catalog = {
  getComponent: (id: string): ComponentDef | undefined => components[id],
  getBoard: (id: string): BoardDef | undefined => boards[id],
  getGlbUrl: (id: string): string | undefined => glbBlobs[id],
  listComponents: (): ComponentDef[] => Object.values(components),
  listBoards: (): BoardDef[] => Object.values(boards),
  registerComponent: (def: ComponentDef, glbData?: Uint8Array | null) => {
    components[def.id] = def
    if (glbData) {
      const buf = glbData.slice().buffer as ArrayBuffer
      glbBlobs[def.id] = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }))
    }
  }
}

// Color a pin anchor by its electrical role.
export function pinColor(type: PinType): string {
  switch (type) {
    default: return '#888'
    case 'power_in':
    case 'power_out': return '#ff3b30'
    case 'ground':    return '#444'
    case 'digital_io':
    case 'digital_in':
    case 'digital_out': return '#5ac8fa'
    case 'analog_in':
    case 'analog_out':  return '#34c759'
    case 'i2c_sda':
    case 'i2c_scl':     return '#ffcc00'
    case 'spi_mosi':
    case 'spi_miso':
    case 'spi_sck':
    case 'spi_cs':      return '#af52de'
    case 'uart_tx':
    case 'uart_rx':     return '#ff9500'
    case 'pwm':         return '#00c7be'
    case 'nc':          return '#222'
  }
}
