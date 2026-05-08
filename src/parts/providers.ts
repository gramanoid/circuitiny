import { candidatesFromDescription, parsePhotoCandidates } from './photoAnalysis'
import { lookupPartKnowledge, lookupPartKnowledgeWithWeb } from './retrieval'
import type { ExaSearchResult, PartKnowledgeRecord, PhotoCandidate } from './types'

export interface LocalCatalogProvider {
  kind: 'local-catalog'
  lookup: (query: string) => PartKnowledgeRecord
}

export interface CuratedPartsProvider {
  kind: 'curated-db'
  lookup: (query: string) => PartKnowledgeRecord
}

export interface ExaPartsProvider {
  kind: 'exa-web'
  search: (query: string) => Promise<ExaSearchResult[]>
  lookup: (query: string) => Promise<PartKnowledgeRecord>
}

export interface PhotoAnalysisProvider {
  kind: 'photo'
  analyzeText: (description: string) => PhotoCandidate[]
  parseVisionResult: (text: string) => PhotoCandidate[]
}

export const localCatalogProvider: LocalCatalogProvider = {
  kind: 'local-catalog',
  lookup: lookupPartKnowledge,
}

export const curatedPartsProvider: CuratedPartsProvider = {
  kind: 'curated-db',
  lookup: lookupPartKnowledge,
}

export function createExaPartsProvider(search: (query: string) => Promise<ExaSearchResult[]>): ExaPartsProvider {
  return {
    kind: 'exa-web',
    search,
    lookup: (query) => lookupPartKnowledgeWithWeb(query, search),
  }
}

export const photoAnalysisProvider: PhotoAnalysisProvider = {
  kind: 'photo',
  analyzeText: candidatesFromDescription,
  parseVisionResult: parsePhotoCandidates,
}
