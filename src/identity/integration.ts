import type { PinType } from '../project/schema'
import { isTrustedIdentity, type PartIdentity, type ExtractedPin } from './datasheets'

export interface TrustedIdentityPin {
  id: string
  label: string
  type: PinType
}

export interface IdentityDrcMetadata {
  trusted: boolean
  voltageRange?: { min: number; max: number }
  currentMa?: { max: number }
  pins: TrustedIdentityPin[]
  warnings: string[]
}

export interface IdentityCodegenMetadata {
  trusted: boolean
  protocol?: string
  pins: TrustedIdentityPin[]
}

export interface IdentityRenderFingerprint {
  trusted: boolean
  label: string
  detectedPins: string[]
  voltageLabel: string | null
  voltageReviewed: boolean
  confidence: PartIdentity['confidence']
}

export interface IdentityRealityFingerprint {
  trusted: boolean
  expectedMarkings: string[]
  expectedPinLabels: string[]
  caution: string[]
}

export function identityDrcMetadata(identity: PartIdentity): IdentityDrcMetadata {
  const trusted = isTrustedIdentity(identity)
  const pins = trusted ? trustedPins(identity) : []
  const trustedVoltage = identity.extraction.voltageRange?.state === 'reviewed'
    ? { min: identity.extraction.voltageRange.min, max: identity.extraction.voltageRange.max }
    : undefined
  const trustedCurrent = identity.extraction.currentMa?.state === 'reviewed'
    ? { max: identity.extraction.currentMa.max }
    : undefined
  return {
    trusted,
    pins,
    ...(trusted && trustedVoltage ? { voltageRange: trustedVoltage } : {}),
    ...(trusted && trustedCurrent ? { currentMa: trustedCurrent } : {}),
    warnings: trusted ? identity.extraction.warnings : [],
  }
}

export function identityCodegenMetadata(identity: PartIdentity): IdentityCodegenMetadata {
  const trusted = isTrustedIdentity(identity)
  const protocol = identity.extraction.protocol?.state === 'reviewed'
    ? identity.extraction.protocol.value
    : undefined
  return {
    trusted,
    pins: trusted ? trustedPins(identity) : [],
    ...(trusted && protocol ? { protocol } : {}),
  }
}

export function identityRenderFingerprint(identity: PartIdentity): IdentityRenderFingerprint {
  const voltage = identity.extraction.voltageRange
  const voltageReviewed = voltage?.state === 'reviewed'
  return {
    trusted: isTrustedIdentity(identity),
    label: identity.knowledge.label,
    // Rendering shows all detected pins; DRC/codegen trust gates must use identityDrcMetadata/identityCodegenMetadata.
    detectedPins: identity.extraction.pins.map((pin) => pin.label),
    voltageLabel: voltageReviewed && voltage ? `${voltage.min}-${voltage.max} V` : null,
    voltageReviewed,
    confidence: identity.confidence,
  }
}

export function identityRealityFingerprint(identity: PartIdentity): IdentityRealityFingerprint {
  return {
    trusted: isTrustedIdentity(identity),
    expectedMarkings: [
      identity.knowledge.label,
      identity.id,
    ],
    expectedPinLabels: identity.extraction.pins.map((pin) => pin.label),
    caution: identity.reviewRequired ? ['Confirm markings, orientation, and pin labels before powering hardware.'] : [],
  }
}

function trustedPins(identity: PartIdentity): TrustedIdentityPin[] {
  return identity.extraction.pins
    .filter((pin) => pin.state === 'reviewed')
    .map(pinToTrusted)
}

function pinToTrusted(pin: ExtractedPin): TrustedIdentityPin {
  return {
    id: pin.id,
    label: pin.label,
    type: pin.type,
  }
}
