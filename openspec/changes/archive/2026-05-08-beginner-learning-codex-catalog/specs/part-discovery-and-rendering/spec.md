## ADDED Requirements

### Requirement: Intent-based part recommendation
The system SHALL recommend parts from a beginner's stated goal by matching the goal to local catalog entries first, then to external/draft options only when needed.

#### Scenario: Local part satisfies request
- **WHEN** the user asks for a part or project goal that can be satisfied by the built-in or hydrated local catalog
- **THEN** the system SHALL recommend local catalog parts with beginner explanations and required companion parts.

#### Scenario: No local part satisfies request
- **WHEN** the user asks for a part or project goal that is not covered by the local catalog
- **THEN** the system SHALL propose external or draft part options and clearly mark them as not yet reviewed.

### Requirement: Companion part detection
The system SHALL identify required or strongly recommended companion parts for recommended components.

#### Scenario: LED recommended
- **WHEN** the system recommends an LED
- **THEN** it SHALL include an appropriate series resistor and explain why it protects the LED and GPIO.

#### Scenario: I2C part recommended
- **WHEN** the system recommends an I2C component whose catalog metadata does not indicate built-in pull-ups
- **THEN** it SHALL recommend pull-up resistors or explain why they are not needed.

### Requirement: Part recommendation explanation
The system SHALL explain recommended parts using beginner-friendly concepts, including what the part senses or controls, why it matches the goal, what pins matter, voltage/current cautions, and what the learner will observe in simulation or hardware.

#### Scenario: Learner asks for non-obvious part
- **WHEN** the user asks for something goal-oriented such as "tell when my plant needs water"
- **THEN** the system SHALL recommend a suitable part family, explain tradeoffs, and identify a beginner-safe first build.

### Requirement: Draft catalog import
The system SHALL support creating draft catalog entries for approved parts that are not already in the catalog.

#### Scenario: User approves draft import
- **WHEN** the user approves importing a recommended part
- **THEN** the system SHALL create a draft catalog entry with id, name, category, pins, schematic symbol, source metadata, confidence state, and render strategy.

#### Scenario: Draft metadata is incomplete
- **WHEN** required catalog metadata is missing or low-confidence
- **THEN** the system SHALL keep the entry in draft state and direct the learner to review pins, voltage, companion parts, and rendering before trusting it.

### Requirement: Render strategy for recommended parts
The system SHALL render recommended parts using the best available visual representation and expose confidence when the representation is approximate.

#### Scenario: GLB exists
- **WHEN** a recommended part has a catalog GLB or approved imported GLB
- **THEN** the 3D canvas and palette thumbnail SHALL render that GLB.

#### Scenario: Primitive renderer applies
- **WHEN** a recommended part belongs to a supported common family without a GLB
- **THEN** the system SHALL render a primitive model with labeled pins and mark it as approximate if needed.

#### Scenario: No renderer applies
- **WHEN** no GLB or primitive renderer can represent the part
- **THEN** the system SHALL render a generic labeled block only as a low-confidence fallback and explain that the learner should review or import a better model.

### Requirement: Catalog review workflow
The system SHALL let the learner review and promote draft parts through the existing Catalog Editor workflow.

#### Scenario: Draft opened for review
- **WHEN** the user opens a draft part in Catalog Editor
- **THEN** the system SHALL show the part metadata, pins, schematic symbol, render preview, and review warnings.

#### Scenario: Draft promoted
- **WHEN** the learner confirms that required metadata and pins are correct
- **THEN** the system SHALL promote the draft part so it can be used like a normal catalog entry.
