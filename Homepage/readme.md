### CeMoQu – Homepage
This file defines the homepage for CeMoQu (Cerebral Motion Quantitative), a browser-based suite for quantitative assessment of motor and speech disturbances. The page serves as a local launch hub for individual diagnostic tests and a metadata entry point for each session.

##What This Page Does
The homepage provides three main functions:
1. Navigation
   A fixed header displays the application name, version, and links to Home, Past Results, and Help.
2. Test Launching
   The main section presents three test cards (speech, target touch, and line drawing). Each card briefly describes the task and links to its corresponding test module. Clicking a card opens the test in the browser.
3. Participant Metadata Collection
   A form allows entry of participant and session information. A unique session ID is automatically generated on page load. The data can be saved locally as a JSON file and is intended to accompany exported test results.

## How It Works
The page is implemented as a single static HTML file with embedded CSS and JavaScript.
* CSS defines a dark, low-distraction interface suitable for clinical or research use.
* HTML structures the header, test cards, metadata form, and footer.
* JavaScript runs entirely in the browser to:
    * Generate a unique session ID
    * Collect form data
    * Download metadata as a JSON file
    * Reset the form when cleared
No external services are used, and no data is uploaded.

## Design Philosophy
* Local-first and privacy-preserving
* No backend or framework dependencies
* Modular structure (each test is independent)
* Intended for research, prototyping, and clinical evaluation workflows

## Version
CeMoQu v0.1
All processing is performed locally in the browser.
