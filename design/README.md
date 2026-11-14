# Design source

`generator/` is the source for every page template. Edit the `.tpl.html` files, `parts.py` and `look.py` here, never the JSON in `src/boards/` by hand.

- `look.py` is the look of the public site: the font, colors, buttons, and the layout CSS for the home and town pages. Read the note at the top before you change anything.
- `parts.py` holds the shared markup pieces (header, footer, seals, questions, price table), the copy lists and the page logic.
- Run `APW_BOARDS=../../src/boards/ python3 export_site.py` from `design/generator/` to write the page templates to `src/boards/`. Then `npm run build` and `npm run check` from the repo root.
- `python3 build.py` writes the same pages to the design canvas as artboards. It uses an absolute path from the old build workspace. Change `OUT` at the top if you run it.

## The look in short (Nov 2026, "yard sign")

- Every screen reads like a yard sign: one message, big type, flat color. A third grader should know what the page is in two seconds.
- Colors: navy `#0A0F24` (page), deep navy `#070B1B` (footer, seals strip), orange `#FF4A1C`, cream `#F6F4EF`, ink `#0E1430` (words on orange or cream). No gradients, no glow.
- One font: Archivo, the logo's typeface, from `static/assets/fonts/archivo-var-v1.woff2`. Headlines are narrow and heavy (`font-stretch` 66 to 74, weight 850 to 900). Buttons and small headings are 86 to 90. Reading text is 104, weight 400.
- Real gate photos are shown as prints: cream border, a time strip under the photo, the orange GATE LATCHED stamp (`.print`, `.stamp`). Cream is for paper things only: prints, the sale coupon, the commercial visit report.
- Real photos from the shoot (`static/assets/img/photos/`) are shown flat with 6 px corners and no frame (`.pho`, `pic()` in `parts.py`). Only gate photos get the print and the stamp.
- Seals: the round orange rosette (`look.seal_svg`) for Bonded, Insured, Background checked, and the heart one for Family owned.
- Boxes are for things you can tap (buttons, plan rows, town chips). Lists get thin rules, not cards. Corners are 12 px on controls.
- Not used: small caps labels above headings, a colored period after headings, big number tiles, pill buttons, fade in on scroll, dashed lines, the middle dot between words, arrows after link text. `npm run check` guards a few of these.

Logo files live in `static/assets/img/` (`logo-horizontal.svg`, `logo-horizontal-dark.svg`, `mark-round.svg`, `mark-round-dark.svg`). The full logo kit, with the stacked logo and the one color files, is in the Brand guidelines artifact.
