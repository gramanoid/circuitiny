import type { PinDef } from '../project/component'

export const twoLeadPins = (spacing = 0.005): PinDef[] => [
  { id: 'pin1', label: '1', type: 'digital_io', position: [-spacing / 2, -0.004, 0], normal: [0, -1, 0] },
  { id: 'pin2', label: '2', type: 'digital_io', position: [spacing / 2, -0.004, 0], normal: [0, -1, 0] },
]

export const ledPins: PinDef[] = [
  { id: 'anode', label: 'A+', type: 'digital_in', position: [-0.00127, -0.005, 0], normal: [0, -1, 0] },
  { id: 'cathode', label: 'K-', type: 'ground', position: [0.00127, -0.005, 0], normal: [0, -1, 0] },
]

export const buttonPins: PinDef[] = [
  { id: 'a', label: 'A', type: 'digital_io', position: [-0.003, -0.004, 0], normal: [0, -1, 0] },
  { id: 'b', label: 'B', type: 'digital_io', position: [0.003, -0.004, 0], normal: [0, -1, 0] },
]

export const threePinModulePins: PinDef[] = [
  { id: 'vcc', label: 'VCC', type: 'power_in', position: [-0.00254, -0.004, 0], normal: [0, -1, 0] },
  { id: 'out', label: 'OUT', type: 'digital_out', position: [0, -0.004, 0], normal: [0, -1, 0] },
  { id: 'gnd', label: 'GND', type: 'ground', position: [0.00254, -0.004, 0], normal: [0, -1, 0] },
]

export const i2cModulePins: PinDef[] = [
  { id: 'vcc', label: 'VCC', type: 'power_in', position: [-0.00381, -0.004, 0], normal: [0, -1, 0] },
  { id: 'gnd', label: 'GND', type: 'ground', position: [-0.00127, -0.004, 0], normal: [0, -1, 0] },
  { id: 'scl', label: 'SCL', type: 'i2c_scl', position: [0.00127, -0.004, 0], normal: [0, -1, 0] },
  { id: 'sda', label: 'SDA', type: 'i2c_sda', position: [0.00381, -0.004, 0], normal: [0, -1, 0] },
]

export const connectorPins = (count: number, pitch = 0.00254): PinDef[] => {
  const offset = (count - 1) / 2
  return Array.from({ length: count }, (_, i) => ({
    id: `pin${i + 1}`,
    label: `${i + 1}`,
    type: 'digital_io' as const,
    position: [(i - offset) * pitch, -0.004, 0] as [number, number, number],
    normal: [0, -1, 0] as [number, number, number],
  }))
}
