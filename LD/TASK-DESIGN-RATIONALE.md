# LD Task Design Rationale

This document explains **why the LD protocol looks the way it does**: why a line-drawing task is used, why calibration is required, why five guided horizontal trials are emphasized, why P95 deviation is currently the primary scoring metric, and why the other movement metrics are retained for research.

It is the "why" companion to [`METHODOLOGY.md`](./METHODOLOGY.md), which explains how the measurements are computed, and [`README.md`](./README.md), which gives the general overview.

## Why use a line-drawing task?

A straight line is simple for the participant but useful for measurement. The intended action is clear: start at **S**, move along the guide line, and finish at **F**. This lets the app compare the participant's actual movement path against a known reference path.

The task is not intended to recreate an official SARA item exactly. Instead, it provides a standardized browser-based movement task that can repeatedly quantify tracing accuracy and movement quality in a way that can be exported and compared across sessions.

The clinical motivation is that cerebellar ataxia can affect coordination, smoothness, directional control, and endpoint accuracy. A line-tracing task makes those movement features visible as data.

## Why standardize the task instead of using open-ended drawing?

Open-ended drawing may reveal interesting movement patterns, but it is hard to compare across participants because each person draws a different shape. LD uses fixed reference paths so that each trial has a known geometry and a consistent target.

This supports:

- repeated measurements over time
- comparison between sessions
- comparison between participants
- exportable numeric metrics
- later validation against clinical ratings

The tradeoff is that a straight-line task is simpler than real-world movement and should not be treated as a full substitute for clinical examination.

## Why the horizontal five-trial sequence?

The current guided audio workflow is built around a five-trial horizontal test. Five repetitions provide more information than a single attempt while keeping the task short enough for a research prototype.

Five trials allow the reviewer to observe:

- consistency across repeated attempts
- whether performance improves after the first trial
- whether fatigue or attention affects later trials
- whether one failed trial is an isolated event or part of a pattern

The horizontal path was prioritized first because it is visually simple, easy to explain, and suitable for building a consistent guided sequence with recorded instructions.

Vertical and diagonal modes remain available for exploration but are not yet supported by the same complete recorded-guidance protocol.

## Why require physical calibration?

The app records movement in pixels or internal canvas units, but clinical interpretation requires real-world distance. A 50-pixel deviation has a different physical meaning on a small laptop screen than on a large monitor.

Calibration converts screen/canvas units into centimeters. Without calibration, the score would be device-dependent.

The current calibration design asks the user to measure an orange bar with a physical ruler because this is the simplest browser-only method to estimate real-world scale without special hardware.

## Why use P95 deviation as the current primary score metric?

The maximum deviation can be distorted by a single accidental spike, pointer jump, or brief off-path movement. Mean deviation can hide short but meaningful excursions if most of the trace is close to the line.

P95 deviation is a compromise:

- less sensitive to one extreme outlier than maximum deviation
- more sensitive to sustained error than mean deviation alone
- easy to explain and export
- stable enough for a first engineering score

For this reason, the current LD score is based on P95 deviation in centimeters.

This does not mean P95 is clinically validated. It is the current engineering choice and must be tested against real participant data and clinician-reviewed reference scores.

## Why keep max deviation, mean deviation, area, turns, reverses, and discontinuities?

The current score uses only P95 deviation, but the app records additional metrics because they may capture different movement patterns.

| Metric | Why it is retained |
|---|---|
| Max deviation | May capture large overshoot or extreme path error |
| Mean deviation | Summarizes average tracing accuracy |
| Deviation area | Combines distance from the line with how long the path stays off-line |
| Discontinuities | May indicate inability to complete the trace continuously |
| Vertical turns | May reflect tremor-like up/down correction during horizontal tracing |
| Horizontal reverses | May reflect hesitation, correction, or backtracking |
| Out-of-bounds | Captures major control or interface failure |
| Start fails | Captures difficulty initiating the trial correctly |
| Duration | May reflect speed, hesitation, or task burden |

These values are not yet weighted into the score because doing so without validation could make the score appear more clinically certain than it is.

## Why tolerance affects direction changes but not deviation scoring

The **Tolerance (cm)** input is currently used to decide when a small movement fluctuation becomes a meaningful direction reversal. It does not filter deviation samples and does not directly change the P95 score.

This separation is important:

- deviation should reflect the raw distance from the guide line
- direction-change counts need protection from tiny coordinate noise

The tolerance threshold is provisional and must be validated with real data.

## Why show both live results and exportable data?

Live results help the operator immediately see whether the trial worked. Exportable data preserves the actual measurements for later review, comparison, and validation.

The design goal is not only to show a score, but to make the path from movement to score transparent.

## Why label the score as provisional?

The current 0–4 score resembles a clinical severity scale in presentation, but its thresholds are engineering placeholders. It has not yet been calibrated against clinician-rated SARA performance or longitudinal outcomes.

Therefore, the score must be described as:

> a provisional research estimate, not a clinically validated diagnostic score.

## References and source basis

This LD rationale is currently based primarily on the implemented CeMoQu LD protocol and the general clinical motivation for quantifying upper-limb coordination in cerebellar ataxia. Before publication, the reference section should be expanded with the exact SARA reference, digital motor marker literature, and any CeMoQu/AtaxiaV internal validation materials used to justify the final task design.

Recommended references to verify and add before formal use:

- Schmitz-Hübsch, T., et al. (2006). Scale for the Assessment and Rating of Ataxia: development of a new clinical scale. *Neurology*.
- Ataxia Global Initiative / digital motor marker consensus materials relevant to quantitative motor assessment.
- CeMoQu / AtaxiaV prior abstracts, posters, or internal protocol documents relevant to line drawing and remote quantitative assessment.
