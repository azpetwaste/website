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
- Seals: the round orange rosette (`look.seal_svg`) for Bonded, Insured, Background checked, and the heart one for Family owned.
- Boxes are for things you can tap (buttons, plan rows, town chips). Lists get thin rules, not cards. Corners are 12 px on controls.
- Not used: small caps labels above headings, a colored period after headings, big number tiles, pill buttons, fade in on scroll, dashed lines, the middle dot between words, arrows after link text. `npm run check` guards a few of these.
- The weather sky (Nov 13, 2026): the desert strip above the footer follows the real weather over Verrado. `/api/weather` (National Weather Service, no key, kept 10 minutes) sets `data-wx` on `<html>`: `clear`, `part`, `cloud`, `rain`, `storm` or `dust`, plus `data-wxn` at night. Tapping the sky shows one line about it. It is a quiet secret: no label, no button, nothing that points at it. With no answer the page keeps its plain sun. To see one sky by hand add `?sky=rain` (and `&night=1`) to a page address. Art is `_WX_SKY` and `_WX_FRONT` in `parts.py`, CSS is `.wx-*` in `look.py`, the script is the last block of `src/runtime/apw.js`.

Logo files live in `static/assets/img/` (`logo-horizontal.svg`, `logo-horizontal-dark.svg`, `mark-round.svg`, `mark-round-dark.svg`). The full logo kit, with the stacked logo and the one color files, is in the Brand guidelines artifact.
