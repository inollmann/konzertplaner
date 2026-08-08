// ══════════════════════════════════════════════════════════════════════
// globals.js — window shim for inline onclick handlers
//
// The SPA uses inline `onclick="fn(...)"` attributes in template strings
// and in index.html. These resolve against the global scope, so every
// function reachable from an inline handler must be on `window`. This
// module imports every public export and assigns it to `window`, so the
// rest of the codebase can use clean ES module imports without worrying
// about the global-scope contract.
//
// This file has no logic of its own — it is pure plumbing. Import it once
// from main.js (or directly from index.html) and the handlers work.
// ══════════════════════════════════════════════════════════════════════

import * as api       from './api.js';
import * as calendar  from './calendar.js';
import * as catalogues from './catalogues.js';
import * as editor    from './event-editor.js';
import * as eventim   from './eventim.js';
import * as favourites from './favourites.js';
import * as filters   from './filters.js';
import * as icons     from './icons.js';
import * as list      from './list.js';
import * as map       from './map.js';
import * as notifs    from './notifications.js';
import * as ratings   from './ratings.js';
import * as shows     from './shows.js';
import * as state     from './state.js';
import * as theme     from './theme.js';
import * as timeline  from './timeline.js';
import * as tools     from './tools.js';
import * as ui        from './ui.js';

const w = /** @type {any} */ (window);

for (const [name, mod] of Object.entries({
  api, calendar, catalogues, editor, eventim, favourites, filters,
  icons, list, map, notifs, ratings, shows, state, theme, timeline, tools, ui,
})) {
  for (const [exportName, value] of Object.entries(mod)) {
    w[exportName] = value;
  }
}
