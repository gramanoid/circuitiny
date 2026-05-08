import type { Violation } from '../drc'

export interface BeginnerDrcExplanation {
  title: string
  meaning: string
  physicalRisk: string
  nextAction: string
}

const EXPLANATIONS: Record<string, BeginnerDrcExplanation> = {
  'gpio.input_only': {
    title: 'This pin cannot drive an output',
    meaning: 'Some ESP32 pins can read signals but cannot send power or digital output to a part.',
    physicalRisk: 'The circuit will not behave as expected because the chip cannot drive the component from that pin.',
    nextAction: 'Move this wire to a normal digital GPIO suggested by Circuitiny.',
  },
  'gpio.flash_pin': {
    title: 'This pin is reserved inside the ESP32',
    meaning: 'GPIO6 through GPIO11 are wired to the flash memory chip on many ESP32 boards.',
    physicalRisk: 'Using these pins can stop the board from booting or make firmware flashing fail.',
    nextAction: 'Move the wire to a safe GPIO and leave flash pins unused.',
  },
  'electrical.voltage_mismatch': {
    title: 'A 5V line is touching a 3.3V GPIO',
    meaning: 'ESP32 GPIO pins are designed for 3.3V signals, not 5V.',
    physicalRisk: 'A direct 5V signal can permanently damage the ESP32 pin or the whole board.',
    nextAction: 'Remove this wire and use 3V3 for power, or add a level shifter for real 5V signals.',
  },
  'electrical.short': {
    title: 'Power is shorted to ground',
    meaning: 'The circuit directly connects a power rail to GND.',
    physicalRisk: 'A short can heat parts, reset the board, damage USB ports, or destroy components.',
    nextAction: 'Delete the shorted wire before simulating or flashing hardware.',
  },
  'wiring.dangling': {
    title: 'A wire has only one end',
    meaning: 'One side of the connection is not attached to anything useful yet.',
    physicalRisk: 'The circuit may not work because the signal has no complete path.',
    nextAction: 'Connect the other end of the wire or delete the dangling net.',
  },
  'gpio.strapping': {
    title: 'This pin affects boot mode',
    meaning: 'Strapping pins are checked when the ESP32 powers on to decide how it should boot.',
    physicalRisk: 'A component pulling this pin the wrong way can keep the board from starting normally.',
    nextAction: 'Use a safer GPIO unless you know this boot behavior is intentional.',
  },
  'led.no_resistor': {
    title: 'The LED needs a resistor',
    meaning: 'A resistor limits current so the LED and GPIO only receive a safe amount.',
    physicalRisk: 'Without a resistor, too much current can damage the LED or ESP32 pin.',
    nextAction: 'Add a 220 ohm resistor in series between the GPIO and LED anode.',
  },
  'led.resistor_too_low': {
    title: 'The LED resistor is too small',
    meaning: 'A very low resistor allows too much current through the LED.',
    physicalRisk: 'The LED may be too bright, heat up, fail early, or stress the GPIO pin.',
    nextAction: 'Use a larger resistor, such as 220 ohm for a first red LED circuit.',
  },
  'electrical.current_budget': {
    title: 'The 3.3V rail may be overloaded',
    meaning: 'Every powered component draws current from the board power rail.',
    physicalRisk: 'Too much current can cause resets, unstable behavior, or overheated regulators.',
    nextAction: 'Use fewer parts, lower-power parts, or an external power supply with shared ground.',
  },
  'i2s.direction': {
    title: 'An audio signal direction does not match',
    meaning: 'I2S pins have specific directions: clock, word select, data in, and data out.',
    physicalRisk: 'The audio part will not communicate correctly if signal directions are swapped.',
    nextAction: 'Reconnect the I2S pins according to the component pin labels.',
  },
}

export function explainViolation(v: Violation): BeginnerDrcExplanation {
  return EXPLANATIONS[v.id] ?? {
    title: 'Circuit check needs attention',
    meaning: v.message,
    physicalRisk: 'The circuit may not behave as expected until this is understood.',
    nextAction: v.fixHint?.suggestion ?? 'Review the highlighted pins and adjust the wiring.',
  }
}

export function summarizeViolationsForLearner(violations: Violation[], limit = 4): string[] {
  return violations.slice(0, limit).map((v) => {
    const explanation = explainViolation(v)
    return `${v.severity.toUpperCase()}: ${explanation.title} - ${explanation.nextAction}`
  })
}
