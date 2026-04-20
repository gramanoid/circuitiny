export {}

declare global {
  interface Window {
    espAI: {
      pickGlb: () => Promise<{ path: string; data: Uint8Array } | null>
      pickComponent: () => Promise<{ jsonPath: string; json: string; glbData: Uint8Array | null; glbName: string | null } | null>
      writeBundle: (id: string, glbName: string, glbData: Uint8Array, jsonText: string) => Promise<string>
      listCatalog: () => Promise<Array<{ id: string; json: any; glbData: Uint8Array | null }>>
    }
  }
}
