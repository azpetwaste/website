# Archive

Sections taken off the site that Joe may want back.

- **Yard game ("Watch us scoop your yard", the Try it section).** Taken off the home page Nov 9, 2026. The code still lives in `design/generator/yard.py`. To bring it back, put the line `@@YARD_SECTION@@` back in `design/generator/main.tpl.html`, right before the How it works section, then export and build.
- **Home page promise receipt.** `home-promise-receipt.html` in this folder.
- **The animated visit (the drawn street scene with the truck, in How it works).** Taken off the home page Nov 15, 2026, when Joe sent real video. The phone with the videos took its spot. The code still lives in `design/generator/scene.py` and its frame styles are still in `look.py` (`SCENE_FIX_CSS`). To bring it back, in `design/generator/main.tpl.html`: add `@@SCENE_CSS@@` to the style block, put `<div class="vsw"><div class="{{ vsClass }}">@@SCENE@@</div>@@SCENE_CTL@@</div>` inside `<div class="how-v">` (with or in place of `@@REEL@@`), and put back `@@VS_STATE@@` in the state, `this._vsInit()` and `this._vsStop()` in mount and unmount, `@@VS_METHODS@@` after `@@THEME_METHODS@@`, and `this._vsVals()` in `renderVals`. `git show 56d8b84:design/generator/main.tpl.html` has every line. Then export and build.
