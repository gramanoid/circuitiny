## ADDED Requirements

### Requirement: Photo intake creates candidate inventory
The system SHALL allow the learner to provide a photo of household electronics parts and SHALL convert it into a reviewable candidate inventory instead of directly modifying the project.

#### Scenario: Learner uploads a parts photo
- **WHEN** the learner selects or drops an image into the photo intake flow
- **THEN** the system SHALL produce candidate parts with labels, confidence, visible evidence, and confirmation status without adding those parts to the circuit.

#### Scenario: Image cannot be analyzed
- **WHEN** image analysis fails or no electronics parts are detected
- **THEN** the system SHALL keep the existing project unchanged and explain how to retake the photo with better lighting, separation, or labels.

### Requirement: Learner confirms uncertain parts
The system SHALL require learner confirmation before photo-detected parts are used for project recommendation, recipe generation, or draft catalog creation.

#### Scenario: Candidate has low confidence
- **WHEN** a detected candidate has low confidence or multiple plausible identities
- **THEN** the system SHALL show "not sure" options and ask the learner to confirm, rename, or ignore the candidate.

#### Scenario: Candidate is confirmed
- **WHEN** the learner confirms a candidate identity
- **THEN** the system SHALL add the confirmed item to the working inventory with its source, confidence, quantity, and safety notes.

### Requirement: Photo privacy is explicit
The system SHALL avoid persisting user photos unless the learner explicitly saves an inventory or project that includes the image.

#### Scenario: Temporary analysis completes
- **WHEN** the photo analysis flow finishes without the learner saving an inventory
- **THEN** the system SHALL discard the raw image and retain only transient candidate results for the current session.

#### Scenario: Learner saves an inventory
- **WHEN** the learner chooses to save an inventory
- **THEN** the system SHALL make clear whether the raw image, cropped evidence images, or only text metadata will be stored.

### Requirement: Safety-sensitive items are flagged
The system SHALL identify and warn about parts that may involve unsafe voltage, current, heat, stored energy, or mains power.

#### Scenario: Hazardous-looking part is detected
- **WHEN** the photo contains a relay, motor driver, battery, power supply, capacitor bank, mains module, or unknown power component
- **THEN** the system SHALL mark it as safety-sensitive and SHALL NOT recommend direct hardware wiring until reviewed.
