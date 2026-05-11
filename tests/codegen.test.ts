import { describe, it, expect } from 'vitest'
import { generate } from '../src/codegen/generate'
import { makeProject, makeSeedProject } from './helpers'
import type { Project } from '../src/project/schema'
import { catalog } from '../src/catalog'
import { CatalogTrustError, DraftCatalogPartError } from '../src/codegen/trust'

function seedWithBehaviors(): Project {
  return {
    ...makeSeedProject(),
    behaviors: [
      { id: 'on_boot', trigger: { type: 'boot' }, actions: [{ type: 'log', level: 'info', message: 'ready' }] },
      {
        id: 'on_press',
        trigger: { type: 'gpio_edge', source: 'btn1.a', edge: 'rising' },
        actions: [
          { type: 'set_output', target: 'led1.anode', value: 'on' },
          { type: 'log', level: 'info', message: 'pressed' },
        ],
      },
      {
        id: 'on_release',
        trigger: { type: 'gpio_edge', source: 'btn1.a', edge: 'falling' },
        actions: [{ type: 'set_output', target: 'led1.anode', value: 'off' }],
      },
    ],
  }
}

describe('codegen — includes', () => {
  it('blocks code generation when a project uses AI draft catalog parts', () => {
    catalog.registerComponent({
      id: 'draft-sensor',
      name: 'Draft Sensor',
      version: '0.1.0',
      category: 'sensor',
      model: '',
      pins: [{ id: 'sig', label: 'SIG', type: 'digital_io', position: [0, 0, 0], normal: [0, -1, 0] }],
      catalogMeta: { trust: 'ai-draft', confidence: 'low', renderStrategy: 'generic-block', reviewNotes: ['Review pinout before hardware use.'] },
    })
    try {
      const project = {
        ...makeProject(),
        components: [{ instance: 'sensor1', componentId: 'draft-sensor', position: [0, 0, 0] as [number, number, number], pinAssignments: {} }],
        nets: [],
      }
      expect(() => generate(project)).toThrowError(expect.objectContaining({
        name: 'DraftCatalogPartError',
        message: expect.stringMatching(/Review draft catalog parts/),
      }))
    } finally {
      catalog.removeComponent('draft-sensor')
    }
  })

  it('reports every AI draft catalog part blocking code generation', () => {
    catalog.registerComponent({
      id: 'draft-sensor',
      name: 'Draft Sensor',
      version: '0.1.0',
      category: 'sensor',
      model: '',
      pins: [{ id: 'sig', label: 'SIG', type: 'digital_io', position: [0, 0, 0], normal: [0, -1, 0] }],
      catalogMeta: { trust: 'ai-draft', confidence: 'low', renderStrategy: 'generic-block' },
    })
    catalog.registerComponent({
      id: 'draft-actuator',
      name: 'Draft Actuator',
      version: '0.1.0',
      category: 'actuator',
      model: '',
      pins: [{ id: 'in', label: 'IN', type: 'digital_in', position: [0, 0, 0], normal: [0, -1, 0] }],
      catalogMeta: { trust: 'ai-draft', confidence: 'low', renderStrategy: 'generic-block' },
    })
    try {
      const project = {
        ...makeProject(),
        components: [
          { instance: 'sensor1', componentId: 'draft-sensor', position: [0, 0, 0] as [number, number, number], pinAssignments: {} },
          { instance: 'actuator1', componentId: 'draft-actuator', position: [1, 0, 0] as [number, number, number], pinAssignments: {} },
        ],
        nets: [],
      }
      expect(() => generate(project)).toThrowError(expect.objectContaining({
        name: 'DraftCatalogPartError',
        message: expect.stringMatching(/draft-sensor[\s\S]*draft-actuator|draft-actuator[\s\S]*draft-sensor/),
      }))
    } finally {
      catalog.removeComponent('draft-sensor')
      catalog.removeComponent('draft-actuator')
    }
  })

  it('reports draft and missing catalog parts together when both are present', () => {
    catalog.registerComponent({
      id: 'draft-sensor',
      name: 'Draft Sensor',
      version: '0.1.0',
      category: 'sensor',
      model: '',
      pins: [{ id: 'sig', label: 'SIG', type: 'digital_io', position: [0, 0, 0], normal: [0, -1, 0] }],
      catalogMeta: { trust: 'ai-draft', confidence: 'low', renderStrategy: 'generic-block' },
    })
    try {
      const project = {
        ...makeProject(),
        components: [
          { instance: 'sensor1', componentId: 'draft-sensor', position: [0, 0, 0] as [number, number, number], pinAssignments: {} },
          { instance: 'missing1', componentId: 'missing-sensor', position: [1, 0, 0] as [number, number, number], pinAssignments: {} },
        ],
        nets: [],
      }
      expect(() => generate(project)).toThrowError(CatalogTrustError)
      expect(() => generate(project)).toThrowError(/draft-sensor/)
      expect(() => generate(project)).toThrowError(/missing-sensor/)
    } finally {
      catalog.removeComponent('draft-sensor')
    }
  })

  it('always includes freertos and nvs_flash headers', () => {
    const { files } = generate(makeProject())
    expect(files['main/app_main.c']).toContain('#include "freertos/FreeRTOS.h"')
    expect(files['main/app_main.c']).toContain('#include "nvs_flash.h"')
  })

  it('includes gpio.h when there are gpio_edge behaviors', () => {
    const { files } = generate(seedWithBehaviors())
    expect(files['main/app_main.c']).toContain('#include "driver/gpio.h"')
  })
})

describe('codegen — boot trigger', () => {
  it('emits inline log call in app_main for boot trigger', () => {
    const p = makeProject({
      behaviors: [{ id: 'b', trigger: { type: 'boot' }, actions: [{ type: 'log', level: 'info', message: 'hello world' }] }],
    })
    const { files } = generate(p)
    expect(files['main/app_main.c']).toContain('ESP_LOGI(TAG, "hello world")')
  })
})

describe('codegen — timer trigger', () => {
  it('emits a FreeRTOS task for timer behavior', () => {
    const p = makeProject({
      ...makeSeedProject(),
      behaviors: [{
        id: 'blinker',
        trigger: { type: 'timer', period_ms: 500 },
        actions: [{ type: 'toggle', target: 'r1.in' }],
      }],
    })
    const { files } = generate(p)
    expect(files['main/app_main.c']).toContain('beh_blinker_task')
    expect(files['main/app_main.c']).toContain('pdMS_TO_TICKS(500)')
    expect(files['main/app_main.c']).toContain('xTaskCreate(beh_blinker_task')
  })
})

describe('codegen — gpio_edge trigger', () => {
  it('emits a polling task for gpio_edge behavior', () => {
    const { files } = generate(seedWithBehaviors())
    expect(files['main/app_main.c']).toContain('gpio_poll_PIN_BTN1_A_task')
    expect(files['main/app_main.c']).toContain('gpio_get_level(PIN_BTN1_A)')
  })

  it('configures edge source GPIO as INPUT with PULLUP', () => {
    const { files } = generate(seedWithBehaviors())
    const c = files['main/app_main.c']
    expect(c).toContain('gpio_set_direction(PIN_BTN1_A, GPIO_MODE_INPUT)')
    expect(c).toContain('gpio_set_pull_mode(PIN_BTN1_A, GPIO_PULLUP_ONLY)')
  })

  it('launches the polling task with xTaskCreate', () => {
    const { files } = generate(seedWithBehaviors())
    expect(files['main/app_main.c']).toContain('xTaskCreate(gpio_poll_PIN_BTN1_A_task')
  })

  it('emits rising-edge guard (cur_ == 1) for rising behavior', () => {
    const { files } = generate(seedWithBehaviors())
    expect(files['main/app_main.c']).toContain('if (cur_ == 1)')
  })

  it('emits falling-edge guard (cur_ == 0) for falling behavior', () => {
    const { files } = generate(seedWithBehaviors())
    expect(files['main/app_main.c']).toContain('if (cur_ == 0)')
  })

  it('merges two behaviors on the same pin into a single task', () => {
    const { files } = generate(seedWithBehaviors())
    const matches = files['main/app_main.c'].match(/gpio_poll_PIN_BTN1_A_task/g)
    // definition + one xTaskCreate call = 2 occurrences
    expect(matches?.length).toBe(2)
  })
})

describe('codegen — pin resolver', () => {
  it('resolves set_output through a passive (led1.anode → GPIO16)', () => {
    const { files } = generate(seedWithBehaviors())
    // led1.anode traces through r1 to board.gpio16 = 16
    expect(files['main/app_main.c']).toContain('gpio_set_level(16, 1)')
    expect(files['main/app_main.c']).toContain('gpio_set_level(16, 0)')
  })

  it('defines PIN macro for directly-wired pins', () => {
    const { files } = generate(seedWithBehaviors())
    expect(files['main/app_main.c']).toContain('#define PIN_BTN1_A 4')
    expect(files['main/app_main.c']).toContain('#define PIN_R1_IN 16')
  })
})

describe('codegen — gpio direction', () => {
  it('configures output component pin (digital_in type) as GPIO_MODE_OUTPUT', () => {
    // r1.in is digital_in (resistor receives from MCU) → MCU GPIO = OUTPUT
    const p = makeSeedProject()
    const { files } = generate(p)
    expect(files['main/app_main.c']).toContain('gpio_set_direction(PIN_R1_IN, GPIO_MODE_OUTPUT)')
  })
})

describe('codegen — CMakeLists', () => {
  it('always requires driver and nvs_flash', () => {
    const { files } = generate(makeProject())
    expect(files['main/CMakeLists.txt']).toContain('"driver"')
    expect(files['main/CMakeLists.txt']).toContain('"nvs_flash"')
  })
})

describe('codegen — sdkconfig.defaults', () => {
  it('sets correct IDF target', () => {
    const p = makeProject({ board: 'esp32s3-devkitc-1', target: 'esp32s3' })
    const { files } = generate(p)
    expect(files['sdkconfig.defaults']).toContain('CONFIG_IDF_TARGET="esp32s3"')
  })

  it('sets FREERTOS_HZ=1000 on all boards', () => {
    const { files } = generate(makeProject())
    expect(files['sdkconfig.defaults']).toContain('CONFIG_FREERTOS_HZ=1000')
  })

  it('sets correct CPU frequency for esp32', () => {
    const { files } = generate(makeProject())
    expect(files['sdkconfig.defaults']).toContain('CONFIG_ESP32_DEFAULT_CPU_FREQ_240=y')
  })

  it('enables USB CDC for S3 board', () => {
    const p = makeProject({ board: 'esp32s3-devkitc-1', target: 'esp32s3' })
    const { files } = generate(p)
    expect(files['sdkconfig.defaults']).toContain('CONFIG_ESP_CONSOLE_USB_CDC=y')
  })
})
