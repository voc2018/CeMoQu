# RT Task Design Rationale

This document explains **why the RT protocol is designed this way**: why the task uses random targets, why it includes both Cursor Mode and Camera Mode, why the target distances differ by mode, why the last three movements matter, and why the current score focuses on dysmetria with an experimental tremor extension.

It is the companion to [`METHODOLOGY.md`](./METHODOLOGY.md), which explains how measurements and scores are computed.

---

## Why not simply reproduce the official SARA Finger Chase exam?

The official SARA Finger Chase item is clinician-administered. A participant points repeatedly toward the examiner's finger, and the clinician scores the amount of dysmetria observed.

That clinical exam is meaningful, but it is not directly repeatable in a browser because the examiner's finger position, distance, movement, viewing angle, timing, and scoring judgment are not standardized by the software.

RT makes a deliberate tradeoff:

- it uses standardized screen targets instead of an examiner's moving finger,
- it records objective time-stamped movement samples,
- it makes repeated assessments easier,
- and it exports raw and summary data for review.

The cost of this standardization is that RT is not the official SARA Finger Chase exam. Its score remains provisional until validated against clinician-rated SARA data.

---

## Why random targets?

Random targets reduce memorization and fixed-pattern behavior. If the target sequence were always the same, repeated attempts could become a practiced motor pattern rather than a measure of current pointing control.

RT generates a new target sequence at the start of each hand run:

```text
right-hand run → new target sequence
left-hand run  → new target sequence
new Start Test → new target sequence
```

The sequence is constrained so that consecutive targets are physically meaningful distances apart. The randomization is therefore not completely free; it is bounded by calibration, target size, edge margins, and mode-specific distance rules.

---

## Why two modes?

RT has two measurement modes because the project needs both accessibility and movement-observation capability.

### Cursor Mode

Cursor Mode supports mouse, trackpad, and touchscreen use. It is easier to run, does not require camera permission, and can work in settings where camera use is difficult or not allowed.

However, Cursor Mode measures the pointer or touch location, not a visually tracked fingertip. It is therefore best understood as a direct pointing/touchscreen task rather than a camera-observed hand-movement task.

### Camera Mode

Camera Mode uses webcam-based hand tracking. It is closer to the idea of observing a visible pointing movement, because the app follows the index finger rather than a cursor.

However, Camera Mode is more technically fragile. It depends on lighting, camera quality, frame rate, hand pose, distance from the camera, and MediaPipe tracking stability.

For that reason, Cursor Mode and Camera Mode are intentionally separated at the measurement level.

> **Measurement is mode-specific. Analysis is shared.**

---

## Why separate calibration pipelines?

Cursor and Camera measurements are physically different.

Cursor Mode needs to know how many screen pixels correspond to one centimeter on the display. It therefore uses a ruler-measured calibration bar.

Camera Mode needs to know how many camera pixels correspond to one centimeter at the participant's current hand distance. It therefore uses the participant's actual index-finger length and camera landmark measurement.

Using one shared calibration value for both modes would be wrong because screen pixels and camera pixels do not represent the same physical space.

---

## Why Camera Auto Calibration uses four measurements

A single camera calibration capture can be unstable. The apparent pixel length of a finger can change because of:

- distance from the camera,
- hand angle,
- partial landmark detection,
- lighting,
- frame-to-frame jitter,
- right/left hand differences,
- and participant movement during calibration.

RT therefore uses four captures:

```text
Right hand
Left hand
Right hand
Left hand
```

The app computes a pixels-per-centimeter value for each capture and uses the average of the four values as the final camera calibration.

Intermediate values are not shown as the main user-facing result because they may invite over-interpretation. The final average is the value used for the test.

---

## Why Cursor uses at least 20 cm and Camera uses 30 cm

Camera Mode preserves the original 30 cm movement-distance logic because it was developed and tested with webcam-based reaching in mind.

Cursor Mode uses a smaller minimum distance of 20 cm because physical touchscreen and monitor size can limit how far apart targets can be placed while keeping all targets visible and reachable.

The difference is intentional:

| Mode | Distance rule | Reason |
|---|---|---|
| Cursor Mode | Consecutive targets at least 20 cm apart | Works better within a physical screen/touch area |
| Camera Mode | Consecutive targets exactly 30 cm apart | Preserves the camera reaching protocol and larger movement amplitude |

The two modes should not be assumed equivalent until direct comparison data are collected.

---

## Why five movements per hand?

The default five-movement structure follows the logic of the SARA Finger Chase item, where repeated pointing movements are observed and the final score is based on performance across the later movements.

RT uses five target windows per hand by default and computes the current SARA-aligned score from the last three valid movements. This is intended to reduce the influence of early adjustment while still keeping the test short.

This is an engineering interpretation of the SARA-style task structure and requires clinical comparison before being treated as a validated replacement.

---

## Why right hand and then left hand?

RT supports right-hand only, left-hand only, and bilateral testing. The default is right hand followed by left hand.

Testing both hands allows the module to capture side-to-side differences and provides a more complete picture of upper-limb coordination.

When both hands are selected, each hand receives its own target sequence. The second hand does not simply reuse the first hand's target positions.

---

## Why arrival-based dysmetria instead of final-frame error?

A fixed target window creates an important measurement problem. The final frame may reflect a late correction, a drift, a hold tremor, or tracking noise rather than the end of the reaching movement itself.

RT therefore estimates an arrival point using velocity. The arrival point is intended to represent when the reaching movement ends and the hold phase begins.

Dysmetria is then measured at that arrival point:

```text
arrival error = distance from arrival point to target center
```

Final-frame distance is still exported for transparency, but it is not the main SARA-aligned dysmetria measurement.

---

## Why include tremor/post-arrival instability?

SARA Finger Chase primarily describes dysmetria. However, after the participant reaches a target, the post-arrival hold phase may contain clinically relevant instability, drift, or tremor-like movement.

RT therefore exports an experimental post-arrival P95 radial deviation and converts it into a tremor severity bucket. This is used in the experimental CeMoQu weighted score but should be clearly separated from the SARA-aligned dysmetria score.

Current default experimental weight:

```text
Dysmetria 60% + Tremor 40%
```

This weighting is a provisional engineering choice. It is adjustable in the RESEARCH tab and must be validated before clinical use.

---

## Why reaction time and time-inside are measured but not scored yet

Reaction time and time inside the target are useful quantitative measures. They may reflect attention, motor planning, response initiation, accuracy maintenance, or device/input differences.

However, they are not part of the current SARA Finger Chase score estimate because their relationship to clinician-rated SARA Finger Chase severity has not yet been calibrated.

They are therefore exported as research metrics rather than included in the current final score.

---

## Why quality flags do not automatically assign clinical severity

Tracking failure, missing samples, or low camera FPS are technical problems. They should not automatically become high clinical severity.

For example, if Camera Mode loses the hand, the app should not automatically assign SARA score 4. It should mark the automated score as unavailable or low-confidence and require review or retesting.

This distinction protects the research dataset from confusing device failure with patient impairment.

---

## References and source basis

The current RT design is based on three levels of support:

1. **SARA task structure** — the clinical Finger Chase concept and dysmetria-based scoring frame.
2. **Movement-kinematics engineering** — velocity-based arrival detection, target windows, and time-stamped coordinate analysis.
3. **CeMoQu implementation decisions** — separate Cursor/Camera measurement pipelines, 20 cm Cursor spacing, 30 cm Camera spacing, and provisional dysmetria/tremor scoring.

Reference notes currently embedded in the code include:

- Schmitz-Hübsch et al. (2006), development of SARA, including Finger Chase and Nose-Finger scoring concepts.
- Movement onset/offset approaches using a low percentage of peak velocity.
- Upper-limb ataxia literature using post-arrival or terminal movement measures.
- Tremor-frequency considerations used to justify the low-FPS caution for camera-based tremor estimates.

Before publication, these references should be checked against the final bibliography and formatted consistently with the broader CeMoQu manuscript/poster style.
