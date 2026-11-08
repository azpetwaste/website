# Design source

`generator/` is the source for every page template. Edit the `.tpl.html` files and `parts.py` here, never the JSON in `src/boards/` by hand.

- `python3 export_site.py` writes the page templates to `src/boards/` (run from `design/generator/`, then `npm run build`).
- `python3 build.py` writes the same pages to the design canvas as artboards.
- Both scripts use absolute paths from the build workspace (`/home/claude/apw-site`, `/mnt/user-data/outputs/artifacts/...`). Change `OUT` at the top of each script if you run them somewhere else.

Logo files live in `static/assets/img/` (`logo-horizontal.svg`, `logo-horizontal-dark.svg`, `mark-round.svg`, `mark-round-dark.svg`). The full logo kit, with the stacked logo and the one color files, is in the Brand guidelines artifact.
