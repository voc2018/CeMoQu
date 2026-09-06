# CeMoQu Design Observations for SD

Working observations from the supplied LD (September 4, 2026), RT (September 5, 2026), and read-only shared files. These are evidence-based implementation notes, not yet an official design system.

- **Color roles:** very dark navy page background; slightly lighter navy work surfaces; blue-to-cyan primary gradient; cyan for active labels; green for success; amber for caution; red for recording/error; muted blue-gray secondary text.
- **Typography:** Inter is consistent. Page title is compact rather than oversized. Section labels are small, uppercase, letter-spaced, and cyan. Body text stays restrained and low contrast until action is required.
- **Buttons:** compact rounded rectangles in module workspaces; one visually dominant blue/cyan primary action; transparent or dark bordered secondary actions; destructive/error states use red.
- **Cards and borders:** recent modules avoid excessive nested floating cards. The main workspace uses one thin blue border and approximately 12 px corner radius. Internal sections are separated with subtle borders.
- **Page width:** recent LD and RT modules use the available desktop width with approximately 16 px side padding instead of the older centered 1024 px card.
- **Main/secondary relationship:** LD and revised RT use a 7:3 desktop grid. The experimental canvas is visually dominant; the side area contains setup, progress, settings, or results.
- **Spacing rhythm:** topbar-to-workspace gap is approximately 12 px; side sections use approximately 16 px horizontal padding; compact 6–10 px gaps group related controls.
- **Test states:** large centered countdown overlay; active state has one clear focal point; status remains concise and persistent.
- **Result hierarchy:** the clinical/provisional score receives the strongest emphasis, while detailed metrics use compact rows lower in the hierarchy.
- **Warnings:** success, caution, and error use restrained tinted backgrounds and semantic colors rather than large decorative alerts.
- **TEST/RESEARCH organization:** revised RT separates participant actions from exports, settings, and technical details with a two-tab side panel. SD follows that pattern.
- **Responsive behavior:** supplied modules collapse the 7:3 workspace near 900 px. Controls wrap and content becomes a vertical flow without horizontal scrolling.
- **Accessibility:** visible countdown is not dependent on sound; status regions use text plus color; form elements have labels; touch targets remain usable; muted text retains readable size.
