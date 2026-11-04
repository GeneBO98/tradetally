# TradeTally UI conventions

The shared primitives live in `src/assets/main.css` (`@layer components`). Use
them instead of re-typing Tailwind strings; `src/designLint.test.js` enforces
the rules that can be checked mechanically.

| Need | Use |
|---|---|
| Page title / section / card title / sub-heading | `heading-page`, `heading-section`, `heading-card`, `heading-sub` |
| Surface | `card` + `card-body` (standard) or `card p-4` (dense); `card-dense` for ribbons |
| Dialog | `BaseModal`, or `modal-overlay` + `modal-panel` (+ `modal-title`, `modal-footer`) with `role="dialog"` |
| Floating menu / popover | `popover`, `dropdown-menu` |
| Buttons | `btn-primary`, `btn-secondary`, `btn-tint`, `btn-danger`, `btn-yellow` (caution), `btn-ghost`, `btn-icon`, `btn-icon-outline`; add `btn-sm` for compact |
| Toggle group | `segmented` wrapper with `segment` buttons; `segment-active` on the selected one |
| On/off switch | `switch` track + `switch-knob` span; add `switch-on` when checked |
| Checkbox / radio | `checkbox` / `radio` on the native input, wrapped in a label |
| Text-link button | `btn-link` (accent) or `btn-ghost btn-sm` (neutral); never a bare `<button>` |
| Inputs | `input`; add `input-sm` for compact editors |
| Status chip | `badge-neutral`, `badge-primary`, `badge-success`, `badge-danger`, `badge-warning` |
| Table header | `<thead class="table-head">`, `<th class="table-th">` |
| Tabs | `tab` + `tab-active` / `tab-inactive` |
| Loading ring | `spinner spinner-{xs,sm,md,lg}` (+ `spinner-light` on dark fills) |
| Notice | `callout-info`, `callout-success`, `callout-warning`, `callout-danger` (never a hand-tinted `bg-*-50` div) |
| Metric colour | `pnlClass`, `winRateClass`, `profitFactorClass` from `utils/metricTone.js`; percentages one decimal, R one decimal |
| Numbers | tables get tabular figures automatically; big numbers use `stat-value`; percentages and R are one decimal (`formatPercent`, `formatR`) |
| Table cells | `px-4 py-3` standard, `px-3 py-2` compact; nothing else |
| Disabled | `.btn` handles it (opacity 50, not-allowed cursor); never add `disabled:opacity-*` |
| Stacking | popover z-40, dialog z-50, menu-in-dialog z-[60], toast z-[70], viewer z-[100] |

Colour rules

- `primary-*` is the only accent. Never use `blue-*`, `indigo-*`, `sky-*`, `violet-*`.
- Green and red mean P&L direction (and long/short). Status uses neutral, primary or warning.
- One green (`green-*`) and one warning ramp (`yellow-*`); never `emerald`, `amber`, `cyan`, `teal`, `sky` or `rose`. `purple` is reserved for the gamification rarity scale.
- White text sits on `primary-700` (4.9:1), never `primary-600`.
- Small coloured text on light surfaces uses the 700 shade (`text-green-700`, `text-primary-700`); `-600` is 3.3:1 on white.
- Quality grades: A/B theme tint, C neutral, D/F warning. Instrument and strategy chips use the theme tint.
- Every green/red text utility needs a `dark:` variant.

Layout rules

- One radius for surfaces: `rounded-lg`. `rounded-2xl` is reserved for presentation views.
- Pages that refetch data use the `initialLoading` pattern so content is not blanked on refresh.
- Dialogs share one entrance animation (`modal-overlay` fade, `modal-panel` pop), disabled under `prefers-reduced-motion`.
- Canvas charts get theme colours, font, line tension, marker size and tick rules from `src/lib/chartSetup.js`; they restyle when the theme flips. Set colours per dataset only for P&L direction or the accent.
- Trade prices: forex keeps up to 6 decimals; everything else shows cents (4 places under $1). See `tradePriceFractionDigits`.
