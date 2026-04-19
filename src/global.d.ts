export {}

declare global {
  interface Window {
    espAI: {
      pickGlb: () => Promise<{ path: string; data: Uint8Array } | null>
      writeJson: (filename: string, content: string) => Promise<string>
    }
  }
}
