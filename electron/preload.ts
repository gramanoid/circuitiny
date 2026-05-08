import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

export interface IdfLogEvent { runId: string; stream: 'stdout' | 'stderr'; text: string }
export interface IdfExitEvent { runId: string; code: number | null; signal: string | null }
export interface PartsPhoto { path: string; name: string; dataUrl: string }
export interface ExaPartSearchResult { title: string; url: string; highlights: string[]; publishedDate?: string; retrievedAt?: string }
export interface ModelInstallRequest { asset: unknown; componentJson: string; approved: boolean }
export interface ModelInstallResult {
  ok: boolean
  componentJson?: string
  modelName?: string
  modelData?: Uint8Array
  savedTo?: string
  conversionStatus?: string
  conversionLog?: string[]
  error?: string
}

const api = {
  pickGlb: (): Promise<{ path: string; data: Uint8Array } | null> =>
    ipcRenderer.invoke('pickGlb'),
  pickComponent: (): Promise<{ jsonPath: string; json: string; glbData: Uint8Array | null; glbName: string | null } | null> =>
    ipcRenderer.invoke('pickComponent'),
  writeBundle: (id: string, glbName: string, glbData: Uint8Array, jsonText: string): Promise<string> =>
    ipcRenderer.invoke('writeBundle', id, glbName, glbData, jsonText),
  writeComponentJson: (id: string, jsonText: string): Promise<string> =>
    ipcRenderer.invoke('writeComponentJson', id, jsonText),
  listCatalog: (): Promise<Array<{ id: string; json: any; glbData: Uint8Array | null }>> =>
    ipcRenderer.invoke('listCatalog'),
  installModelAsset: (request: ModelInstallRequest): Promise<ModelInstallResult> =>
    ipcRenderer.invoke('installModelAsset', request),

  saveProject: (project: unknown, suggestedName: string, existingPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('saveProject', project, suggestedName, existingPath),
  openProject: (): Promise<{ project: unknown; path: string } | null> =>
    ipcRenderer.invoke('openProject'),
  projectWrite: (name: string, target: string, files: Record<string, string>): Promise<{ dir: string; target: string }> =>
    ipcRenderer.invoke('projectWrite', name, target, files),
  listSerialPorts: (): Promise<string[]> =>
    ipcRenderer.invoke('listSerialPorts'),
  idfStart: (opts: { name: string; target: string; op: 'build' | 'flash' | 'monitor' | 'clean'; port?: string }):
    Promise<{ runId: string; cwd: string; cmd: string }> =>
    ipcRenderer.invoke('idfStart', opts),
  idfStop: (runId: string): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke('idfStop', runId),
  onIdfLog: (cb: (e: IdfLogEvent) => void) => {
    const fn = (_: IpcRendererEvent, e: IdfLogEvent) => cb(e)
    ipcRenderer.on('idf:log', fn)
    return () => ipcRenderer.removeListener('idf:log', fn)
  },
  onIdfExit: (cb: (e: IdfExitEvent) => void) => {
    const fn = (_: IpcRendererEvent, e: IdfExitEvent) => cb(e)
    ipcRenderer.on('idf:exit', fn)
    return () => ipcRenderer.removeListener('idf:exit', fn)
  },

  simCompile: (name: string, appMainC: string): Promise<{ ok: boolean; binaryPath?: string; error?: string }> =>
    ipcRenderer.invoke('simCompile', name, appMainC),
  simStart: (binaryPath: string): Promise<{ runId: string }> =>
    ipcRenderer.invoke('simStart', binaryPath),
  simStop: (runId: string): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke('idfStop', runId),
  simInject: (runId: string, line: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('simInject', runId, line),
  onSimEvent: (cb: (e: { runId: string; line: string }) => void) => {
    const fn = (_: IpcRendererEvent, e: { runId: string; line: string }) => cb(e)
    ipcRenderer.on('sim:event', fn)
    return () => ipcRenderer.removeListener('sim:event', fn)
  },
  onSimExit: (cb: (e: { runId: string; code: number | null; signal: string | null }) => void) => {
    const fn = (_: IpcRendererEvent, e: { runId: string; code: number | null; signal: string | null }) => cb(e)
    ipcRenderer.on('sim:exit', fn)
    return () => ipcRenderer.removeListener('sim:exit', fn)
  },

  claudeCodeChat: (opts: {
    prompt: string
    systemAppend: string
    model: string
  }): Promise<{ ok: boolean; text?: string; error?: string }> =>
    ipcRenderer.invoke('claudeCodeChat', opts),
  codexChat: (opts: {
    runId?: string
    prompt: string
    model: string
    reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
    includeScreenshot?: boolean
  }): Promise<{ ok: boolean; text?: string; error?: string }> =>
    ipcRenderer.invoke('codexChat', opts),
  codexStop: (runId: string): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke('codexStop', runId),
  pickPartsPhoto: (): Promise<PartsPhoto | null> =>
    ipcRenderer.invoke('pickPartsPhoto'),
  analyzePartsPhoto: (opts: {
    path: string
    notes?: string
    model?: string
    reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  }): Promise<{ ok: boolean; text?: string; error?: string }> =>
    ipcRenderer.invoke('analyzePartsPhoto', opts),
  exaPartSearch: (query: string): Promise<{ ok: boolean; results?: ExaPartSearchResult[]; error?: string }> =>
    ipcRenderer.invoke('exaPartSearch', query),
}

contextBridge.exposeInMainWorld('espAI', api)

export type EspAIApi = typeof api
