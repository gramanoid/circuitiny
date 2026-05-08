import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join, dirname, delimiter, resolve, relative, isAbsolute, basename, extname } from 'path'
import { fileURLToPath } from 'url'
import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { spawn, spawnSync, type ChildProcess, type ChildProcessWithoutNullStreams } from 'child_process'
import { createHash, randomUUID } from 'crypto'
import * as pty from 'node-pty'
import { convertStepLikeCadToGlb } from './modelConversion'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ICON_PATH = join(__dirname, '../../resources/icon.png')
const CIRCUITINY_HOME = join(homedir(), '.circuitiny')
const CATALOG_ROOT = join(CIRCUITINY_HOME, 'catalog')
const PROJECTS_ROOT = join(homedir(), 'circuitiny', 'projects')
const PARTS_PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']
const PARTS_PHOTO_MAX_BYTES = 16 * 1024 * 1024
const MODEL_ASSET_WARN_BYTES = 4 * 1024 * 1024
type ExaCachedResult = { title: string; url: string; highlights: string[]; publishedDate?: string; retrievedAt: string }
const exaPartSearchCache = new Map<string, { expiresAt: number; results: ExaCachedResult[] }>()
// Resolution order: explicit override → IDF's own export.sh env var → standard install location
const IDF_PATH = process.env.CIRCUITINY_IDF_PATH ?? process.env.IDF_PATH ?? join(homedir(), 'esp', 'esp-idf')

app.setName('Circuitiny')

type RunHandle = ChildProcessWithoutNullStreams | pty.IPty
const runs = new Map<string, RunHandle>()

let mainWindow: BrowserWindow | null = null

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Circuitiny',
    icon: ICON_PATH,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      sandbox: false
    }
  })
  mainWindow = win
  win.on('closed', () => { mainWindow = null })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('pickGlb', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Select a .glb or .gltf model',
    filters: [{ name: '3D Model', extensions: ['glb', 'gltf'] }],
    properties: ['openFile']
  })
  if (r.canceled || !r.filePaths[0]) return null
  const data = await readFile(r.filePaths[0])
  return { path: r.filePaths[0], data: new Uint8Array(data) }
})

ipcMain.handle('pickComponent', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Open component.json',
    filters: [{ name: 'Component JSON', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (r.canceled || !r.filePaths[0]) return null
  const jsonPath = r.filePaths[0]
  const json = await readFile(jsonPath, 'utf8')
  let glbData: Uint8Array | null = null
  let glbName: string | null = null
  try {
    const parsed = JSON.parse(json)
    if (parsed.model) {
      const candidate = join(dirname(jsonPath), parsed.model)
      if (existsSync(candidate)) {
        glbData = new Uint8Array(await readFile(candidate))
        glbName = parsed.model
      }
    }
    if (!glbData) {
      // fallback: any .glb in same dir
      const sibs = await readdir(dirname(jsonPath))
      const glb = sibs.find((f) => f.toLowerCase().endsWith('.glb'))
      if (glb) {
        glbData = new Uint8Array(await readFile(join(dirname(jsonPath), glb)))
        glbName = glb
      }
    }
  } catch { /* ignore — return json only */ }
  return { jsonPath, json, glbData, glbName }
})

ipcMain.handle('listCatalog', async () => {
  const root = join(CIRCUITINY_HOME, 'catalog')
  if (!existsSync(root)) return []
  const dirs = await readdir(root, { withFileTypes: true })
  const out: Array<{ id: string; json: any; glbData: Uint8Array | null }> = []
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    const jsonPath = join(root, d.name, 'component.json')
    if (!existsSync(jsonPath)) continue
    try {
      const json = JSON.parse(await readFile(jsonPath, 'utf8'))
      let glbData: Uint8Array | null = null
      if (json.model && existsSync(join(root, d.name, json.model))) {
        glbData = new Uint8Array(await readFile(join(root, d.name, json.model)))
      }
      out.push({ id: json.id ?? d.name, json, glbData })
    } catch { /* skip bad entry */ }
  }
  return out
})

ipcMain.handle('writeBundle', async (_e, id: string, glbName: string, glbData: Uint8Array, jsonText: string) => {
  if (!id) throw new Error('id is required')
  const dir = catalogEntryDirFor(id)
  const safeGlbName = safeCatalogFileName(glbName)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, safeGlbName), Buffer.from(glbData))
  await writeFile(join(dir, 'component.json'), jsonText, 'utf8')
  return dir
})

ipcMain.handle('writeComponentJson', async (_e, id: string, jsonText: string) => {
  if (!id) throw new Error('id is required')
  const dir = catalogEntryDirFor(id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'component.json'), jsonText, 'utf8')
  return dir
})

ipcMain.handle('installModelAsset', async (_e, opts: {
  asset: {
    id: string
    assetUrl?: string
    sourceUrl: string
    licenseUse: 'bundled-ok' | 'local-import-only' | 'blocked'
    format: 'glb' | 'gltf' | 'step' | 'stp' | 'wrl'
    modelFileName: string
  }
  componentJson: string
  approved: boolean
}) => {
  if (opts?.approved !== true) return { ok: false, error: 'Model install requires explicit approval.' }
  const asset = opts.asset
  if (!asset?.id) return { ok: false, error: 'Model asset id is required.' }
  if (asset.licenseUse === 'blocked') return { ok: false, error: 'This model is blocked by its license or payment requirement.' }
  if (!opts.componentJson?.trim()) return { ok: false, error: 'componentJson is required.' }
  let parsed: any
  try {
    parsed = JSON.parse(opts.componentJson)
  } catch (err) {
    return { ok: false, error: `Invalid componentJson: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (!parsed?.id) return { ok: false, error: 'componentJson must include an id.' }
  if (!Array.isArray(parsed?.pins)) return { ok: false, error: 'componentJson must include pins.' }
  if (asset.format === 'wrl') {
    return {
      ok: false,
      conversionStatus: 'converter-unavailable',
      conversionLog: converterDiagnostics(asset.format),
      error: 'WRL conversion needs a local converter. Install FreeCAD, Blender, assimp, or kicad-cli, then retry.',
    }
  }
  const modelUrl = asset.assetUrl
  if (!modelUrl) return { ok: false, error: 'This candidate does not expose a direct model URL. Download it locally and use Load .glb/.gltf.' }
  try {
    const model = await loadInstallableModelAsset(asset, modelUrl)
    const checksum = sha256(model.data)
    const jsonWithChecksum = JSON.stringify(withModelAssetInstallInfo(parsed, {
      checksum,
      byteLength: model.data.byteLength,
      conversionStatus: model.conversionStatus,
      conversionLog: model.log,
      dimensionsMm: model.dimensionsMm,
      modelName: model.modelName,
      scale: model.scale,
    }), null, 2)
    const dir = await writeCatalogBundle(parsed.id, model.modelName, model.data, jsonWithChecksum)
    return {
      ok: true,
      savedTo: dir,
      componentJson: jsonWithChecksum,
      modelName: model.modelName,
      modelData: new Uint8Array(model.data),
      conversionStatus: model.conversionStatus,
      conversionLog: model.log,
    }
  } catch (err) {
    return {
      ok: false,
      conversionStatus: 'failed',
      conversionLog: [`Failed to install ${asset.id}: ${err instanceof Error ? err.message : String(err)}`],
      error: err instanceof Error ? err.message : String(err),
    }
  }
})

function catalogEntryDirFor(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('invalid catalog id')
  const base = resolve(CATALOG_ROOT)
  const dir = resolve(base, id)
  const rel = relative(base, dir)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('catalog path escapes catalog root')
  return dir
}

function safeCatalogFileName(name: string): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(name) || name.includes('..')) throw new Error('invalid catalog asset name')
  return name
}

async function writeCatalogBundle(id: string, modelName: string, modelData: Uint8Array, jsonText: string): Promise<string> {
  const dir = catalogEntryDirFor(id)
  const safeModelName = safeCatalogFileName(modelName)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, safeModelName), Buffer.from(modelData))
  await writeFile(join(dir, 'component.json'), jsonText, 'utf8')
  return dir
}

async function fetchRemoteBytes(url: string): Promise<{ data: Uint8Array; log: string[]; dimensionsMm?: { x: number; y: number; z: number } }> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status} while downloading ${url}`)
  const data = new Uint8Array(await response.arrayBuffer())
  return { data, log: [`Downloaded ${data.byteLength} bytes from ${url}`] }
}

async function loadInstallableModelAsset(asset: {
  id: string
  format: 'glb' | 'gltf' | 'step' | 'stp' | 'wrl'
  modelFileName: string
}, url: string): Promise<{
  data: Uint8Array
  log: string[]
  dimensionsMm?: { x: number; y: number; z: number }
  conversionStatus: 'not-needed' | 'converted'
  modelName: string
  scale?: number
}> {
  if (asset.format === 'gltf') {
    const model = await fetchSelfContainedGltf(url)
    return { ...model, conversionStatus: 'converted', modelName: ensureModelExtension(asset.modelFileName, 'gltf') }
  }
  if (asset.format === 'glb') {
    const model = await fetchRemoteBytes(url)
    return { ...model, conversionStatus: 'not-needed', modelName: ensureModelExtension(asset.modelFileName, 'glb') }
  }
  if (asset.format === 'step' || asset.format === 'stp') {
    const downloaded = await fetchRemoteBytes(url)
    const converted = await convertStepLikeCadToGlb(downloaded.data, asset.format, asset.modelFileName)
    return {
      data: converted.data,
      log: [...downloaded.log, ...converted.log],
      dimensionsMm: converted.dimensionsMm,
      conversionStatus: 'converted',
      modelName: ensureModelExtension(asset.modelFileName, 'glb'),
      scale: 1,
    }
  }
  throw new Error(`Unsupported model format: ${asset.format}`)
}

async function fetchSelfContainedGltf(url: string): Promise<{ data: Uint8Array; log: string[]; dimensionsMm?: { x: number; y: number; z: number } }> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status} while downloading ${url}`)
  const root = new URL(url)
  const gltf = JSON.parse(await response.text())
  const log: string[] = [`Downloaded glTF from ${url}`]
  const dimensionsMm = dimensionsFromGltfAccessors(gltf)
  if (dimensionsMm) log.push(`Detected bounds ${dimensionsMm.x.toFixed(2)} x ${dimensionsMm.y.toFixed(2)} x ${dimensionsMm.z.toFixed(2)} model units`)

  if (Array.isArray(gltf.buffers)) {
    for (const buffer of gltf.buffers) {
      if (!buffer?.uri || isDataUri(buffer.uri)) continue
      const bufferUrl = new URL(buffer.uri, root).toString()
      const embedded = await fetchDataUri(bufferUrl, 'application/octet-stream')
      buffer.uri = embedded.uri
      buffer.byteLength = embedded.byteLength
      log.push(`Embedded buffer ${bufferUrl} (${embedded.byteLength} bytes)`)
    }
  }

  if (Array.isArray(gltf.images)) {
    const hasKtx2 = gltf.images.some((image: any) => typeof image?.uri === 'string' && image.uri.toLowerCase().endsWith('.ktx2'))
    if (hasKtx2) {
      applyTextureFallbackMaterialColors(gltf)
      stripTextureReferences(gltf)
      log.push('Stripped KTX2 texture references; Circuitiny keeps geometry with readable plastic/metal fallback material colors.')
    } else {
      for (const image of gltf.images) {
        if (!image?.uri || isDataUri(image.uri)) continue
        const imageUrl = new URL(image.uri, root).toString()
        const embedded = await fetchDataUri(imageUrl, mimeForModelAsset(imageUrl))
        image.uri = embedded.uri
        log.push(`Embedded image ${imageUrl} (${embedded.byteLength} bytes)`)
      }
    }
  }

  const text = JSON.stringify(gltf)
  return { data: new Uint8Array(Buffer.from(text, 'utf8')), log, dimensionsMm }
}

function stripTextureReferences(gltf: any): void {
  if (Array.isArray(gltf.materials)) {
    for (const material of gltf.materials) {
      delete material.normalTexture
      delete material.occlusionTexture
      delete material.emissiveTexture
      if (material.pbrMetallicRoughness) {
        delete material.pbrMetallicRoughness.baseColorTexture
        delete material.pbrMetallicRoughness.metallicRoughnessTexture
      }
    }
  }
  delete gltf.textures
  delete gltf.images
}

function applyTextureFallbackMaterialColors(gltf: any): void {
  if (!Array.isArray(gltf.materials)) return
  for (const material of gltf.materials) {
    const fallback = fallbackMaterialForName(String(material?.name ?? ''))
    if (!material.pbrMetallicRoughness) material.pbrMetallicRoughness = {}
    material.pbrMetallicRoughness.baseColorFactor = fallback.baseColorFactor
    material.pbrMetallicRoughness.metallicFactor = fallback.metallicFactor
    material.pbrMetallicRoughness.roughnessFactor = fallback.roughnessFactor
  }
}

function fallbackMaterialForName(name: string): {
  baseColorFactor: [number, number, number, number]
  metallicFactor: number
  roughnessFactor: number
} {
  const n = name.toLowerCase()
  if (/(metal|pin|terminal|contact|lead)/.test(n)) {
    return { baseColorFactor: [0.72, 0.69, 0.62, 1], metallicFactor: 0.78, roughnessFactor: 0.28 }
  }
  if (/(black|plastic|rubber|matte)/.test(n)) {
    return { baseColorFactor: [0.015, 0.016, 0.018, 1], metallicFactor: 0.02, roughnessFactor: 0.52 }
  }
  if (/red/.test(n)) return { baseColorFactor: [0.75, 0.04, 0.03, 1], metallicFactor: 0.02, roughnessFactor: 0.46 }
  if (/green/.test(n)) return { baseColorFactor: [0.08, 0.45, 0.18, 1], metallicFactor: 0.02, roughnessFactor: 0.5 }
  if (/blue/.test(n)) return { baseColorFactor: [0.06, 0.22, 0.68, 1], metallicFactor: 0.02, roughnessFactor: 0.5 }
  if (/(white|silk)/.test(n)) return { baseColorFactor: [0.84, 0.84, 0.78, 1], metallicFactor: 0.02, roughnessFactor: 0.48 }
  return { baseColorFactor: [0.48, 0.5, 0.46, 1], metallicFactor: 0.08, roughnessFactor: 0.48 }
}

function dimensionsFromGltfAccessors(gltf: any): { x: number; y: number; z: number } | undefined {
  if (!Array.isArray(gltf.accessors)) return undefined
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (const accessor of gltf.accessors) {
    if (accessor?.type !== 'VEC3' || !Array.isArray(accessor.min) || !Array.isArray(accessor.max)) continue
    minX = Math.min(minX, Number(accessor.min[0]))
    minY = Math.min(minY, Number(accessor.min[1]))
    minZ = Math.min(minZ, Number(accessor.min[2]))
    maxX = Math.max(maxX, Number(accessor.max[0]))
    maxY = Math.max(maxY, Number(accessor.max[1]))
    maxZ = Math.max(maxZ, Number(accessor.max[2]))
  }
  if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) return undefined
  return {
    x: Math.max(0, maxX - minX),
    y: Math.max(0, maxY - minY),
    z: Math.max(0, maxZ - minZ),
  }
}

async function fetchDataUri(url: string, mime: string): Promise<{ uri: string; byteLength: number }> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status} while downloading ${url}`)
  const data = Buffer.from(await response.arrayBuffer())
  return { uri: `data:${mime};base64,${data.toString('base64')}`, byteLength: data.byteLength }
}

function isDataUri(uri: string): boolean {
  return /^data:/i.test(uri)
}

function mimeForModelAsset(url: string): string {
  const path = new URL(url).pathname.toLowerCase()
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  if (path.endsWith('.webp')) return 'image/webp'
  if (path.endsWith('.ktx2')) return 'image/ktx2'
  if (path.endsWith('.bin')) return 'application/octet-stream'
  return 'application/octet-stream'
}

function ensureModelExtension(name: string, extension: 'glb' | 'gltf'): string {
  const base = name.replace(/\.(glb|gltf|step|stp|wrl)$/i, '')
  return `${base}.${extension}`
}

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(data)).digest('hex')
}

function withModelAssetInstallInfo(component: any, info: {
  checksum: string
  byteLength: number
  conversionStatus: string
  conversionLog: string[]
  dimensionsMm?: { x: number; y: number; z: number }
  modelName: string
  scale?: number
}): any {
  const existingNotes = Array.isArray(component.catalogMeta?.reviewNotes) ? component.catalogMeta.reviewNotes : []
  const heavyNote = info.byteLength > MODEL_ASSET_WARN_BYTES
    ? [`Large model (${Math.round(info.byteLength / 1024)} KB): optimize before promoting if the viewer feels slow.`]
    : []
  return {
    ...component,
    model: info.modelName,
    ...(typeof info.scale === 'number' ? { scale: info.scale } : {}),
    catalogMeta: {
      ...(component.catalogMeta ?? {}),
      renderStrategy: 'draft-glb',
      reviewNotes: Array.from(new Set([
        ...existingNotes,
        `Installed model bytes: ${info.byteLength}`,
        ...heavyNote,
      ])),
      modelAsset: component.catalogMeta?.modelAsset
        ? {
            ...component.catalogMeta.modelAsset,
            checksum: info.checksum,
            conversionStatus: info.conversionStatus,
            conversionLog: info.conversionLog,
            ...(info.dimensionsMm ? { dimensionsMm: info.dimensionsMm } : {}),
          }
        : component.catalogMeta?.modelAsset,
    },
  }
}

function converterDiagnostics(format: string): string[] {
  if (format === 'step' || format === 'stp') {
    return [
      `${format.toUpperCase()} assets are converted by Circuitiny's bundled occt-import-js/OpenCascade converter.`,
      'If this import failed, the CAD file may contain geometry OpenCascade could not triangulate.',
      'Native glTF/GLB assets can still be installed immediately.',
    ]
  }
  const tools = [
    { name: 'FreeCAD', binary: 'FreeCAD' },
    { name: 'Blender', binary: 'blender' },
    { name: 'Assimp', binary: 'assimp' },
    { name: 'KiCad CLI', binary: 'kicad-cli' },
  ]
  const pathDirs = (process.env.PATH ?? '').split(delimiter)
  const found = tools.filter((tool) => firstExistingCli(tool.binary, pathDirs))
  return [
    `${format.toUpperCase()} assets are CAD solids and need conversion before Circuitiny can render them as glTF/GLB.`,
    found.length
      ? `Detected converter candidates: ${found.map((tool) => tool.name).join(', ')}.`
      : 'No supported converter binary was found on PATH.',
    'Native glTF/GLB assets can be installed immediately.',
  ]
}

// ---- M5: flash pipeline ----

function projectDirFor(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'untitled'
  return join(PROJECTS_ROOT, safe)
}

ipcMain.handle('projectWrite', async (_e, name: string, target: string, files: Record<string, string>) => {
  const dir = projectDirFor(name)
  await mkdir(join(dir, 'main'), { recursive: true })
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf8')
  }
  // Top-level CMakeLists.txt — ESP-IDF expects this.
  const topCMake = [
    '# AUTO-GENERATED BY Circuitiny. DO NOT EDIT.',
    'cmake_minimum_required(VERSION 3.16)',
    'include($ENV{IDF_PATH}/tools/cmake/project.cmake)',
    `project(${name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'circuitiny_project'})`,
    ''
  ].join('\n')
  await writeFile(join(dir, 'CMakeLists.txt'), topCMake, 'utf8')
  return { dir, target }
})

ipcMain.handle('listSerialPorts', async () => {
  try {
    const entries = await readdir('/dev')
    return entries
      .filter((f) => /^cu\.(usb|SLAB|wch|tty\.usb)/i.test(f))
      .map((f) => `/dev/${f}`)
      .sort()
  } catch {
    return []
  }
})

ipcMain.handle('idfStart', async (_e, opts: {
  name: string; target: string; op: 'build' | 'flash' | 'monitor' | 'clean'; port?: string
}) => {
  const dir = projectDirFor(opts.name)
  if (!existsSync(dir)) throw new Error(`Project dir does not exist: ${dir} (write first)`)
  if (!existsSync(IDF_PATH)) throw new Error(`ESP-IDF not found at ${IDF_PATH} (set CIRCUITINY_IDF_PATH)`)

  const needsTarget = !existsSync(join(dir, 'build'))
  const portArg = opts.port ? ` -p ${JSON.stringify(opts.port)}` : ''
  let cmd: string
  switch (opts.op) {
    case 'build':
      cmd = needsTarget
        ? `idf.py set-target ${opts.target} && idf.py build`
        : `idf.py build`
      break
    case 'flash':
      if (!opts.port) throw new Error('Flash requires a serial port')
      cmd = `idf.py${portArg} flash`
      break
    case 'monitor':
      if (!opts.port) throw new Error('Monitor requires a serial port')
      cmd = `idf.py${portArg} monitor`
      break
    case 'clean':
      cmd = `idf.py fullclean`
      break
  }

  const runId = randomUUID()
  const extraPaths = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/usr/local/sbin']
  const PATH = [...extraPaths, process.env.PATH ?? ''].join(':')
  const shell = `source ${JSON.stringify(join(IDF_PATH, 'export.sh'))} 1>/dev/null && cd ${JSON.stringify(dir)} && ${cmd}`
  const env = { ...process.env, PATH, IDF_PATH, PYTHONUNBUFFERED: '1' }

  if (opts.op === 'monitor') {
    // idf.py monitor requires a TTY — use node-pty to provide one.
    const ptyProcess = pty.spawn('bash', ['-c', shell], {
      name: 'xterm-color', cols: 220, rows: 50, cwd: dir, env
    })
    runs.set(runId, ptyProcess)
    ptyProcess.onData((text) => {
      mainWindow?.webContents.send('idf:log', { runId, stream: 'stdout', text })
    })
    ptyProcess.onExit(({ exitCode }) => {
      runs.delete(runId)
      mainWindow?.webContents.send('idf:exit', { runId, code: exitCode, signal: null })
    })
  } else {
    const child = spawn('bash', ['-c', shell], { env }) as ChildProcessWithoutNullStreams
    runs.set(runId, child)
    const emit = (stream: 'stdout' | 'stderr', data: Buffer) => {
      mainWindow?.webContents.send('idf:log', { runId, stream, text: data.toString('utf8') })
    }
    child.stdout.on('data', (d) => emit('stdout', d))
    child.stderr.on('data', (d) => emit('stderr', d))
    child.on('exit', (code, signal) => {
      runs.delete(runId)
      mainWindow?.webContents.send('idf:exit', { runId, code, signal })
    })
    child.on('error', (err) => {
      mainWindow?.webContents.send('idf:log', { runId, stream: 'stderr', text: `spawn error: ${err.message}\n` })
    })
  }
  return { runId, cwd: dir, cmd }
})

// ---- Firmware sim ----

const SIM_HAL_DIR = join(__dirname, '../../resources/sim_hal')
const SIM_BUILD_ROOT = join(homedir(), 'circuitiny', 'sim')

ipcMain.handle('simCompile', async (_e, name: string, appMainC: string) => {
  const safe = (name || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_')
  const dir = join(SIM_BUILD_ROOT, safe)
  await mkdir(dir, { recursive: true })

  const appMainPath = join(dir, 'app_main.c')
  const simHalC     = join(SIM_HAL_DIR, 'sim_hal.c')
  const binaryPath  = join(dir, 'firmware_sim')

  await writeFile(appMainPath, appMainC, 'utf8')

  const cmd = [
    'clang', '-pthread', '-DSIM_MODE',
    `-I${SIM_HAL_DIR}`,
    simHalC, appMainPath,
    '-o', binaryPath,
  ].map((s) => JSON.stringify(s)).join(' ')

  return new Promise<{ ok: boolean; binaryPath?: string; error?: string }>((resolve) => {
    const child = spawn('bash', ['-c', cmd]) as ChildProcessWithoutNullStreams
    let stderr = ''
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8') })
    child.stdout.on('data', (d: Buffer) => { stderr += d.toString('utf8') })
    child.on('exit', (code) => {
      if (code === 0) resolve({ ok: true, binaryPath })
      else resolve({ ok: false, error: stderr.trim() || `clang exited with code ${code}` })
    })
    child.on('error', (err) => resolve({ ok: false, error: err.message }))
  })
})

ipcMain.handle('simStart', async (_e, binaryPath: string) => {
  if (!existsSync(binaryPath)) throw new Error(`Binary not found: ${binaryPath}`)

  // Make sure the binary is executable
  const { execSync } = await import('child_process')
  try { execSync(`chmod +x ${JSON.stringify(binaryPath)}`) } catch { /* ignore */ }

  const runId = randomUUID()
  const child = spawn(binaryPath, [], {
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams
  runs.set(runId, child)

  let buf = ''
  child.stdout.on('data', (d: Buffer) => {
    buf += d.toString('utf8')
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim()) {
        mainWindow?.webContents.send('sim:event', { runId, line })
      }
    }
  })
  child.stderr.on('data', (d: Buffer) => {
    const text = d.toString('utf8').trim()
    if (text) {
      mainWindow?.webContents.send('sim:event', {
        runId,
        line: JSON.stringify({ t: 'stderr', msg: text }),
      })
    }
  })
  child.on('exit', (code, signal) => {
    runs.delete(runId)
    mainWindow?.webContents.send('sim:exit', { runId, code, signal })
  })
  child.on('error', (err) => {
    mainWindow?.webContents.send('sim:event', {
      runId,
      line: JSON.stringify({ t: 'stderr', msg: `spawn error: ${err.message}` }),
    })
  })

  return { runId }
})

ipcMain.handle('simInject', async (_e, runId: string, line: string) => {
  const handle = runs.get(runId)
  if (!handle) return { ok: false, reason: 'not running' }
  if (!('stdin' in handle)) return { ok: false, reason: 'no stdin' }
  ;(handle as ChildProcessWithoutNullStreams).stdin.write(line + '\n')
  return { ok: true }
})

// ---- Claude Code session chat ----

const CLAUDE_EXTRA_PATHS = [
  join(homedir(), '.local', 'bin'),
  join(homedir(), '.volta', 'bin'),
  join(homedir(), 'Library', 'pnpm'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  ...(process.platform === 'win32'
    ? [
        join(process.env.APPDATA ?? '', 'npm'),
        join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs'),
      ]
    : []),
]
const CLI_EXTRA_PATHS = CLAUDE_EXTRA_PATHS

function defaultCodexCliModel(requestedModel: string | undefined): string {
  const requested = requestedModel?.trim()
  if (requested) return requested
  // This IPC path is the ChatGPT/Codex CLI provider; API-key chat uses the separate OpenAI provider.
  // Keep aligned with PROVIDER_DEFAULTS.codexcli.defaultModel in src/agent/types.ts.
  return 'gpt-5.5'
}

function isCodexReasoningEffort(value: unknown): value is 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' {
  return value === 'minimal' || value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh'
}

function cliNames(name: string): string[] {
  return process.platform === 'win32' ? [`${name}.cmd`, `${name}.exe`, name] : [name]
}

function firstExistingCli(name: string, dirs: string[]): string | null {
  for (const dir of dirs.filter(Boolean)) {
    for (const binaryName of cliNames(name)) {
      const candidate = join(dir, binaryName)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

function sanitizeCliDiagnostic(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return trimmed
  const home = homedir()
  return trimmed.split(/\r?\n/).map((line) => (
    home && line.startsWith(home) ? `~${line.slice(home.length)}` : line
  )).join('\n')
}

function resolveCliBinary(name: string, extraPaths: string[]): string {
  const env = { ...process.env, PATH: [...extraPaths, process.env.PATH ?? ''].join(delimiter) }
  const direct = firstExistingCli(name, extraPaths)
  if (direct) return direct

  const lookup = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { env, encoding: 'utf8' })
  const lookupPath = lookup.stdout?.split(/\r?\n/).find(Boolean)
  if (lookup.status === 0 && lookupPath) return lookupPath.trim()

  const npmBin = spawnSync('npm', ['bin', '-g'], { env, encoding: 'utf8' })
  const npmBinPath = npmBin.status === 0 ? firstExistingCli(name, [npmBin.stdout.trim()]) : null
  if (npmBinPath) return npmBinPath

  const npmPrefix = spawnSync('npm', ['prefix', '-g'], { env, encoding: 'utf8' })
  const npmPrefixPath = npmPrefix.status === 0
    ? firstExistingCli(name, [process.platform === 'win32' ? npmPrefix.stdout.trim() : join(npmPrefix.stdout.trim(), 'bin')])
    : null
  if (npmPrefixPath) return npmPrefixPath
  console.warn('CLI binary resolution failed; falling back to PATH lookup at spawn time', {
    name,
    extraPathCount: extraPaths.filter(Boolean).length,
    lookupStatus: lookup.status,
    npmBinStatus: npmBin.status,
    npmBinOutput: sanitizeCliDiagnostic(npmBin.stdout),
    npmPrefixStatus: npmPrefix.status,
    npmPrefixOutput: sanitizeCliDiagnostic(npmPrefix.stdout),
  })
  return name
}

async function captureCodexContextImage(capture: boolean): Promise<string | null> {
  if (!capture) return null
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return null
  try {
    const image = await mainWindow.webContents.capturePage()
    if (image.isEmpty()) return null
    const imagePath = join(app.getPath('temp'), `circuitiny-canvas-${randomUUID()}.png`)
    await writeFile(imagePath, image.toPNG())
    return imagePath
  } catch {
    return null
  }
}

ipcMain.handle('claudeCodeChat', async (_e, opts: {
  prompt: string
  systemAppend: string
  model: string
}): Promise<{ ok: boolean; text?: string; error?: string }> => {
  const claudePath = join(homedir(), '.local', 'bin', 'claude')
  const binary = existsSync(claudePath) ? claudePath : 'claude'
  const PATH = [...CLAUDE_EXTRA_PATHS, process.env.PATH ?? ''].join(delimiter)

  return new Promise((resolve) => {
    const args = [
      '-p',
      '--no-session-persistence',
      '--output-format', 'text',
      '--model', opts.model || 'sonnet',
      '--append-system-prompt', opts.systemAppend,
    ]

    const child = spawn(binary, args, {
      env: { ...process.env, PATH },
    }) as ChildProcess

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf8') })
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString('utf8') })

    child.stdin?.write(opts.prompt)
    child.stdin?.end()

    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ ok: true, text: stdout })
      } else {
        resolve({ ok: false, error: stderr.trim() || `claude exited with code ${code}` })
      }
    })
    child.on('error', (err) => {
      resolve({ ok: false, error: err.message })
    })
  })
})

// ---- Codex CLI session chat ----

const codexRuns = new Map<string, ChildProcess>()
const CODEX_CLI_TIMEOUT_MS = 300_000

ipcMain.handle('codexChat', async (_e, opts: {
  runId?: string
  prompt: string
  model: string
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  includeScreenshot?: boolean
}): Promise<{ ok: boolean; text?: string; error?: string }> => {
  const PATH = [...CLI_EXTRA_PATHS, process.env.PATH ?? ''].join(delimiter)
  const binary = resolveCliBinary('codex', CLI_EXTRA_PATHS)
  const outputPath = join(app.getPath('temp'), `circuitiny-codex-${randomUUID()}.txt`)
  const imagePath = await captureCodexContextImage(opts.includeScreenshot === true)
  const runId = opts.runId ?? randomUUID()
  const model = defaultCodexCliModel(opts.model)
  const reasoningEffort = isCodexReasoningEffort(opts.reasoningEffort) ? opts.reasoningEffort : 'high'

  return new Promise((resolve) => {
    // Confirmed with `codex exec --help`: -c/--config, -i/--image, and -o/--output-last-message are supported.
    const args = [
      'exec',
      '--ephemeral',
      '--skip-git-repo-check',
      '--sandbox', 'read-only',
      '--model', model,
      '-c', `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`,
      ...(imagePath ? ['--image', imagePath] : []),
      '--output-last-message', outputPath,
      '-',
    ]

    const child = spawn(binary, args, {
      env: { ...process.env, PATH },
      cwd: app.getPath('home'),
    }) as ChildProcess
    codexRuns.set(runId, child)

    let stdout = ''
    let stderr = ''
    let settled = false
    let forceKillTimer: ReturnType<typeof setTimeout> | null = null

    async function finish(result: { ok: boolean; text?: string; error?: string }) {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (forceKillTimer) clearTimeout(forceKillTimer)
      codexRuns.delete(runId)
      await unlink(outputPath).catch(() => {})
      if (imagePath) await unlink(imagePath).catch(() => {})
      resolve(result)
    }

    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      forceKillTimer = setTimeout(() => {
        if (child.exitCode == null && child.signalCode == null) child.kill('SIGKILL')
      }, 1500)
      finish({ ok: false, error: `Codex CLI timed out after ${Math.round(CODEX_CLI_TIMEOUT_MS / 1000)} seconds` }).catch((err) => {
        console.warn('Failed to finish timed-out Codex run', err)
      })
    }, CODEX_CLI_TIMEOUT_MS)

    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf8') })
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString('utf8') })

    child.stdin?.write(opts.prompt)
    child.stdin?.end()

    child.on('exit', async (code) => {
      const text = await readFile(outputPath, 'utf8').catch(() => stdout)
      if (code === 0) {
        await finish({ ok: true, text })
      } else {
        await finish({ ok: false, error: stderr.trim() || stdout.trim() || `codex exited with code ${code}` })
      }
    })
    child.on('error', async (err) => {
      await finish({ ok: false, error: err.message })
    })
  })
})

ipcMain.handle('codexStop', async (_e, runId: string) => {
  const child = codexRuns.get(runId)
  if (!child) return { ok: false, reason: 'not_found' }
  child.kill('SIGTERM')
  const killTimeout = setTimeout(() => {
    if (codexRuns.get(runId) === child && child.exitCode == null && child.signalCode == null) child.kill('SIGKILL')
  }, 1500)
  child.once('exit', () => clearTimeout(killTimeout))
  child.once('error', () => clearTimeout(killTimeout))
  if (child.exitCode != null || child.signalCode != null) clearTimeout(killTimeout)
  return { ok: true }
})

// ---- Parts Lab: photo intake + web lookup ----

ipcMain.handle('pickPartsPhoto', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Select a parts photo',
    filters: [{ name: 'Image', extensions: PARTS_PHOTO_EXTENSIONS }],
    properties: ['openFile'],
  })
  if (r.canceled || !r.filePaths[0]) return null
  const photoPath = r.filePaths[0]
  validatePartsPhotoPath(photoPath)
  const data = await readFile(photoPath)
  if (data.byteLength > PARTS_PHOTO_MAX_BYTES) {
    throw new Error('Photo is too large for transient analysis. Please choose an image under 16 MB.')
  }
  const mime = mimeForImagePath(photoPath)
  return {
    path: photoPath,
    name: basename(photoPath),
    dataUrl: `data:${mime};base64,${data.toString('base64')}`,
  }
})

ipcMain.handle('analyzePartsPhoto', async (_e, opts: {
  path: string
  notes?: string
  model?: string
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
}): Promise<{ ok: boolean; text?: string; error?: string }> => {
  const photoPath = String(opts.path ?? '')
  try {
    validatePartsPhotoPath(photoPath)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  const prompt = [
    'You are helping a beginner identify electronics parts in a photo for Circuitiny.',
    'Return ONLY JSON in this shape:',
    '{"candidates":[{"label":"part name","quantity":1,"confidence":"high|medium|low","evidence":"short visual clue","safetyNotes":["short caution"]}]}',
    'Prefer common ESP32 beginner parts: LEDs, resistors, buttons, OLED displays, PIR sensors, servos, moisture sensors, jumper wires, and modules.',
    'If a part is uncertain, set confidence to low and explain what to verify. Do not invent pinouts.',
    opts.notes ? `Learner notes: ${String(opts.notes).slice(0, 1000)}` : '',
  ].filter(Boolean).join('\n')
  return runCodexExec({
    prompt,
    model: opts.model,
    reasoningEffort: opts.reasoningEffort,
    imagePaths: [photoPath],
    cwd: app.getPath('home'),
  })
})

ipcMain.handle('exaPartSearch', async (_e, query: string): Promise<{
  ok: boolean
  results?: Array<{ title: string; url: string; highlights: string[]; publishedDate?: string }>
  error?: string
}> => {
  const normalized = String(query ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized) return { ok: false, error: 'Search query is required.' }
  const apiKey = process.env.EXA_API_KEY?.trim()
  if (!apiKey) return { ok: false, error: 'EXA_API_KEY is not configured in the app environment.' }
  const cacheKey = normalized.toLowerCase()
  const cached = exaPartSearchCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return { ok: true, results: cached.results }
  try {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query: `${normalized} electronics module ESP32 datasheet pinout beginner safe voltage`,
        type: 'auto',
        numResults: 5,
        contents: {
          highlights: { maxCharacters: 1200 },
          maxAgeHours: 168,
        },
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = typeof data?.error === 'string' ? data.error : `Exa search failed with HTTP ${response.status}`
      return { ok: false, error: message }
    }
    const results = Array.isArray(data?.results) ? data.results : []
    const normalizedResults: ExaCachedResult[] = results.map((item: any) => ({
        title: String(item?.title ?? item?.url ?? 'Untitled result'),
        url: String(item?.url ?? ''),
        highlights: Array.isArray(item?.highlights)
          ? item.highlights.filter((h: unknown): h is string => typeof h === 'string').slice(0, 3)
          : [],
        ...(typeof item?.publishedDate === 'string' ? { publishedDate: item.publishedDate } : {}),
        retrievedAt: new Date().toISOString(),
      })).filter((item: { url: string }) => item.url).slice(0, 5)
    exaPartSearchCache.set(cacheKey, { expiresAt: Date.now() + 24 * 60 * 60 * 1000, results: normalizedResults })
    return { ok: true, results: normalizedResults }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

function validatePartsPhotoPath(photoPath: string) {
  if (!photoPath) throw new Error('Photo path is required.')
  if (!existsSync(photoPath)) throw new Error(`Photo not found: ${photoPath}`)
  const ext = extname(photoPath).replace(/^\./, '').toLowerCase()
  if (!PARTS_PHOTO_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported photo type ".${ext}". Use ${PARTS_PHOTO_EXTENSIONS.join(', ')}.`)
  }
}

function mimeForImagePath(photoPath: string): string {
  const ext = extname(photoPath).replace(/^\./, '').toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'heic') return 'image/heic'
  if (ext === 'heif') return 'image/heif'
  return 'application/octet-stream'
}

function runCodexExec(opts: {
  prompt: string
  model?: string
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  imagePaths?: string[]
  cwd: string
}): Promise<{ ok: boolean; text?: string; error?: string }> {
  const PATH = [...CLI_EXTRA_PATHS, process.env.PATH ?? ''].join(delimiter)
  const binary = resolveCliBinary('codex', CLI_EXTRA_PATHS)
  const outputPath = join(app.getPath('temp'), `circuitiny-codex-${randomUUID()}.txt`)
  const model = defaultCodexCliModel(opts.model)
  const reasoningEffort = isCodexReasoningEffort(opts.reasoningEffort) ? opts.reasoningEffort : 'medium'

  return new Promise((resolve) => {
    const args = [
      'exec',
      '--ephemeral',
      '--skip-git-repo-check',
      '--sandbox', 'read-only',
      '--model', model,
      '-c', `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`,
      ...(opts.imagePaths ?? []).flatMap((imagePath) => ['--image', imagePath]),
      '--output-last-message', outputPath,
      '-',
    ]
    const child = spawn(binary, args, {
      env: { ...process.env, PATH },
      cwd: opts.cwd,
    }) as ChildProcess

    let stdout = ''
    let stderr = ''
    let settled = false
    let forceKillTimer: ReturnType<typeof setTimeout> | null = null

    async function finish(result: { ok: boolean; text?: string; error?: string }) {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (forceKillTimer) clearTimeout(forceKillTimer)
      await unlink(outputPath).catch(() => {})
      resolve(result)
    }

    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      forceKillTimer = setTimeout(() => {
        if (child.exitCode == null && child.signalCode == null) child.kill('SIGKILL')
      }, 1500)
      finish({ ok: false, error: `Codex CLI timed out after ${Math.round(CODEX_CLI_TIMEOUT_MS / 1000)} seconds` }).catch((err) => {
        console.warn('Failed to finish timed-out Codex run', err)
      })
    }, CODEX_CLI_TIMEOUT_MS)

    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf8') })
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString('utf8') })
    child.stdin?.write(opts.prompt)
    child.stdin?.end()
    child.on('exit', async (code) => {
      const text = await readFile(outputPath, 'utf8').catch(() => stdout)
      if (code === 0) {
        await finish({ ok: true, text })
      } else {
        await finish({ ok: false, error: stderr.trim() || stdout.trim() || `codex exited with code ${code}` })
      }
    })
    child.on('error', async (err) => {
      await finish({ ok: false, error: err.message })
    })
  })
}

// ---- Project save / open ----

ipcMain.handle('saveProject', async (_e, project: unknown, suggestedName: string, existingPath?: string) => {
  let filePath = existingPath
  if (!filePath) {
    const safe = (suggestedName || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_')
    const r = await dialog.showSaveDialog({
      title: 'Save project',
      defaultPath: join(homedir(), 'circuitiny', `${safe}.circuitiny.json`),
      filters: [{ name: 'Circuitiny project', extensions: ['circuitiny.json'] }]
    })
    if (r.canceled || !r.filePath) return null
    filePath = r.filePath
  }
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(project, null, 2), 'utf8')
  return filePath
})

ipcMain.handle('openProject', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Open project',
    filters: [{ name: 'Circuitiny project', extensions: ['circuitiny.json', 'json'] }],
    properties: ['openFile']
  })
  if (r.canceled || !r.filePaths[0]) return null
  const text = await readFile(r.filePaths[0], 'utf8')
  const parsed = JSON.parse(text)
  if (parsed.schemaVersion !== 1) throw new Error('Unsupported project schema version')
  return { project: parsed, path: r.filePaths[0] }
})

function killRun(handle: RunHandle, signal: 'SIGINT' | 'SIGKILL' = 'SIGKILL') {
  if ('pid' in handle && typeof (handle as any).pid === 'number') {
    // node-pty IPty — kill via pid
    try { process.kill((handle as pty.IPty).pid, signal) } catch { /* already dead */ }
  } else {
    (handle as ChildProcessWithoutNullStreams).kill(signal)
  }
}

ipcMain.handle('idfStop', async (_e, runId: string) => {
  const handle = runs.get(runId)
  if (!handle) return { ok: false, reason: 'not running' }
  killRun(handle, 'SIGINT')
  setTimeout(() => { if (runs.has(runId)) killRun(runs.get(runId)!, 'SIGKILL') }, 1500)
  return { ok: true }
})

app.on('before-quit', () => {
  for (const handle of runs.values()) killRun(handle, 'SIGKILL')
})

app.whenReady().then(() => {
  if (process.platform === 'darwin' && existsSync(ICON_PATH)) app.dock?.setIcon(ICON_PATH)
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
