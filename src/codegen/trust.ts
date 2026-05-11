import { catalog } from '../catalog'
import type { Project } from '../project/schema'

export class DraftCatalogPartError extends Error {
  readonly draftParts: string[]

  constructor(draftParts: string[]) {
    super(`Review draft catalog parts before code generation or hardware use: ${draftParts.join(', ')}`)
    this.name = 'DraftCatalogPartError'
    this.draftParts = draftParts
  }
}

export class MissingCatalogEntryError extends Error {
  readonly missingParts: string[]

  constructor(missingParts: string[]) {
    super(`Project uses unknown catalog parts: ${missingParts.join(', ')}`)
    this.name = 'MissingCatalogEntryError'
    this.missingParts = missingParts
  }
}

export class CatalogTrustError extends Error {
  readonly draftParts: string[]
  readonly missingParts: string[]

  constructor(draftParts: string[], missingParts: string[]) {
    super(`Review draft catalog parts and resolve unknown catalog parts before code generation or hardware use. Draft: ${draftParts.join(', ')}. Missing: ${missingParts.join(', ')}`)
    this.name = 'CatalogTrustError'
    this.draftParts = draftParts
    this.missingParts = missingParts
  }
}

/**
 * Asserts that trusted generation or hardware flows are not using AI-draft parts.
 * @throws {CatalogTrustError} when both ai-draft and missing catalog parts are present.
 * @throws {DraftCatalogPartError} when any project component resolves to a catalog entry whose `catalogMeta.trust` is `ai-draft`.
 * @throws {MissingCatalogEntryError} when any project component points at an unknown catalog entry.
 * Callers should catch this error and route the learner to Catalog Editor review before codegen, build, or flash continues.
 */
export function assertNoDraftCatalogParts(project: Project): void {
  const draftParts: string[] = []
  const missingParts: string[] = []
  for (const component of project.components) {
    const def = catalog.getComponent(component.componentId)
    if (!def) {
      missingParts.push(`${component.instance} (${component.componentId})`)
      continue
    }
    if (def.catalogMeta?.trust === 'ai-draft') draftParts.push(`${component.instance} (${component.componentId})`)
  }
  // Preserve complete learner guidance: aggregate draftParts and missingParts
  // together when both exist, then use the narrower error type for single-cause failures.
  if (draftParts.length > 0 && missingParts.length > 0) throw new CatalogTrustError(draftParts, missingParts)
  if (draftParts.length > 0) throw new DraftCatalogPartError(draftParts)
  if (missingParts.length > 0) throw new MissingCatalogEntryError(missingParts)
}
