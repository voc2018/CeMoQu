# CeMoQu: Python recalculation of the simulated verification

This folder lets anyone check the CeMoQu verification result: **85 of 85 simulated scenarios gave the expected score**.

The scoring rules were written again in a separate Python program. The program reads the records the website saved for each simulated scenario, calculates every score again, and compares three scores:

- **Expected:** the score set when the scenario was designed
- **Website:** the score the CeMoQu website calculated
- **Python:** the score this program calculates

## Files

| File | What it is |
|---|---|
| `recalculate.py` | The Python program |
| `CeMoQu_python_recalculation_results.csv` | The result: one row per scenario |
| `data/syn_part01.json` … `syn_part04.json` | The input: stored simulation records (4 files, 26 MB) |

The input files hold all 85 scenarios and 285 trials: the raw CSV of each trial, the trajectory image, and the measures and scores the website saved. All data are simulated. No patient data are included.

## How to run

You need Python 3.8 or later. Nothing else needs to be installed.

```
cd research/verification
python recalculate.py data
```

Expected output:

```
LD: 25/25 match
RT: 25/25 match
SD: 35/35 match
Total: 85/85 match
LD turn amplitude, max difference from website: 0.0006 cm (100 trials)
RT arrival error, max difference from website: 0.0005 cm (108 trials)
Saved CeMoQu_python_recalculation_results.csv
```

To save the result under another name, add it at the end:

```
python recalculate.py data my_results.csv
```

## The result file

| Column | Meaning |
|---|---|
| `module` | LD (Line Drawing), RT (Random Target) or SD (Speech Disturbance) |
| `scenario_id` | Scenario number, for example SYN-P001 |
| `scenario_description` | What the scenario simulates |
| `expected_score` | Score set when the scenario was designed |
| `website_score` | Score calculated by the website |
| `python_score` | Score calculated by this program |
| `all_three_match` | `yes` when all three scores are the same |

## What the program calculates

**Line Drawing (LD).** From the raw touch points, it measures how far the line moves sideways from the guide and finds each turn larger than the tolerance. It drops the largest 5 % of turns and takes the mean amplitude. Mean below 2 cm scores 1, below 5 cm scores 2, otherwise 3; no turn scores 0. Failure limits (start fails, time, out of bounds, discontinuities) score 4. The hand score is the mean of trials 3 to 5.

**Random Target (RT).** From the raw camera frames, it removes one-frame tracking spikes only, finds the arrival point (speed below 8 % of peak for 100 ms), and measures the distance to the target. Below 1 cm scores 0, below 5 cm scores 1, below 15 cm scores 2, otherwise 3. The hand score is the mean of the last 3 tracked movements. If half or more movements were not tracked, the hand scores 4.

**Speech Disturbance (SD).** From the stored measures, it scores reading, Pa-ta-ka and sustained vowel on 0 to 6 steps, combines them as 50 % reading, 40 % Pa-ta-ka and 10 % vowel, and applies the reading floor (reading 4 or more sets the minimum score).

The full rules are on the Research page: <https://cemoqu.com/research/>

## What this check shows, and what it does not

- **It shows** that the website calculates its scoring rules correctly, and that anyone with the stored records can get the same scores again.
- **It does not show** that the rules are clinically right. This program uses the same rules as the website, so it tests the code, not the rules.
- **Some values come from stored records.** LD failure counts and SD measures were read from the saved values, not recalculated from raw signals. SD was tested without audio.
- **Sitting Balance (ST)** was not part of this verification.
- **No patient data.** Agreement with clinician-rated SARA has not been tested.

## Contact

Life and Research Center, Voice of Calling (nonprofit) · <https://cemoqu.com>
