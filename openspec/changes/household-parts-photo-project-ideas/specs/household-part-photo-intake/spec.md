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
- **THEN** the system SHALL discard the raw image and retain transient candidate results for the current session.

#### Scenario: Session ends without saving

- **WHEN** the learner ends the session without explicitly saving
- **THEN** transient candidate results SHALL be automatically discarded.

#### Scenario: Learner saves an inventory

- **WHEN** the learner chooses to save an inventory
- **THEN** the system SHALL make clear what will be stored:
  - By default, saved inventory SHALL store only text metadata.
  - Raw images or cropped evidence images SHALL be stored only when the learner makes an explicit consent choice to include images.

### Requirement: Safety-sensitive items are flagged

The system SHALL identify and warn about parts that may involve unsafe voltage, current, heat, stored energy, mains power, or other safety-sensitive categories.

#### Scenario: Hazardous-looking part is detected

- **WHEN** the photo contains a part including but not limited to a relay, motor driver, battery, power supply, capacitor bank, mains module, or unknown power component
- **THEN** the system SHALL mark it as safety-sensitive and SHALL NOT recommend direct hardware wiring until an instructor, mentor, or automated safety verifier reviews the hazard details, approves or requires mitigation, and records the decision.
- **THEN** the part record SHALL track `safety_review_status` as `pending`, `approved`, or `rejected`, plus reviewer id, ISO-8601 UTC timestamp, and optional notes when review completes.
