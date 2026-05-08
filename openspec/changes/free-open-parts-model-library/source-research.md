## Source Inventory

This inventory separates "open and bundleable" from "free but local-import-only." The user requirement is no paid models.

| Source | URL | Formats | License/use | Current role |
| --- | --- | --- | --- | --- |
| KiCad packages3D | https://github.com/KiCad/kicad-packages3D | STEP, WRL | CC-BY-SA 4.0 with KiCad library exception; redistributed collections must keep license and attribution | Primary bundled/open source for common packages |
| KiCad packages3D source | https://gitlab.com/kicad/libraries/kicad-packages3D-source | FreeCAD/source files | CC-BY-SA 4.0 | Source/provenance for generated models |
| Antmicro hardware-components | https://github.com/antmicro/hardware-components | glTF, Blender, KiCad assets | Apache-2.0 | Primary direct glTF source |
| SparkFun KiCad Libraries | https://github.com/sparkfun/SparkFun-KiCad-Libraries | STEP, STP | CC-BY 4.0 | Primary open source for SparkFun/common beginner hardware |
| Digi-Key KiCad Library | https://github.com/Digi-Key/digikey-kicad-library | KiCad symbols/footprints in checked repo | CC-BY-SA 4.0 with exception; no model files found in checked tree | Part metadata and pin/footprint reference, not a model source until assets are verified |
| SnapMagic / SnapEDA | https://www.snapeda.com/ | STEP for 3D models | Free downloads, but redistribution must be reviewed per terms/model | Local-import-only unless license permits bundling |
| Ultra Librarian | https://www.ultralibrarian.com/ | STEP and many CAD formats | Free downloads, but redistribution must be reviewed per terms/model | Local-import-only unless license permits bundling |
| Sketchfab | https://sketchfab.com/features/gltf | GLB/glTF | Per-model CC/store license; authenticated downloads may be required | Optional direct GLB source after per-model license review |
| Manufacturer CAD pages | Vendor product pages | Usually STEP | Usually free but not automatically redistributable | Local-import-only, best for exact part numbers |

## Initial Counts

Counts were gathered from public repository trees on 2026-05-09.

| Source | Count | Notes |
| --- | ---: | --- |
| KiCad packages3D | 12,378 | STEP/WRL paths from the public GitHub tree |
| Antmicro hardware-components | 735 | glTF model entries under `gltf-models` |
| Antmicro hardware-components | 2,733 | Blender source models under `blender-models` |
| SparkFun KiCad Libraries | 324 | STEP/STP model assets under `3dmodels` |
| Digi-Key KiCad Library | 0 | No STEP/STP/WRL/GLB assets found in checked GitHub tree |

## Beginner Starter Pack Candidates

Prioritize parts that help a learner recognize what to buy, wire, and test in real life:

- LEDs: 3mm/5mm red, green, yellow, blue, RGB LED, LED strip segment.
- Resistors: axial resistors with color bands for 220R, 330R, 1K, 4.7K, 10K.
- Capacitors: 100nF ceramic, 10uF/100uF electrolytic, polarity markings.
- Inputs: 6mm tactile button, slide switch, potentiometer, rotary encoder.
- Outputs: passive buzzer, active buzzer, relay module, small DC motor, servo.
- Sensors: photoresistor, DHT-style temperature/humidity sensor, PIR motion sensor, capacitive soil moisture sensor, ultrasonic distance sensor.
- Displays: SSD1306 OLED, I2C LCD backpack, 7-segment display.
- Power/protection: battery holder, barrel jack, USB connector, regulator module, diode.
- Wiring aids: breadboard, pin headers, JST connectors, screw terminals, Dupont jumper wire ends.

## Import Policy

- Bundle only `bundled-ok` assets and retain license/attribution files.
- Offer `local-import-only` assets as instructions or user-approved downloads, not as shipped app assets.
- Block paid assets, ambiguous licenses, non-downloadable previews, and any source that requires bypassing authentication.
- Store each imported model with source URL, license URL, attribution, retrieved date, checksum, original format, conversion tool, scale, dimensions, and review state.
