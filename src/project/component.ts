// Catalog component definition (component.json sidecar to a .glb).

import type { PinType } from './schema'

export interface PinDef {
  id: string
  label: string
  type: PinType
  protocol?: '1wire' | 'i2c' | 'spi' | 'uart'
  voltage?: { min: number; max: number; nominal: number }
  pull?: 'none' | 'up_required' | 'down_required'
  position: [number, number, number]   // meters, in GLB local frame
  normal: [number, number, number]     // wire exit direction
}

export interface DriverDef {
  language: 'c'
  idfComponent?: string
  defaultPinAssignments?: Record<string, string>
  initSnippet?: string                  // template path
  readSnippet?: string
  includes?: string[]
  cmakeRequires?: string[]
}

export interface ComponentDef {
  id: string
  name: string
  version: string
  category: 'sensor' | 'actuator' | 'display' | 'input' | 'power' | 'misc'
  model: string                         // .glb path relative to component dir
  scale?: number
  anchor?: [number, number, number]
  pins: PinDef[]
  power?: { current_ma: number; rail: '3v3' | '5v' | 'vin' }
  driver?: DriverDef
  schematic?: { autoGenerate: boolean; shape?: 'rectangle' | 'circle'; labelPosition?: 'top' | 'bottom' | 'left' | 'right' }
  docs?: { datasheetUrl?: string; notes?: string }
  idfVersion?: string                   // e.g. ">=5.0"
}

// Boards are components with extra MCU metadata.
export interface BoardDef extends ComponentDef {
  target: 'esp32' | 'esp32s3' | 'esp32c3'
  inputOnlyPins: string[]
  strappingPins: string[]
  flashPins: string[]
  usbPins: string[]
  adc1Pins: string[]
  adc2Pins: string[]
  pwmCapablePins?: string[]
  railBudgetMa: { '3v3': number; '5v'?: number }
}
