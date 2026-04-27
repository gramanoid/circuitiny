# Changelog

All notable changes to Circuitiny will be documented in this file.

## [0.0.1] - 2026-04-27

### Added
- 3D circuit view: drag components onto the board, click pins to wire them
- AI agent: describe a circuit in plain English and get components placed, wired, and firmware written automatically
- Supports Anthropic Claude, OpenAI, and local Ollama models
- Firmware simulation: behaviors run in the browser with real-time GPIO animation, no hardware required
- Code generation: live ESP-IDF 5 C project (app_main.c, CMakeLists.txt, sdkconfig.defaults) from project state
- Build and flash pipeline: one-click idf.py build, flash, and serial monitor streamed inside the app
- Schematic view of the circuit with standard symbols
- Behaviors DSL: boot, timer, gpio_edge, and wifi_connected triggers with set_output, toggle, log, delay, and sequence actions
- Design rule checks (DRC): strapping pins, flash pins, short circuits, current budget
- Extensible component catalog: drop a component.json + .glb folder into ~/.circuitiny/catalog/
- Multi-board support: ESP32-DevKitC v4, ESP32-S3-DevKitC-1, ESP32-C3-DevKitM-1, ESP32-C6-DevKitC-1, XIAO ESP32-S3
- Catalog Editor: click on a 3D model to place pins visually and save to catalog
- Project save/open as .circuitiny.json

### Known Limitations
- WiFi and MQTT firmware generation is not yet implemented
- Windows and Linux not tested
