# Contributing to Circuitiny

Thanks for your interest in contributing. This document covers how to get a dev build running, where the code lives, and how to submit changes.

---

## Table of contents

1. [Prerequisites](#prerequisites)
2. [Getting started](#getting-started)
3. [Project layout](#project-layout)
4. [Running tests](#running-tests)
5. [Submitting a pull request](#submitting-a-pull-request)
6. [Adding a built-in component](#adding-a-built-in-component)
7. [Code style](#code-style)

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| pnpm | 9+ |
| macOS | 13+ (Windows/Linux untested) |

ESP-IDF is **not** required unless you are working on build/flash features.

---

## Getting started

```bash
git clone https://github.com/mfranzon/circuitiny.git
cd circuitiny
pnpm install
pnpm dev
```

`pnpm dev` starts the Electron app with hot-reload. Renderer changes reflect immediately; main-process changes require a restart.

To build a distributable:

```bash
pnpm dist:mac   # macOS .dmg
pnpm dist:win   # Windows installer
pnpm dist:linux # Linux AppImage
```

---

## Project layout

```
src/
  agent/      AI agent — tool definitions and orchestration loop
  catalog/    Component catalog loading and validation
  codegen/    ESP-IDF C project generation
  drc/        Design-rule checks (short circuits, missing power, etc.)
  panes/      React UI panels (3D view, schematic, code, terminal…)
  project/    Project file format — load, save, migrate
  sim/        Browser-side firmware simulation engine
  store.ts    Zustand global state
electron/     Main process — IPC handlers, serial port, IDF subprocess
tests/        Vitest unit tests (one file per subsystem)
resources/    Bundled assets (boards, default catalog entries)
```

---

## Running tests

```bash
pnpm test          # single run
pnpm test:watch    # re-runs on change
pnpm typecheck     # TypeScript — no emit, just type errors
```

Tests live in `tests/` and are colocated by subsystem (`catalog.test.ts`, `drc.test.ts`, etc.). Add a test for any non-trivial logic change before opening a PR.

---

## Submitting a pull request

1. Fork the repo and create a branch from `main`.
2. Make your changes and add or update tests where relevant.
3. Run `pnpm typecheck && pnpm test` — both must pass.
4. Open a PR with a clear description of what changed and why.

Keep PRs focused. A bug fix should not include unrelated refactoring. If you are unsure whether a larger change is welcome, open an issue first to discuss it.

---

## Adding a built-in component

User-installed components live in `~/.circuitiny/catalog/` (see the README). If you want to contribute a component that ships with the app, place it under `resources/catalog/` following the same folder structure:

```
resources/catalog/
└── my-component/
    ├── component.json
    └── model.glb
```

Make sure `component.json` passes the schema validation checked by `pnpm test` (`catalog.test.ts`).

---

## Code style

- TypeScript throughout — no `any` unless unavoidable.
- No comments that describe *what* the code does; only add one when the *why* is non-obvious.
- Prefer small, focused functions over large ones.
- No half-finished implementations — if a feature is not ready to ship, keep it off the branch.

There is no linter config yet. Match the style of the surrounding file.
