# Reading Passage Design Rationale (CeMoQu SD — Standard Reading Passage task)

This document explains why the three reading passages used in the SD (Speech Disturbance) module's
Standard Reading Passage task were written the way they were, and what evidence was used to design
and verify them. It is intended to be pulled into the CeMoQu student training manual when this
material is presented.

## Why not reuse an existing standard passage (Rainbow, Grandfather, Caterpillar)?

Standardized reading passages such as the **Rainbow Passage** (Fairbanks, 1960), the **Grandfather
Passage** (attributed to Van Riper, per Reilly & Fisher, 2012), the **North Wind and the Sun**
(International Phonetic Association, 1989), and **The Caterpillar** (Patel et al., 2013) are the
established tools for eliciting connected speech in motor speech / dysarthria assessment. They were
not reused here for two reasons:

1. **Topical fit.** The project wanted content with an energizing, motivational narrative rather than
   the descriptive/expository style of the existing passages (a rainbow forming, a grandfather's
   routine, a caterpillar). None of the standard passages fit that brief.
2. **Copyright / reproduction.** Reusing the exact text of a copyrighted or closely-guarded passage
   verbatim was avoided; instead, new passages were written from scratch following the same design
   principles reported in the literature for these tools.

## Design principles followed (from the literature)

- **Phonemic and phonetic coverage.** The literature evaluates these passages on two related but
  distinct properties: whether they contain the individual phonemes of English at all ("phonemic
  coverage"), and whether they contain those phonemes across a wide range of positional/allophonic
  contexts — e.g. a consonant in word-initial vs. word-medial vs. word-final position, in a stressed
  vs. unstressed syllable ("phonetic coverage"). Bunta et al. (2022, ASHA Perspectives) analyzed 466
  allowable consonant contexts and found the standard passages covered them only partially: 24.89%
  for The Caterpillar, 27.25% for The Grandfather Passage, and 35.84% for The Rainbow Passage. A
  separate analysis (Journal of Speech, Language, and Hearing Research, 2020) found The Caterpillar
  gave the best match to the phoneme *frequency distribution* of natural spoken American English
  among the three, though none were close to ideal. The shared takeaway from both papers: **no
  existing standard passage is fully phonetically balanced, and there is room for new passages.**
- **Sentence-length variety.** The Grandfather Passage averages roughly 16.5 words per sentence
  (Patel et al., 2013); passages that mix short and long sentences allow assessment of prosody,
  breath support, and pacing across different sentence structures rather than a single rhythm.
- **Reading time.** A passage that takes roughly 20–30 seconds to read aloud at a typical pace fits
  a single standardized recording without requiring the speaker to sustain effort for an extended
  period, and matches this task's 30-second cap.
- **Accessible, broadly relatable content.** Passages should avoid rare vocabulary, culturally or
  religiously specific content, and gendered assumptions where unnecessary (a concern also raised in
  a 2023 AJSLP paper proposing inclusive edits to the Rainbow Passage itself).

## What was actually done

Three original passages were written to an energizing/motivational theme (a mountain climb, a
basketball comeback, a pre-dawn training run), each averaging 3 sentences of mixed short/medium/long
length, in the 60–70 word range (≈20–25 seconds at typical adult oral reading rates of 150–183 wpm,
per Brysbaert's 2019 meta-analysis of oral reading rate).

Each passage was then **verified computationally**, not just by ear: every word was looked up in the
**CMU Pronouncing Dictionary** (the standard machine-readable phonemic lexicon used in speech and
NLP research) via the `pronouncing` Python library, and the resulting ARPAbet phoneme sequences were
compared against the 39-phoneme General American English inventory (24 consonants + 15 vowels,
including diphthongs).

### Results (phonemic coverage — presence/absence of each phoneme, not positional-context coverage)

| Passage | Words | Phonemes covered | Missing |
|---|---|---|---|
| The Climb | 69 | 36 / 39 (92%) | JH, OY, ZH |
| One More Shot | 62 | 35 / 39 (90%) | CH, ER, Y |
| Before Sunrise | 62 | 35 / 39 (90%) | CH, JH, OY, UH |
| **All three combined** | — | **39 / 39 (100%)** | none |

Two words were added specifically to close the remaining gaps in the combined set: **"joy"** (adds
the OY diphthong, as in *boy*) at the end of *One More Shot*, and **"a treasure"** (adds ZH, the
rarest English consonant, as in *measure*) at the end of *Before Sunrise*. Both fit naturally into
the existing sentences without altering the narrative or requiring structural changes.

**Important caveat for the manual:** this is phoneme *presence* coverage (does the sound occur at
least once), which is a coarser measure than the positional/allophonic-context coverage used in the
Bunta et al. (2022) analysis of the standard passages. A full allophonic-context analysis (466
contexts, as in that paper) was not performed here — that would require a dedicated
positional-context classifier and is a reasonable next step if this task set is used in a formal
publication. What can be said with confidence is that, at the phoneme level, the three passages
together cover the full General American English phoneme inventory, and individually each covers a
comparable or larger share of it than reported for The Caterpillar (24.89% context coverage) or The
Grandfather Passage (27.25%) — though again, coverage metrics are not directly comparable across the
two different ways of counting "coverage."

### Why three passages instead of one, and why random selection

A single fixed passage means a participant who repeats the task (e.g., retesting the same day, or a
student practicing the interface) reads identical text every time, which risks rehearsal effects. One
of three passages is chosen at random each time the Standard Reading Passage task is entered
(including on re-record), and the specific passage shown is recorded in that attempt's exported data
so scoring (WER, word counts) is always computed against the passage actually displayed.

## References

- Fairbanks, G. (1960). *Voice and Articulation Drillbook* (2nd ed.). Harper & Row. [Source of the
  Rainbow Passage.]
- Patel, R., Connaghan, K., Franco, D., Edsall, E., Forgit, D., Olsen, L., Ramage, L., Tyler, E., &
  Russell, S. (2013). "The Caterpillar": A novel reading passage for assessment of motor speech
  disorders. *American Journal of Speech-Language Pathology*, 22(1), 1–9.
- Reilly, J., & Fisher, J. L. (2012). Sherlock Holmes and the strange case of the missing
  attribution: A historical note on "The Grandfather Passage." *Journal of Speech, Language, and
  Hearing Research*, 55, 84–88.
- Bunta, F., et al. (2022). Examination of consonantal phonetic coverage in standard reading
  passages. *Perspectives of the ASHA Special Interest Groups*.
- Analysis of Phonetic Balance in Standard English Passages. (2020). *Journal of Speech, Language,
  and Hearing Research*.
- Brysbaert, M. (2019). How many words do we read per minute? A review and meta-analysis of reading
  rate. *Journal of Memory and Language*, 109.
- CMU Pronouncing Dictionary, Carnegie Mellon University (used here via the `pronouncing` Python
  library) — standard machine-readable phonemic lexicon for General American English.
