const [i, j] of pairlist) {
      const d = deltaE(palette[i], palette[j], kind);
      if (worst === null || d < worst[0]) worst = [d, kind, palette[i], palette[j]];
    }
  }
  const tri = pairlist.length ? Math.min(...pairlist.map(([i, j]) => deltaE(palette[i], palette[j], "tritan"))) : 99;
  const wd = worst ? worst[0] : 99;
  const cvdState = wd >= CVD_TARGET ? "pass" : wd >= CVD_FLOOR ? "floor" : "fail";
  if (cvdState === "fail") ok = false;
  report.push(["CVD separation", cvdState,
    worst ? `worst ${label} ${worst[3]}\u2194${worst[2]} \u0394E ${wd.toFixed(1)} (${worst[1]}) · tritan ${tri.toFixed(1)}` : "n/a"]);

  // 4b. Normal-vision floor. The CVD gate protects dichromat readers; this one
  //     protects everyone else - neighbors must stay easy to tell apart under
  //     unsimulated vision too. A hard gate: secondary encoding does not
  //     excuse it, and weak pairs are not masked to keep an existing palette
  //     validating (this floor forced the first of the July 2026 re-orders
  //     of the shipped set: same steps, re-ordered, clears 19.6/19.3).
  let nworst = null;
  for (const [i, j] of pairlist) {
    const d = deltaE(palette[i], palette[j]);
    if (nworst === null || d < nworst[0]) nworst = [d, palette[i], palette[j]];
  }
  const nd = nworst ? nworst[0] : 99;
  const norState = nd >= NORMAL_FLOOR ? "pass" : "fail";
  if (norState === "fail") ok = false;
  report.push(["Normal-vision floor", norState,
    nworst ? `worst ${label} ${nworst[2]}\u2194${nworst[1]} \u0394E ${nd.toFixed(1)} (normal)`
      + (nd >= NORMAL_FLOOR ? "" : ` \u2014 below ${NORMAL_FLOOR.toFixed(0)}, hard to tell apart even with full color vision`) : "n/a"]);

  // 5. contrast vs surface - sub-3:1 is a documented conditional relax (visible labels / table view), not a hard fail
  const low = palette.filter(c => contrast(c, surface) < CONTRAST_MIN).map(c => [c, +contrast(c, surface).toFixed(2)]);
  report.push(["Contrast vs surface", low.length ? "relief" : "pass",
    low.length ? `below ${CONTRAST_MIN}:1 \u2014 relief required (visible labels or table view): ${JSON.stringify(low)}`
               : `all ${palette.length} >= ${CONTRAST_MIN}:1`]);

  return { report, ok };
}

export function validateOrdinal(palette, { mode = "light", surface } = {}) {
  /* Ordered categories (funnel stages, size tiers, time buckets rendered as
     discrete marks) take a one-hue ramp, not categorical hues. The categorical
     checks FAIL a correct ramp by design (it spans the lightness band; light
     steps drop below the chroma floor). The ordinal checks instead verify the
     ramp reads *as a ramp*: one hue, monotone lightness with visible gaps
     between steps, and a lightest step that still clears the surface. */
  surface ??= DEFAULT_SURFACE[mode];
  const report = [];
  let ok = true;
  const Ls = palette.map(c => oklch(c)[0]);

  // Monotone lightness - sorted by L must match input order (or its reverse).
  const order = [...Ls.keys()].sort((a, b) => Ls[a] - Ls[b]);
  const fwd = order.every((v, i) => v === i);
  const rev = order.every((v, i) => v === Ls.length - 1 - i);
  const mono = fwd || rev;
  if (!mono) ok = false;
  report.push(["Lightness monotone", mono,
    mono ? "steps read light\u2192dark" : `out of order \u2014 L values ${JSON.stringify(Ls.map(l => +l.toFixed(3)))}`]);

  // Adjacent delta L - each step must be visibly distinct from its neighbour.
  const gaps = Ls.slice(1).map((l, i) => Math.abs(l - Ls[i]));
  // Filter on the RAW gap, then round for display - filtering the rounded
  // value passes raw gaps in [0.0595, 0.06) that the Python twin fails.
  const thin = gaps.map((g, i) => [palette[i], palette[i + 1], g]).filter(([, , g]) => g < ORDINAL_MIN_DL).map(([a, b, g]) => [a, b, +g.toFixed(3)]);
  if (thin.length) ok = false;
  report.push(["Adjacent \u0394L", !thin.length,
    thin.length ? `steps too close: ${JSON.stringify(thin)}` : `all gaps >= ${ORDINAL_MIN_DL}`]);

  // Lightest step vs surface - the pale end must still read as a mark.
  const byL = [...palette].sort((a, b) => oklch(a)[0] - oklch(b)[0]);
  const lightest = mode === "light" ? byL[byL.length - 1] : byL[0];
  const cr = contrast(lightest, surface);
  if (cr < ORDINAL_LIGHT_FLOOR) ok = false;
  report.push(["Light-end contrast", cr >= ORDINAL_LIGHT_FLOOR,
    `${lightest} at ${cr.toFixed(2)}:1 vs surface` + (cr >= ORDINAL_LIGHT_FLOOR ? "" : ` \u2014 below ${ORDINAL_LIGHT_FLOOR}:1 floor`)]);

  // Single hue - an ordinal ramp is one hue; a hue jump means it's categorical.
  const hues = palette.map(okhue);
  let spread = hues.length ? Math.max(...hues) - Math.min(...hues) : 0;
  if (spread > 180) spread = 360 - spread;
  const oneHue = spread <= 40;
  if (!oneHue) ok = false;
  report.push(["Single hue", oneHue,
    `hue spread ${spread.toFixed(0)}°` + (oneHue ? "" : " \u2014 >40°, not a one-hue ramp")]);

  return { report, ok };
}

// -- entrypoints ----------------------------------------------------------------
const GLYPH = { true: "PASS", false: "FAIL", pass: "PASS", floor: "WARN", fail: "FAIL", relief: "WARN" };

function printReport({ report, ok }, { mode, surface, ordinal, n }) {
  const kind = ordinal ? "ordinal ramp" : "categorical";
  console.log(`\nPalette (${mode}, surface ${surface}, ${kind}): ${n} slots`);
  for (const [name, state, detail] of report) {
    console.log(`  [${(GLYPH[state] ?? state).padEnd(4)}] ${name.padEnd(22)} ${detail}`);
  }
  if (ordinal) {
    console.log(`\n  \u2192 ${ok ? "ALL CHECKS PASS" : "FAILED \u2014 fix the marked checks"}`
      + "  (ordinal: one hue, monotone L, visible step gaps, light end clears surface)");
  } else {
    console.log(`\n  \u2192 ${ok ? "ALL CHECKS PASS" : "FAILED \u2014 fix the marked checks"}`
      + "  (CVD in the 6\u20138 floor band is legal ONLY with secondary encoding: direct labels, gaps, or texture)");
    console.log("  scope: categorical palettes only. For a lone status/text color check WCAG"
      + " text contrast; for a sequential ramp, lightness monotonicity.\n");
  }
}

// Node CLI
if (typeof process !== "undefined" && process.argv && process.argv[1] && process.argv[1].endsWith("validate_palette.js")) {
  const args = process.argv.slice(2);
  const VALUE_FLAGS = new Set(["--mode", "--surface", "--pairs"]);
  const CHOICES = { mode: ["light", "dark"], pairs: ["adjacent", "all"] };
  const opts = {}; let positional = null;
  for (let i = 0; i < args.length; i++) {
    let a = args[i], val;
    const eq = a.indexOf("="); if (eq > 0) { val = a.slice(eq + 1); a = a.slice(0, eq); }
    if (VALUE_FLAGS.has(a)) { opts[a.slice(2)] = val ?? args[++i]; }
    else if (a === "--ordinal") { opts.ordinal = true; }
    else if (a.startsWith("--")) { console.error(`unknown flag: ${a}`); process.exit(2); }
    else if (positional === null) { positional = a; }
    else { console.error(`unexpected extra positional: ${a}`); process.exit(2); }
  }
  for (const [k, allowed] of Object.entries(CHOICES)) {
    if (opts[k] != null && !allowed.includes(opts[k])) {
      console.error(`--${k} must be one of: ${allowed.join(", ")} (got ${JSON.stringify(opts[k])})`); process.exit(2);
    }
  }
  const palette = splitColors(positional);
  if (!palette.length) { console.error("usage: node validate_palette.js \"#hex,#hex,...\" [--mode light|dark] [--surface #hex] [--pairs adjacent|all] [--ordinal]"); process.exit(2); }
  const mode = opts.mode || "light";
  // An empty/whitespace-only surface counts as absent (falls back to the
  // default), preserving the pre-boundary falsy behavior.
  const rawSurface = opts.surface != null ? stripWs(opts.surface) : "";
  const surface = rawSurface || DEFAULT_SURFACE[mode];
  const badHex = [...palette, surface].filter((c) => !isHexColor(c));
  if (badHex.length) { console.error(`invalid hex value(s): ${badHex.join(", ")} \u2014 expected #rrggbb`); process.exit(2); }
  const pairs = opts.pairs || "adjacent";
  const result = opts.ordinal ? validateOrdinal(palette, { mode, surface }) : validate(palette, { mode, surface, pairs });
  printReport(result, { mode, surface, ordinal: !!opts.ordinal, n: palette.length });
  process.exit(result.ok ? 0 : 1);
}

// Browser auto-run (as a <script type="module">). Fires whenever the page has a
// data-palette attribute on <body>; omit it to import the module without auto-running.
if (typeof document !== "undefined") {
  const b = document.body;
  if (b?.dataset.palette) {
    const palette = splitColors(b.dataset.palette);
    const mode = b.dataset.mode || "light";
    const pairs = b.dataset.pairs || "adjacent";
    const rawSurface = b.dataset.surface != null ? stripWs(b.dataset.surface) : "";
    const surface = rawSurface || DEFAULT_SURFACE[mode];
    const ordinal = "ordinal" in b.dataset;
    // Same input boundary as the CLI (stripWs/splitColors/isHexColor), plus
    // the CLI's enum choices: a bad data-mode otherwise throws at BAND[mode],
    // and a bad data-pairs silently downgrades to the weaker adjacent check.
    const badEnum = !["light", "dark"].includes(mode) ? `data-mode ${JSON.stringify(mode)}`
      : !["adjacent", "all"].includes(pairs) ? `data-pairs ${JSON.stringify(pairs)}` : null;
    const badHex = [...palette, surface].filter((c) => !isHexColor(c));
    if (!palette.length || badEnum || badHex.length) {
      // Module top level - no `return` here; skip validating instead.
      console.warn(`validate_palette: ${!palette.length ? "empty palette" : badEnum ? `unrecognized ${badEnum}` : `invalid hex value(s): ${badHex.join(", ")} \u2014 expected #rrggbb`} \u2014 not validating`);
    } else {
      const result = ordinal ? validateOrdinal(palette, { mode, surface }) : validate(palette, { mode, surface, pairs });
      console.table(result.report.map(([name, state, detail]) => ({ check: name, result: GLYPH[state] ?? state, detail })));
      if (!result.ok) console.warn("validate_palette: FAILED \u2014 fix the marked checks");
    }
  }
}

--- [on-demand file: /tmp/claude-0/bundled-skills/2.1.280/{BUNDLE_ID_REDACTED}/dataviz/scripts/validate_palette.py] ---
#!/usr/bin/env python3
"""
Validate a categorical chart palette against the computable data-viz checks.

Design-system-agnostic: feed it ANY palette's hex values plus the mode and
surface, and it computes \u2014 never eyeballs \u2014
the five checks that can be measured from color alone:

  2. Lightness band   \u2014 OKLCH L within the mode's band
  3. Chroma floor     \u2014 OKLCH C >= floor (below it a hue reads as gray)
  4. CVD separation   \u2014 OKLab \u0394E (×100) between slots under simulated protan/deutan
                        (tritan reported); adjacent pairs by default, --pairs all
                        for scatter/bubble/maps
  4b. Normal-vision floor \u2014 worst OKLab \u0394E (×100) on the active pairlist
      (adjacent by default; all pairs with --pairs all) under unsimulated vision;
                        full-color readers must be able to tell neighbors apart too
  5. Contrast vs surface \u2014 WCAG ratio of each mark against the chart surface

Checks 1 (fixed hue order) and 6 (values resolve to real ramp steps) are
structural rules the skill enforces, not measurable from hexes alone.

Usage:
  python validate_palette.py "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300,#4a3aa7,#e34948" --mode light
  python validate_palette.py "#256abf,#199e70,..." --mode dark --surface "#1a1a19"

Exit code 0 unless a check hard-FAILs; 1 on any FAIL. WARN bands do not fail:
adjacent CVD in the 6\u20138 floor band, and contrast in the sub-3:1 relief band, are
reported as WARNs and still exit 0 (each is legal only with mandatory secondary
encoding: direct labels, gaps, or texture). The normal-vision floor is a hard
gate: a worst unsimulated pair below 15 FAILs the run.
"""
import sys, math, json, argparse, re

# -- thresholds ----------------------------------------------------------------
BAND = {"light": (0.43, 0.77), "dark": (0.48, 0.67)}   # OKLCH L
CHROMA_FLOOR = 0.10                                     # OKLCH C
# Delta E is Euclidean distance in OKLab ×100. The CVD thresholds are calibrated to
# the Machado-Oliveira-Fernandes (2009) severity-1.0 simulation below - the sim
# model is part of the standard, not an implementation detail (swapping in e.g.
# Viénot-1999 moves borderline pairs and would require recalibrating these).
CVD_TARGET, CVD_FLOOR = 8.0, 6.0                        # OKLab Delta E×100, min(protan, deutan), adjacent pairs
NORMAL_FLOOR = 15.0                                     # OKLab Delta E×100, worst pair on the active pairlist, unsimulated vision
CONTRAST_MIN = 3.0                                      # WCAG vs surface
DEFAULT_SURFACE = {"light": "#fcfcfb", "dark": "#1a1a19"}

# Machado, Oliveira & Fernandes (2009) CVD transforms at severity 1.0 (linear RGB).
MACHADO = {
    "protan": [[0.152286, 1.052583, -0.204868],
               [0.114503, 0.786281, 0.099216],
               [-0.003882, -0.048116, 1.051998]],
    "deutan": [[0.367322, 0.860646, -0.227968],
               [0.280085, 0.672501, 0.047413],
               [-0.011820, 0.042940, 0.968881]],
    "tritan": [[1.255528, -0.076749, -0.178779],
               [-0.078411, 0.930809, 0.147602],
               [0.004733, 0.691367, 0.303900]]}

# -- color conversions ----------------------------------------------------------
def hex2srgb(h):
    h = h.strip().lstrip("#")
    return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4))

# -- input boundary -- EVERY user-supplied color string (palette entries AND
# the surface) passes these before any math: unguarded, malformed input
# either raises or fails OPEN. Normalization is spelled out rather than
# engine-native: JS trim() and Python str.strip() differ at the edges
# (trim() strips U+FEFF; str.strip() strips U+001C-U+001F and U+0085), so
# the shared set is their intersection - ASCII whitespace plus the Unicode
# space/separator characters both engines strip, which also covers the
# NBSP/em-space padding picked up when copy-pasting hex lists from rendered
# pages. Keep these three definitions in lockstep with the JS twin.
_WS = (" \t\n\v\f\r\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006"
       "\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000")

def strip_ws(v):
    return v.strip(_WS)

def split_colors(raw):
    return [c for c in (strip_ws(s) for s in (raw or "").split(",")) if c]

def is_hex_color(v):
    return re.fullmatch(r"#?[0-9a-fA-F]{6}", v) is not None

def s2lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def lin2s(c):
    c = max(0.0, min(1.0, c))
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055

def lin(h):
    return tuple(s2lin(c) for c in hex2srgb(h))

def relative_luminance(h):
    r, g, b = lin(h)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contrast(h1, h2):
    a, b = sorted((relative_luminance(h1), relative_luminance(h2)), reverse=True)
    return (a + 0.05) / (b + 0.05)

def lin2oklab(r, g, b):
    l = 0.4122214708*r + 0.5363325363*g + 0.0514459929*b
    m = 0.2119034982*r + 0.6806995451*g + 0.1073969566*b
    s = 0.0883024619*r + 0.2817188376*g + 0.6299787005*b
    l, m, s = l ** (1/3), m ** (1/3), s ** (1/3)
    L = 0.2104542553*l + 0.7936177850*m - 0.0040720468*s
    a = 1.9779984951*l - 2.4285922050*m + 0.4505937099*s
    bb = 0.0259040371*l + 0.7827717662*m - 0.8086757660*s
    return L, a, bb

def lin2oklch(r, g, b):
    L, a, bb = lin2oklab(r, g, b)
    return L, math.hypot(a, bb)   # (L, C)

def oklch(h):
    return lin2oklch(*lin(h))

def simulate(h, kind):
    r, g, b = lin(h)
    M = MACHADO[kind]
    sr = M[0][0]*r + M[0][1]*g + M[0][2]*b
    sg = M[1][0]*r + M[1][1]*g + M[1][2]*b
    sb = M[2][0]*r + M[2][1]*g + M[2][2]*b
    return (max(0.0, min(1.0, sr)), max(0.0, min(1.0, sg)), max(0.0, min(1.0, sb)))

def deltaE(h1, h2, kind=None):
    # Euclidean distance in OKLab, ×100. kind=None -> unsimulated (normal) vision.
    a = lin2oklab(*(simulate(h1, kind) if kind else lin(h1)))
    b = lin2oklab(*(simulate(h2, kind) if kind else lin(h2)))
    return 100 * math.dist(a, b)

def _jn(v):
    # JSON-number parity with the JS twin: +x.toFixed(n) serializes an
    # integral value as 1, but Python's round() keeps it a float and
    # json.dumps prints 1.0 - normalize so the twins' output stays
    # byte-identical on integral values (e.g. #ffffff's L of 1).
    return int(v) if isinstance(v, float) and v.is_integer() else v

# -- checks ----------------------------------------------------------------------
def validate(palette, mode, surface, pairs="adjacent"):
    lo, hi = BAND[mode]
    report, ok = [], True

    # 2. lightness band
    offband = [(c, _jn(round(oklch(c)[0], 3))) for c in palette if not (lo <= oklch(c)[0] <= hi)]
    if offband: ok = False
    report.append(("Lightness band", not offband,
                   f"all {len(palette)} inside L {lo}\u2013{hi}" if not offband
                   else f"outside band: {json.dumps(offband, separators=(',', ':'))}"))

    # 3. chroma floor
    lowc = [(c, _jn(round(oklch(c)[1], 3))) for c in palette if oklch(c)[1] < CHROMA_FLOOR]
    if lowc: ok = False
    report.append(("Chroma floor", not lowc,
                   f"all {len(palette)} >= {CHROMA_FLOOR}" if not lowc
                   else f"below floor (reads gray): {json.dumps(lowc, separators=(',', ':'))}"))

    # 4. CVD separation. Which pairs can sit side by side depends on the chart:
    #    adjacent only for stacks/bars/lines (assignment never skips a slot); ALL pairs
    #    for scatter/bubble/choropleth/small-multiples, where any two marks can land
    #    next to each other. --pairs all catches collapses the adjacent check hides.
    n = len(palette)
    pairlist = ([(i, j) for i in range(n) for j in range(i+1, n)] if pairs == "all"
                else [(i, i+1) for i in range(n-1)])
    label = "all-pairs" if pairs == "all" else "adjacent"
    worst = None
    for kind in ("protan", "deutan"):
        for i, j in pairlist:
            d = deltaE(palette[i], palette[j], kind)
            if worst is None or d < worst[0]:
                worst = (d, kind, palette[i], palette[j])
    tri = min((deltaE(palette[i], palette[j], "tritan") for i, j in pairlist), default=99)
    wd = worst[0] if worst else 99
    cvd_state = "pass" if wd >= CVD_TARGET else ("floor" if wd >= CVD_FLOOR else "fail")
    if cvd_state == "fail": ok = False
    report.append(("CVD separation", cvd_state,
                   f"worst {label} {worst[3]}\u2194{worst[2]} \u0394E {wd:.1f} ({worst[1]}) · "
                   f"tritan {tri:.1f}" if worst else "n/a"))

    # 4b. Normal-vision floor. The CVD gate protects dichromat readers; this one
    #     protects everyone else - neighbors must stay easy to tell apart under
    #     unsimulated vision too. A hard gate: secondary encoding does not
    #     excuse it, and weak pairs are not masked to keep an existing palette
    #     validating (this floor forced the first of the July 2026 re-orders
    #     of the shipped set: same steps, re-ordered, clears 19.6/19.3).
    nworst = None
    for i, j in pairlist:
        d = deltaE(palette[i], palette[j])
        if nworst is None or d < nworst[0]:
            nworst = (d, palette[i], palette[j])
    nd = nworst[0] if nworst else 99
    nor_state = "pass" if nd >= NORMAL_FLOOR else "fail"
    if nor_state == "fail": ok = False
    report.append(("Normal-vision floor", nor_state,
                   f"worst {label} {nworst[2]}\u2194{nworst[1]} \u0394E {nd:.1f} (normal)"
                   + ("" if nd >= NORMAL_FLOOR else
                      f" \u2014 below {NORMAL_FLOOR:.0f}, hard to tell apart even with full color vision")
                   if nworst else "n/a"))

    # 5. contrast vs surface
    low = [(c, _jn(round(contrast(c, surface), 2))) for c in palette if contrast(c, surface) < CONTRAST_MIN]
    # contrast below 3:1 is a documented conditional relax (visible labels / table view), not a hard fail
    report.append(("Contrast vs surface", "pass" if not low else "relief",
                   f"all {len(palette)} >= {CONTRAST_MIN:g}:1" if not low
                   else f"below {CONTRAST_MIN:g}:1 \u2014 relief required (visible labels or table view): {json.dumps(low, separators=(',', ':'))}"))
    return report, ok


# -- ordinal ramp --------------------------------------------------------------
ORDINAL_MIN_DL = 0.06          # min OKLCH delta L between adjacent steps
ORDINAL_LIGHT_FLOOR = 2.0      # lightest step: WCAG contrast vs surface

def validate_ordinal(palette, mode, surface):
    """Ordered categories (funnel stages, size tiers, time buckets rendered as
    discrete marks) take a one-hue ramp, not categorical hues. The categorical
    checks FAIL a correct ramp by design (it spans the lightness band; light
    steps drop below the chroma floor). The ordinal checks instead verify the
    ramp reads *as a ramp*: one hue, monotone lightness with visible gaps
    between steps, and a lightest step that still clears the surface."""
    report, ok = [], True
    Ls = [oklch(c)[0] for c in palette]

    # Monotone lightness - sorted by L must match input order (or its reverse).
    order = sorted(range(len(Ls)), key=Ls.__getitem__)
    mono = order == list(range(len(Ls))) or order == list(range(len(Ls)))[::-1]
    if not mono: ok = False
    report.append(("Lightness monotone", mono,
                   "steps read light\u2192dark" if mono
                   else f"out of order \u2014 L values {json.dumps([_jn(round(l,3)) for l in Ls], separators=(',', ':'))}"))

    # Adjacent delta L - each step must be visibly distinct from its neighbour.
    gaps = [abs(Ls[i+1] - Ls[i]) for i in range(len(Ls)-1)]
    thin = [(palette[i], palette[i+1], _jn(round(g,3))) for i, g in enumerate(gaps) if g < ORDINAL_MIN_DL]
    if thin: ok = False
    report.append(("Adjacent \u0394L", not thin,
                   f"all gaps >= {ORDINAL_MIN_DL}" if not thin
                   else f"steps too close: {json.dumps(thin, separators=(',', ':'))}"))

    # Lightest step vs surface - the pale end must still read as a mark.
    lightest = max(palette, key=lambda c: oklch(c)[0]) if mode == "light" else min(palette, key=lambda c: oklch(c)[0])
    cr = contrast(lightest, surface)
    if cr < ORDINAL_LIGHT_FLOOR: ok = False
    report.append(("Light-end contrast", cr >= ORDINAL_LIGHT_FLOOR,
                   f"{lightest} at {cr:.2f}:1 vs surface"
                   + ("" if cr >= ORDINAL_LIGHT_FLOOR else f" \u2014 below {ORDINAL_LIGHT_FLOOR:g}:1 floor")))

    # Single hue - an ordinal ramp is one hue; a hue jump means it's categorical.
    hues = []
    for c in palette:
        _, a, bb = lin2oklab(*lin(c))
        hues.append(math.degrees(math.atan2(bb, a)) % 360)
    spread = (max(hues) - min(hues)) if hues else 0
    if spread > 180: spread = 360 - spread
    one_hue = spread <= 40
    if not one_hue: ok = False
    report.append(("Single hue", one_hue,
                   f"hue spread {spread:.0f}°" + ("" if one_hue else " \u2014 >40°, not a one-hue ramp")))
    return report, ok

def main():
    ap = argparse.ArgumentParser(description="Validate a categorical chart palette (the data-viz six checks).")
    ap.add_argument("palette", help="comma-separated hex values, in slot order")
    ap.add_argument("--mode", choices=["light", "dark"], default="light")
    ap.add_argument("--surface", default=None, help="chart surface hex (defaults per mode)")
    ap.add_argument("--pairs", choices=["adjacent", "all"], default="adjacent",
                    help="adjacent: stacks/bars/lines (default). all: scatter/bubble/maps/"
                         "small-multiples, where any two marks can sit side by side.")
    ap.add_argument("--ordinal", action="store_true",
                    help="ordered categories (funnel, tiers, buckets) \u2014 validate as a "
                         "one-hue ramp instead of the categorical checks.")
    a = ap.parse_args()
    palette = split_colors(a.palette)
    if not palette:
        print('usage: python validate_palette.py "#hex,#hex,..." [--mode light|dark] [--surface #hex] [--pairs adjacent|all] [--ordinal]', file=sys.stderr)
        sys.exit(2)
    # An empty/whitespace-only surface counts as absent (falls back to the
    # default), preserving the pre-boundary falsy behavior.
    raw_surface = strip_ws(a.surface) if a.surface is not None else ""
    surface = raw_surface or DEFAULT_SURFACE[a.mode]
    bad_hex = [c for c in [*palette, surface] if not is_hex_color(c)]
    if bad_hex:
        print(f"invalid hex value(s): {', '.join(bad_hex)} \u2014 expected #rrggbb", file=sys.stderr)
        sys.exit(2)

    report, ok = (validate_ordinal(palette, a.mode, surface) if a.ordinal
                  else validate(palette, a.mode, surface, a.pairs))
    glyph = {True: "PASS", False: "FAIL", "pass": "PASS", "floor": "WARN", "fail": "FAIL", "relief": "WARN"}
    kind = "ordinal ramp" if a.ordinal else "categorical"
    print(f"\nPalette ({a.mode}, surface {surface}, {kind}): {len(palette)} slots")
    for name, state, detail in report:
        print(f"  [{glyph[state]:4}] {name:22} {detail}")
    verdict = "ALL CHECKS PASS" if ok else "FAILED \u2014 fix the marked checks"
    if a.ordinal:
        print(f"\n  \u2192 {verdict}"
              "  (ordinal: one hue, monotone L, visible step gaps, light end clears surface)")
    else:
        print(f"\n  \u2192 {verdict}"
              "  (CVD in the 6\u20138 floor band is legal ONLY with secondary encoding:"
              " direct labels, gaps, or texture)")
        print("  scope: categorical palettes only. For a lone status/text color check WCAG"
              " text contrast; for a sequential ramp, lightness monotonicity.\n")
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()

--- [on-demand file: /tmp/claude-0/bundled-skills/2.1.280/{BUNDLE_ID_REDACTED}/artifact-capabilities/0.2.52/artifact.d.ts] ---
/**
 * The `artifact` capability — artifact publish: this page writes to ITSELF
 * by publishing a new version (`publish`). LIVE DOCS ONLY: on an artifact
 * the platform created as a live doc (neither the page nor its declaration
 * chooses that), edits are appended instead, by `edit` or by a viewer's
 * gestures on the markup (`sync`); see those members.
 *
 * The page hands the shell a complete replacement `index.html` — or, on a
 * multi-file artifact, just the files that changed — and the shell
 * publishes it as a new immutable version of the same artifact with the
 * viewer's own authority; every open view live-reloads to it (a files
 * publish leaves the publishing view running — see {@link publish}). Obtain
 * the namespace with `await claude.use("artifact")` — `null` means this view
 * cannot run the capability; a read-only view still resolves the
 * namespace, and its write verbs surface as rejection codes
 * (`not_granted` / `not_writer`), never as `null`.
 */

declare namespace Claude {
  /**
   * Failure design — read before writing any call site. A publish is a
   * write with real preconditions, and two of its failures are ROUTINE:
   *
   * - `conflict` — someone else (another viewer, or the author's own
   *   editing session) published between this page's load and this call.
   *   This is not an error state to apologize for: the shell is already
   *   reloading every open view to the winning version, so the correct
   *   handling is almost always to do nothing beyond aborting local
   *   optimistic UI — the reload delivers the new truth. If the page
   *   holds unsent viewer input worth preserving across that reload,
   *   stash it in `sessionStorage` before calling `publish` (state kept
   *   only in JS variables does not survive the reload). With `ifMatch`
   *   on a files publish, the `conflict` can have `paths` to merge from.
   * - `not_writer` — this viewer can see the page but cannot write it.
   *   Member presence does NOT signal writability (see the member doc),
   *   so a shared page should treat its first `not_writer` or
   *   `not_granted` rejection as the read-only signal: disable or hide
   *   write affordances from then on, with copy that says the view is
   *   read-only rather than that something failed.
   *
   * The rest are exceptional: branch the UX on the error `code`, never
   * on message text; retry only `upstream_error`, at most once after a
   * short randomized delay; treat `rate_limited` as a signal to slow the
   * page's own cadence (batch several changes into one publish), never
   * to retry-loop.
   */
  namespace artifact {
    /**
     * Rejection shape for {@link publish}. Branch on `.code`;
     * `.message` is human-readable but not localized.
     */
    interface ArtifactError {
      code: ArtifactErrorCode;
      message: string;
      /** On `conflict`: the version identifier that is now live. */
      live?: string;
      /** On a files `conflict`: the files whose `ifMatch` no longer held. */
      paths?: ConflictPath[];
      /** On a files `conflict`: as {@link PublishResult.changed}. */
      changed?: ChangedFile[];
      /** On a per-op rejection (typically `invalid_content` from {@link
       * edit}): the 0-based index of the offending op in the `ops` array, and
       * the `data-id` it named — present only when the failure is
       * attributable to a single op (the control plane's `field:
       * "ops[N].target"`). */
      opIndex?: number;
      target?: string;
    }

    /** A file that changed; `sha256` is its hash now, `null` if deleted. */
    interface ChangedFile {
      path: string;
      sha256: string | null;
    }

    /** `expected`: the `ifMatch` sent; `actual`: the file's sha256 now
     * (`null`: no such file). */
    interface ConflictPath {
      path: string;
      expected: string | null;
      actual: string | null;
    }

    /**
     * Stable error codes. Treat unknown codes as `"upstream_error"` —
     * but note the lifecycle codes below are PERMANENT for the view:
     * never retry them.
     *
     * - `conflict` — a newer version was published first; the view is
     *   already being reloaded to it. See the failure-design note above.
     * - `not_writer` — the viewer lacks write access to this artifact.
     * - `not_declared` — the artifact no longer declares this capability
     *   (a republish dropped it). Hide write affordances.
     * - `too_large` — the submitted HTML, or the submitted files
     *   together, exceed the size limit.
     * - `invalid_content` — the submitted string is not an HTML page
     *   (it must begin with a doctype, like the page itself does), or a
     *   files argument is malformed (a path, content, or content type the
     *   artifact cannot store).
     * - `read_only_path` — on an artifact made from a TYPE (it keeps the
     *   type's page and files read-only; only its own files can change):
     *   a files publish named one of the type's paths — nothing was
     *   published; drop that path and publish the rest — or an `html`
     *   publish was attempted, which such an artifact never accepts; use
     *   the files form.
     * - `rate_limited` — publishing too often; slow down and batch.
     * - `consent_required` — legacy code from shells that gated
     *   artifact publish on a per-viewer consent prompt; current shells
     *   never send it (the grant is by construction). Treat
     *   like `not_granted`: render the read-only experience.
     * - `upstream_error` — anything else (transient service failure).
     *
     * Lifecycle codes (from the runtime itself, not the publish path) —
     * permanent for this view, never retryable:
     * - `not_granted` — the viewer's session did not grant `artifact` to
     *   this frame (undeclared artifact, or a read-only view); render
     *   the read-only experience.
     * - `capability_disabled` — granted but not usable in this view
     *   (the serving runtime predates it, or its module failed to
     *   load), or — for the files form of {@link publish} — the form is
     *   not available to this view or this artifact; treat like
     *   `not_granted`.
     * - `capability_removed` — the called method is not part of the
     *   runtime serving this view; treat like `capability_disabled`.
     * - `transform_error` — the call's arguments could not be prepared;
     *   treat like `invalid_content`.
     */
    type ArtifactErrorCode =
      | "conflict"
      | "not_writer"
      | "not_declared"
      | "too_large"
      | "invalid_content"
      | "read_only_path"
      | "rate_limited"
      | "consent_required"
      | "upstream_error"
      | "not_granted"
      | "capability_disabled"
      | "capability_removed"
      | "transform_error";

    /** Resolution shape for {@link publish}. */
    interface PublishResult {
      /** The new version's identifier — informational; the shell reloads
       * every open view to it (after an `html` publish this one too; after
       * a files publish this view keeps running and builds on it, unless
       * the save landed over someone else's). */
      version: string;
      /** When every entry had `ifMatch`: files other writers changed since
       * this view's version (`[]`: none; absent: unknown). This view's move
       * to the new version brings their content. */
      changed?: ChangedFile[];
      /** Present when the host checked this call's `ifMatch` values (any
       * entry had one; `null` counts); a call with none gets no `shas`. Maps
       * every file this call wrote to its stored sha256: use that as the
       * file's next `ifMatch`, not a hash of what you sent. `{}` when the
       * call wrote no file, so test `shas !== undefined`. */
      shas?: Record<string, string>;
    }

    /**
     * One file in a files publish: UTF-8 text as a string, binary bytes
     * as a `Blob`, or either wrapped as `{content, contentType}` to state
     * the media type explicitly (a bare type such as `text/plain`, no
     * `;charset` parameters; a string needs a text type, anything else
     * goes as a `Blob`). Without `contentType` the type is the
     * Blob's own `type`, else inferred from the path's extension for the
     * common web types (html, htm, css, js, mjs, json, webmanifest, txt,
     * md, xml, svg, png, jpg, jpeg, gif, webp, avif, ico, woff, woff2,
     * ttf, otf, mp3, wav, mp4, webm, pdf, wasm); any other name needs an
     * explicit `contentType`, and the artifact stores only servable web
     * media types. `ifMatch`: the sha256 of the copy this write replaces
     * (`null`: creating it); see PER-FILE PRECONDITIONS on {@link publish}.
     */
    type PublishFile =
      | string
      | Blob
      | {
          content: string | Blob;
          contentType?: string;
          ifMatch?: string | null;
        };

    /** Delete the file; with `ifMatch`, only while its sha256 is still that. */
    type PublishDelete = { delete: true; ifMatch?: string };

    /**
     * Publish `html` as the new live version of this artifact.
     *
     * `html` must be the COMPLETE replacement page — a full document
     * starting with `<!doctype html>`, exactly what a fresh viewer should
     * receive. Do not serialize the live DOM (`document.documentElement.
     * outerHTML` contains viewer-session state and injected runtime
     * scripts); instead, keep the page's canonical source in JS — for
     * example a template function of the page's state — and render the
     * replacement from that, the same way the page was authored.
     *
     * The write is compare-and-set against the version this view is
     * running: if anything published in between, the call rejects with
     * `conflict` and the view reloads to the winner. After a successful
     * publish this view reloads too — treat `publish` as the last act of
     * an interaction, and stash anything that must survive in
     * `sessionStorage` first.
     *
     * Publishing runs with the VIEWER's authority and identity: on a
     * shared artifact where other people can write, each viewer's click
     * publishes as them. Every version is attributed and the full page
     * is replaced atomically — there is no partial update.
     */
    function publish(html: string): Promise<PublishResult>;

    /**
     * FILES FORM — publish just the files that changed as the new live
     * version: `files` maps relative paths (`"data/doc.json"`,
     * `"notes.md"`) to their new content, or to `null` to delete the
     * path; every path not named is carried over unchanged. This is the
     * save path for editor-style artifacts whose page stays fixed while
     * its data files change — including an artifact made from a TYPE,
     * whose page (`index.html`) and other type files are read-only:
     * naming one rejects `read_only_path` and publishes nothing, and the
     * `html` form is refused there outright.
     *
     * Same viewer authority and `not_writer` design as the `html` form, and
     * by default the same compare-and-set on the whole version. On success
     * THIS view keeps running (unless the save landed over someone else's,
     * below): its next publish builds on the version it just made, and only
     * the OTHER open views reload. Relative URLs in this view still serve
     * the version it loaded, so render saved content from the data the page
     * holds. Every call mints a full version, so never publish per
     * keystroke: debounce edits into one call, with all changed files, a few
     * seconds after the user pauses (or on an explicit Save). Where the form
     * is not available — the view's host does not enable it (a read-only
     * view included), or the artifact is shared publicly — the call rejects
     * `capability_disabled`: keep the user's work in the page and say saving
     * is unavailable here.
     *
     * PER-FILE PRECONDITIONS — when others may save the same artifact, give
     * each entry `ifMatch`: the file's sha256 as the host last reported it
     * (file listing, a result's `shas`, a `conflict`'s `actual`); `null`
     * when creating; `{delete: true, ifMatch}` to delete. With one on every
     * entry (one entry without it keeps the whole-version check for the
     * call), two writers' saves to different files both land, and a save
     * that landed over someone else's moves this view to the new version: a
     * RELOAD unless the page takes updates in place. If a named file
     * changed, nothing is published and the `conflict` has `paths`: once
     * this view has moved to the live version, re-read those files, merge,
     * publish again.
     */
    function publish(
      files: Record<string, PublishFile | PublishDelete | null>,
    ): Promise<PublishResult>;

    /**
     * One id-addressed edit to a LIVE DOC (an artifact created as a live
     * doc — its content is an edit journal, there are no versions).
     * `target` is an element's `data-id`: the server stamps one on every
     * element it serves, so read it off the DOM (`el.dataset.id`).
     *
     * - `set-text` replaces the element's text content. Text is saved with
     *   the bytes as written; a difference that is ONLY a no-break space
     *   (U+00A0) for a space, or the reverse, is never reported as an edit —
     *   browsers store a typed trailing space as U+00A0, a rendering detail,
     *   not the writer's intent — and another writer's text is applied to
     *   the view with its own bytes.
     * - `set-attr` / `del-attr` set or remove one attribute (`data-*`,
     *   `class`, `hidden`, `aria-*` and so on — not `data-id` itself).
     * - `create-element` adds a child `<tag>` under `target`, last unless
     *   placed by ONE of: `before` / `after` — the `data-id` of a direct
     *   child of `target` (prefer these) — or `index`, which counts the
     *   parent's child NODES, whitespace text included. Initial `text` and
     *   `attrs` are optional; the server assigns its id and returns it in
     *   `created`, in op order — target (or anchor on) that id in a
     *   following call. (`newId` is retired and refused.)
     * - `remove` deletes the element and its subtree.
     */
    type EditOp =
      | { op: "set-text"; target: string; text: string }
      | { op: "set-attr"; target: string; key: string; val: string }
      | { op: "del-attr"; target: string; key: string }
      | {
          op: "create-element";
          target: string;
          tag: string;
          text?: string;
          /** initial attributes (set-attr's rules; at most 16) */
          attrs?: Record<string, string>;
          /** data-id of a direct child of `target` to insert before */
          before?: string;
          /** data-id of a direct child of `target` to insert after */
          after?: string;
          /** position among `target`'s child nodes, text nodes counted;
           * prefer `before`/`after` — at most one of the three */
          index?: number;
        }
      | { op: "remove"; target: string };

    /** Resolution shape for {@link edit}. */
    interface EditResult {
      /** The journal position this edit landed at — informational. */
      seq: number;
      /** Server-assigned data-ids for `create-element` ops, in op order. */
      created: string[];
    }

    /**
     * LIVE DOCS ONLY — append `ops` to this document as the viewer. This is
     * how a page and a watching Claude session COLLABORATE in real time:
     * the moment the edit lands, Claude is told what changed (which
     * element, its text/attributes) and typically answers with an edit of
     * its own a second or two later, applied to this view in place (below).
     *
     * Apply your change to your own DOM as well — before the call, or
     * synchronously when it resolves (then with the returned `created` id as
     * the element's `data-id`), with exactly the attributes and text you
     * passed: this view is NOT re-rendered for its own edits — only for
     * other writers' (Claude's, another viewer's). An element you rendered
     * that way, beside where the document puts it, is taken as the one you
     * created. One you create through `edit` but do not insert yourself is
     * inserted for you at the document's position, and one your `remove`
     * names but you leave in place is removed, so other writers' edits
     * around it can be placed — but if the parent holds, without a
     * `data-id`, an element of that tag beside the slot that differs from
     * what you passed, or an exact match elsewhere among its children, that
     * could be your own attempt: nothing is inserted for you and a later
     * edit around it reloads this view. Render it exactly, or not at all.
     * Keep the state that matters IN THE DOCUMENT (text, `data-*`
     * attributes), not in JS variables. When someone else's edit lands —
     * attributes or text on existing elements, or an element created,
     * removed or moved (e.g. Claude answering you) — it is applied to your
     * DOM in place and `document` receives a `claude:edit` CustomEvent
     * (`detail: {seq, targets: string[]}` — the data-ids touched): react to
     * it, e.g. `document.addEventListener('claude:edit', e => render())`.
     * An edit the view cannot apply in place reloads it from the document
     * and your scripts run again — so state kept in the DOM survives either
     * way. A text edit on a `<script>` or `<style>` (or on form-control/
     * metadata text such as `<textarea>` or `<title>`) is never applied in
     * place: the other views reload from the document and their scripts
     * run again.
     *
     * Rejections: `not_writer` / `not_granted` (read-only viewer — hide the
     * control), `invalid_content` (a bad op, an id that no longer exists,
     * this artifact is not a live doc, or the edit would take the document
     * over a live-editing budget — below), `conflict` (the document moved
     * under the edit — re-issuing the same call is safe), `rate_limited`
     * (slow down; batch several changes into one call), `upstream_error`
     * (the service failed OR the response was lost — the edit MAY have
     * landed: the runtime already retried once with the same idempotency
     * key, so retry yourself only with ops that are safe to apply twice —
     * `set-*`/`del-attr`/`remove` — never `create-element`, which could
     * duplicate). One call carries at most 32 ops; prefer one call per
     * user gesture.
     *
     * Live-editing budgets. An edit lands only while the page it produces
     * stays within 524,288 text characters (every text node counts —
     * `<script>`, `<style>` and data-block bodies and the whitespace between
     * tags included), 131,072 elements plus attributes (each element, text
     * run and attribute counts one), and 8 MiB rendered; an edit that would
     * cross a line is refused `invalid_content` while edits that keep the
     * page inside it still land. Two budgets only ever fill over the
     * document's life, and nothing done to the same document empties them:
     * removed content — every removed element with all that was inside it,
     * plus a small entry per removed or moved child — accumulates toward
     * 4 MiB, past which an edit that removes or moves elements is refused
     * while most other edits still land; and one parent element takes at most
     * 65,536 child placements (each child created under it or moved into it,
     * removed ones still counted). Only a new document — the live file
     * re-created, or the artifact duplicated — starts them from zero. One
     * `set-text` (or a `create-element`'s `text`) carries at most 16,384
     * characters; for a `<script>` or `<style>`, whose body an edit always
     * rewrites whole, that caps the body. So keep large script, style and
     * data blocks in separate files of the artifact, and have a long-running
     * page rotate or retire old rows rather than grow without bound.
     */
    function edit(ops: EditOp[]): Promise<EditResult>;

    /**
     * LIVE DOCS ONLY — the zero-API way to write. On a live doc THE PAGE'S
     * MARKUP IS THE DOCUMENT: whatever a writer's own click, keystroke or
     * drag does to the DOM — text, attributes, elements added, removed or
     * reordered, checkbox state, a text input's value, typing in
     * `contenteditable` — is appended to the document as that viewer (the
     * same journal `edit` writes to) and reaches every other view and the
     * watching Claude session. Nothing to mark: the runtime treats `<body>`
     * as the sync region (it sets `<body artifact-sync>` itself); its SERVED
     * children are the document, and an element your script appends straight
     * to `<body>` - a toast, a modal or tooltip portal - stays this view's.
     * Paste into editable markup lands as plain text.
     *
     * What stays this view's alone: CHANGES inside an `<artifact-local>`
     * element / `artifact-local` attribute (its markup is still shared as
     * authored — every view gets the same filter box or "saving..." chip;
     * only what a view does to it is local, and it comes back EMPTY for
     * others if its row is moved); any `data-local-*` attribute anywhere (a
     * viewer's own selection, hover, expanded state on a shared element);
     * `open` on `<details>`/`<dialog>`; and password / hidden /
     * payment-autocomplete inputs, whose values never enter the document.
     * Every captured ATTRIBUTE and TEXT write is scheduled on a SYNC LANE,
     * inferred from the event that produced it the way React ranks an
     * update's priority. Elements a gesture creates or removes are
     * journaled as they were before: not laned, coalesced or budgeted yet.
     * (No write is dropped for leaving the document as it was — that needs
     * the document's current value per attribute, which follows in a later
     * version; a value re-set to itself is one row that says nothing.)
     * None of this costs a user a write:
     * - `discrete` — what a click, keystroke, input, change, paste or drop
     *   handler itself writes (React's discrete events, minus the ones a
     *   script can fire as trusted: a script's `focus()`, `scrollTo()`,
     *   `play()`, a dialog's `close()` or a form's `reset()` opens no
     *   gesture, and a submit, clipboard or editing-host input event the
     *   browser fires for a script call — `requestSubmit()`,
     *   `execCommand()` — counts only under the user's own activation; a
     *   form control's own input/change, a picker's or an autofill's
     *   included, always counts — so a page that drives a control through
     *   `execCommand`, or clicks its own checkbox or radio (`.click()`),
     *   is treated as the user: the event is the one typing or clicking
     *   fires, its writes journal at once and are not budgeted, and a
     *   `.click()` loop is the one way past the budget), and what `claude.artifact.sync(fn)`
     *   writes: journaled at once, never held or dropped.
     * - `default` — everything else inside the gesture window: a
     *   handler's timer, an effect, an animation loop, and — until the
     *   `continuous` lane lands — a drag's pointermove handler, a scroll
     *   handler, a hover's. Attributes coalesce 1.5 s, so a pressed class
     *   or drag-over highlight a timer puts on and takes off is ONE row
     *   with its final value, not two; and each element has a budget of 60
     *   such journaled writes a
     *   minute, past which only its latest value per attribute or text is
     *   kept and lands up to 1.5 s after the window frees — with one console warning
     *   naming it (a timer, a hot loop: mark it `data-local-*` /
     *   `<artifact-local>`). A drag or scrub therefore lands its final
     *   value, 1.5 s late; a hover class that a handler pair puts on and
     *   takes off is one row with the class cleared; and a default-lane write still waiting
     *   for its slot when a script removes or re-renders its element with
     *   no gesture behind it is dropped with the element.
     * - `idle` — `<artifact-local>`, `data-local-*`, `open` on
     *   details/dialog: never journaled.
     * One element's attribute (or text) keeps its order across lanes: the
     * latest write wins, a co-writer's applied change included.
     * So per-viewer UI — filter and search inputs, tabs, sort order, drafts,
     * expanded/collapsed chrome — goes inside `<artifact-local>` or is kept
     * on `data-local-*` attributes; everything else a viewer changes is
     * everyone's. Keep what sits inside `<artifact-local>` to the MINIMUM —
     * the controls and chrome that are genuinely per view. The served
     * document IS the artifact: it is what every other view, the watching
     * session and a read of the page see, so the content people come for
     * (the rows, the entries, the text) belongs in the shared markup, never
     * inside a local island; a page whose content lives only in
     * `<artifact-local>`, or only in what a script draws, reads as empty
     * everywhere but the view that drew it. Islands and regions nest both
     * ways (an `<artifact-sync>` element or `artifact-sync` attribute inside
     * an island is shared again;
     * the innermost marker governs), the marker elements are layout-neutral
     * (`display: contents`), and a page that marks `<body>` or `<html>`
     * itself keeps what it chose — `<body artifact-local>` makes the whole
     * page local except the regions it marks explicitly (use the attribute
     * form inside tables and lists: `<tbody artifact-sync>`).
     *
     * Two rules make it work:
     * - SERVE the content as HTML in the page; change it in event handlers
     *   however you like - in place (`li.remove()`, `el.textContent = x`,
     *   `list.append(li)`, `el.classList.toggle(...)`) or by re-rendering a
     *   container (`list.innerHTML = render(items)`): a re-render is
     *   reconciled against what it replaced (rows paired by `data-key`/`id`
     *   if you give one, else by content, else by position) and only the
     *   rows and text that actually changed are saved. What is NOT the
     *   document is markup a script renders with no gesture behind it - on
     *   load, on a timer or animation frame, after `await fetch()`: nothing
     *   of it is saved, and an element found holding such script-built
     *   children is switched OFF for the view (saving continues everywhere
     *   else): the console says so, that element gets
     *   `artifact-sync-state="off"` (style `[artifact-sync-state=off]`) and
     *   a `claude:sync-off` event bubbles from it; moving or copying such an
     *   element by gesture is not saved either. So a chart or computed
     *   summary you render from script belongs in `<artifact-local>` (the
     *   element around it then moves freely) — drawn FROM rows that stay in
     *   the document, so script enhances served content rather than standing
     *   in for it — and if you keep JS state,
     *   update it from `claude:edit` so a re-render never rolls back
     *   another writer's change. Prefer `class`/`hidden`/`data-*`/`aria-*`
     *   for state you toggle — those, `value`/`checked`, and the inert
     *   presentation names (`style`, `title`, `alt`, `placeholder`,
     *   `lang`, `dir`, `role`, `tabindex`, `disabled`, `readonly`,
     *   `contenteditable`, `open`, `colspan`, `rowspan`) patch the other
     *   views in place; any other attribute (`on*`, `href`/`src`, `id`,
     *   `type`, ...) reloads them instead.
     * - Keep each editable text in its own element (`<span>`, `<p>`, `<td>`
     *   with no child elements): text mixed with child elements cannot be
     *   saved (the console warns when a gesture produces it).
     *   `<textarea>`/`<select>` values and canvas pixels are not captured;
     *   use `<input>` / `contenteditable`, or call `edit`.
     *
     * `sync(fn)` is the deliberate exception to the gesture rule: it runs
     * `fn` (which may be async) with capture on — inputs it sets included —
     * and resolves once what `fn` changed in shared markup has been
     * appended, or rejects with the `edit` error code if it was not. For the
     * rare write with no gesture behind it (applying a poll result you DO
     * want everyone to see); its writes are always discrete. (A
     * `continuous` lane for drags, hovers and scrolls, and a `transition`
     * opt-in below discrete, follow in a later version.) Read-only
     * viewers' changes are never saved
     * (their first attempt turns capture off for the view: every region,
     * the adopted `<body>` included, gets `artifact-sync-state="off"`) — style them a read-only
     * page. A transient failure keeps the changes and sends them with the
     * next one (`claude:sync-lost` event, `{code, count}`). A change the
     * document refuses outright (an element another writer already removed,
     * a page over a live-editing budget — see `edit`), or content that cannot
     * be saved at all (text mixed with child elements, script-built elements),
     * is not queued again: `claude:sync-dropped` fires on `document` with
     * `{reason, count, targets?}` — `reason` is `"invalid_content"` for a
     * refused batch, or `"mixed"` / `"script_built"`; `targets` are the
     * data-ids the refused changes addressed (a created element's parent),
     * absent for mixed / script-built content. This view keeps the change;
     * the document does not. React with per-view state (a `data-local-*`
     * attribute, an `<artifact-local>` notice), not by rendering into
     * shared markup.
     */
    function sync(fn: () => unknown): Promise<void>;
  }
}

interface ClaudeCapabilityMap {
  artifact: typeof Claude.artifact;
  /** Legacy spelling — `claude.use("self")` resolves the same namespace. */
  self: typeof Claude.artifact;
}

--- [on-demand file: /tmp/claude-0/bundled-skills/2.1.280/{BUNDLE_ID_REDACTED}/artifact-capabilities/0.2.52/assets.d.ts] ---
/**
 * The `assets` capability — store binary assets (image, SVG, video, PDF,
 * or web font) and text files (CSV, Markdown, JSON, plain text, CSS,
 * JavaScript) for this artifact and get back durable asset ids.
 *
 * Methods: `upload(blob, options?)` resolves `{id, url, sizeBytes,
 * contentType}`; `list()` resolves every stored asset plus the
 * artifact's storage usage; `delete(ref)` removes one asset. Assets live
 * with the artifact: they survive reloads and republishes, are shared by
 * all of the artifact's viewers, and are deleted with the artifact. The
 * `db` document an id is stored in remains the asset's index — a listing
 * carries no names or meaning of its own, so `list()` is for
 * housekeeping (a storage meter, removing assets no row points at), not
 * a gallery source. On a runtime predating a method, calling it rejects
 * `capability_removed`, so handle rejection codes rather than probing
 * for members.
 *
 * The capability is a NAMESPACE of methods: obtain it with
 * `const assets = await claude.use("assets")`, then call
 * `assets.upload(...)`. Every method is WRITER-ONLY: the platform grants
 * the capability only to viewers holding this artifact's write bit, so
 * on a read-only view `use("assets")` resolves `null` — hide upload and
 * delete affordances on `null`, and still handle the rejection codes on
 * every call (`not_granted` remains the per-call backstop). Declare
 * `capabilities: {assets: {}}`
 * (declare `db` too — an asset id without a document to live in is lost
 * when the page reloads). A declaring artifact is organization-internal
 * and cannot be shared publicly.
 *
 * What to store where, the one invariant worth designing around: store
 * the returned `id` (an opaque 32-char string) in `db` documents as the
 * durable pointer — e.g. `{"ticket_id": 7, "screenshot": id}` — and
 * build the display URL per view from it. The returned `url` is that
 * display URL, already correct for the current view — use it verbatim
 * as an `<img>`/`<video>`/`<script>` `src`, a stylesheet `<link>`
 * `href`, an `@font-face` `src: url()`, or a download link's `href`.
 * To display an asset whose id you read back
 * from `db`, build `"/_blob/" + id`: that root-relative path resolves
 * from every page and version of the artifact (the one root-relative
 * path the platform serves).
 * An SVG asset displays through `<img>` or CSS `url()` only — it is
 * served as an image, never as a document to inline or navigate to.
 * SVG is sanitized on upload: scripts, event handlers, `<foreignObject>`,
 * `<style>`/`<link>`, animation elements, external `<use>` references
 * and `javascript:`/`data:` URLs are removed and the file is re-encoded
 * (`sizeBytes` is the stored size), so style SVG with attributes, not
 * `<style>` blocks, and upload rasters separately rather than inlining
 * them as `data:` (a design-tool export with embedded images uploads
 * fine, but those images render blank). SVG files are capped at 2 MiB,
 * CSS and JavaScript at 16 MiB, other types at 20 MiB.
 *
 * Text files (`text/csv`, `text/markdown`, `application/json`,
 * `text/plain`, `text/css`, `text/javascript`) are stored and served
 * byte-for-byte under their declared type, never rendered as a page: a
 * page that ingests a data file reads it back from its `url` and parses
 * the text itself; a stylesheet or script asset takes effect where one
 * of the artifact's own pages references it, same-origin, e.g.
 * `<link rel="stylesheet" href={url}>` or `<script src={url}>`. The
 * type must be the exact spelling — a `;charset=` parameter or a
 * platform alias (a `.csv` picked on Windows can report
 * `application/vnd.ms-excel`; `.js` often reports
 * `application/javascript`) rejects — so pass `options.type` chosen
 * from the file's extension whenever `blob.type` is not already one of
 * the six. The text must be valid UTF-8 (a byte-order mark is fine);
 * UTF-16, UTF-32 or a legacy single-byte encoding rejects
 * `invalid_request`, so re-encode such a file before uploading. The
 * four data types are otherwise never inspected: a Markdown or
 * plain-text file that opens with an HTML tag or comment is stored as
 * given. A stylesheet or script must also read as text: one that opens
 * with markup or carries binary content rejects `unsupported_type`.
 * Markup under any other type uploads only as `image/svg+xml`.
 */

declare namespace Claude {
  /**
   * Failure design: branch the UX on the error `code`, never on message
   * text. `store_unavailable` is the only retry-once code; everything
   * else is either a page bug, a per-view permanent condition, or needs
   * the viewer to change what they are uploading or deleting.
   */
  namespace assets {
    /** Options for {@link Claude.Assets.upload}. */
    interface UploadOptions {
      /** Content type to record and serve, overriding `blob.type`.
       * Required when `blob.type` is empty; must be in the accepted
       * set. Exact media types only — no parameters. Font files picked
       * from disk often carry an empty or legacy `blob.type`; pass the
       * `font/` form (`font/woff2`, `font/woff`, `font/ttf`,
       * `font/otf`) here. Text files often carry a charset
       * parameter, an empty type, or a platform alias such as
       * `application/vnd.ms-excel` for `.csv` or `application/javascript`
       * for `.js`; pass the bare `text/csv`, `text/markdown`,
       * `application/json`, `text/plain`, `text/css` or
       * `text/javascript`, picked by file extension. */
      type?: string;
    }

    /** Resolution shape for {@link Claude.Assets.upload}. */
    interface UploadResult {
      /** Opaque 32-char asset id — the DURABLE pointer. Store this in
       * `db` documents; it never changes and never embeds content. */
      id: string;
      /** Display URL for the current view; use it verbatim. Derivable
       * from `id` at any time as `"/_blob/" + id`; do not store it. */
      url: string;
      /** Stored byte count, as the platform recorded it. */
      sizeBytes: number;
      /** The content type the asset will be served with. */
      contentType: string;
    }

    /** One stored asset, as {@link Claude.Assets.list} reports it. */
    interface Asset {
      /** Opaque 32-char asset id — the same durable pointer
       * {@link Claude.Assets.upload} resolved. */
      id: string;
      /** Display URL for the current view; use it verbatim. */
      url: string;
      /** The content type the asset is served with. */
      contentType: string;
      /** Stored byte count. */
      sizeBytes: number;
      /** Upload time, an RFC 3339 UTC timestamp. */
      createdAt: string;
    }

    /** The artifact's asset budget and how much of it is used. */
    interface Usage {
      /** Stored asset count. */
      files: number;
      /** Stored bytes across every asset. */
      bytes: number;
      /** The per-artifact asset-count limit. */
      maxFiles: number;
      /** The per-artifact byte quota. */
      maxBytes: number;
    }

    /** Resolution shape for {@link Claude.Assets.list}. */
    interface ListResult {
      /** Every stored asset, oldest first. */
      assets: Asset[];
      usage: Usage;
    }

    /** Resolution shape for {@link Claude.Assets.delete}. */
    interface DeleteResult {
      /** `true` when this call removed the asset; `false` when nothing
       * was stored under that id (already deleted, or never uploaded to
       * this artifact). Both are success. */
      deleted: boolean;
    }

    /**
     * Rejection shape for every call. `message` is human-readable but
     * not localized.
     */
    interface UploadError {
      code: UploadErrorCode;
      message: string;
    }

    /**
     * Stable error codes. Treat unknown codes as `"upstream_error"`.
     *
     * - `invalid_request` — the call is malformed: upload's first
     *   argument is not a `Blob`/`File`, the blob is empty, `options`
     *   breaks a rule above, a text file (csv, markdown, json, plain,
     *   css, javascript) is not valid UTF-8, or delete's argument is not
     *   an asset id or its `url`. A page bug, or a file to re-encode;
     *   fix the call.
     * - `too_large` — over the per-file limit (2 MiB for SVG, 16 MiB
     *   for CSS and JavaScript, 20 MiB for other types). Compress or
     *   split; the limit is not negotiable per call.
     * - `unsupported_type` — the content type is not in the accepted
     *   set (png, jpeg, gif, webp, svg+xml, mp4, webm, pdf, woff2,
     *   woff, ttf, otf, text/csv, text/markdown, application/json,
     *   text/plain, text/css, text/javascript), it carries a parameter,
     *   an SVG body is not an SVG document, a body declared as an
     *   image, video, PDF or font type starts with markup (a first
     *   non-blank `<` under a binary type is accepted only as
     *   `image/svg+xml`), or a stylesheet or script starts with markup
     *   or does not read as text (the four data types are never
     *   inspected). The set is closed; wrap other data in a
     *   supported container or store small data in `db`.
     * - `quota_or_state` — the artifact cannot accept the call right
     *   now: its storage quota or file count is exhausted (upload), or
     *   it is unpublished, being deleted, or retired. Surface the
     *   condition; uploading something smaller, or deleting assets no
     *   row points at, may work for the quota half only.
     * - `rate_limited` — calling too often; back off and let the
     *   viewer retry. Never loop.
     * - `upstream_auth` — the platform could not authenticate the
     *   call; ask the viewer to reload or sign in again.
     * - `capability_disabled` — granted but not usable in this view
     *   (the serving runtime predates it, its module failed to load,
     *   or the platform has it off here). Hide asset affordances.
     * - `store_unavailable` — transient platform trouble; retry once
     *   after a short delay.
     * - `upstream_error` — anything else, including every code this
     *   contract predates and an unanswered call.
     *
     * Lifecycle codes (from the runtime itself, not the store):
     * - `not_granted` — this view did not grant assets to the frame.
     * - `capability_removed` — the called method is not part of the
     *   runtime serving this view; treat like `capability_disabled`.
     * - `transform_error` — the runtime's instrumentation pipeline
     *   failed on this call; treat like `upstream_error`.
     */
    type UploadErrorCode =
      | "invalid_request"
      | "too_large"
      | "unsupported_type"
      | "quota_or_state"
      | "rate_limited"
      | "upstream_auth"
      | "capability_disabled"
      | "store_unavailable"
      | "upstream_error"
      | "not_granted"
      | "capability_removed"
      | "transform_error";
  }

  /**
   * The method namespace `await claude.use("assets")` resolves for a
   * writer (`null` for a reader).
   */
  interface Assets {
    /**
     * Store `blob` as an artifact asset and resolve with its id and
     * display URL. The id is the durable pointer: write it into the
     * document store right after the call resolves (for instance, a
     * ticket row keeping a screenshot field), and use the resolved
     * `url` for image or video sources in the current view. A later
     * view rebuilds the source from the stored id as `"/_blob/" + id` —
     * ids never expire, and that path resolves from every page and
     * version of the artifact.
     *
     * The upload is not transactional with any `db` write: write the id
     * into its document right after the call resolves, and treat a pointer
     * whose asset 404s as deleted (render a placeholder).
     *
     * @param blob The bytes: a `Blob` or `File`, 1 byte to 20 MiB (2 MiB
     *   for SVG, 16 MiB for CSS and JavaScript), whose type (or
     *   `options.type`) is in the accepted set.
     * @param options `{type?}` — see {@link assets.UploadOptions}.
     */
    upload(
      blob: Blob,
      options?: assets.UploadOptions,
    ): Promise<assets.UploadResult>;

    /**
     * List every asset stored for this artifact, oldest first, with the
     * artifact's storage usage. A housekeeping read: drive a storage
     * meter from `usage`, or reconcile against the ids your `db` rows
     * hold to find assets nothing points at. It is not a substitute for
     * those rows — entries carry no names, order keys, or ownership.
     */
    list(): Promise<assets.ListResult>;

    /**
     * Delete one asset by id (or its url exactly as `upload`/`list`
     * returned it) and resolve `{deleted}`.
     * IRREVERSIBLE and artifact-wide: every viewer's `<img>`/link to it
     * starts returning 404, so remove or rewrite the `db` rows holding
     * the id in the same deliberate user action, and otherwise call it
     * only on ids no row points at — never speculatively or in bulk on
     * load. Idempotent: an id with nothing stored resolves
     * `{deleted: false}`.
     */
    delete(ref: string): Promise<assets.DeleteResult>;
  }
}

interface ClaudeCapabilityMap {
  assets: Claude.Assets;
}

--- [on-demand file: /tmp/claude-0/bundled-skills/2.1.280/{BUNDLE_ID_REDACTED}/artifact-capabilities/0.2.52/claude.d.ts] ---
/**
 * `claude.use(name)` — the one way to reach a capability.
 *
 *   const db = await claude.use("db");
 *   if (!db) return renderWithoutDb(); // design for absence
 *   db.collection("tasks").onSnapshot(render);
 *
 * Resolves the capability's namespace once this view can run the
 * capability's code, or `null` when it cannot: the capability is not
 * served on this view, was not granted at initialization, or its module
 * failed to load. The null cases are indistinguishable by design —
 * design for absence, exactly as `permissions.state()` documents. (Chat
 * artifacts use a different, flat `window.claude`; neither `use()` nor
 * these namespaces exist there.)
 *
 * Timing. Inside a viewer the page is framed and `window.claude` exists
 * before any of your script runs. Served top-level by the platform, as
 * its own page on the artifact's own host, it has the same `use`-only
 * `window.claude` before your script too, and every `use()` resolves
 * `null` there for now; any other top-level copy of the page (a saved
 * file, another host) has no `window.claude` at all. This contract
 * promises nothing on it but `use`: treat `window.claude.db`,
 * `window.claude.room` and every other capability member as `undefined`
 * at every moment. The namespace arrives later, through the promise, once
 * the viewer has answered and the module has loaded — never during your
 * script's first synchronous run, and not ordered against
 * `DOMContentLoaded` either way, so don't assume the DOM is complete
 * when it resolves. Render the page without it and light features up
 * when it resolves. Framed by a host that never answers, it resolves
 * `null` after 10 s.
 *
 * The resolved namespace is platform-owned and read-only: a frozen
 * object whose members are the capability's functions. Call them and
 * keep the reference; assigning to it, `Object.defineProperty` on it,
 * or replacing a member throws (or silently does nothing). For helpers
 * of your own, wrap it in your own object.
 *
 * `use()` answers one question: can this view run the capability's
 * code? Permission stays on the calls themselves — a consent prompt,
 * rate limit, or policy refusal arrives on the first call, never here.
 * For a capability this view serves the promise is memoized — every
 * `use("db")` yields the same promise object; a name not served
 * resolves `null` (with no stable promise identity).
 */
interface ClaudeCapabilityMap {}

interface Claude {
  /**
   * See {@link ClaudeCapabilityMap} for the names `use()` accepts on
   * this contract version; an unknown name is a compile error in typed
   * authoring and resolves `null` at runtime.
   */
  use<K extends keyof ClaudeCapabilityMap & string>(
    name: K,
  ): Promise<ClaudeCapabilityMap[K] | null>;
}

// Capability authors: register your namespace type on
// `interface ClaudeCapabilityMap` in your own contract.d.ts — one line,
// same declaration-merging pattern as `interface Claude`.
interface Window {
  claude: Claude;
}

--- [on-demand file: /tmp/claude-0/bundled-skills/2.1.280/{BUNDLE_ID_REDACTED}/artifact-capabilities/0.2.52/comments.d.ts] ---
/**
 * The `comments` capability — write comment threads on THIS artifact from
 * the page's own UI, as the current viewer.
 *
 * A page that carries its own commenting affordances (an "Add comment"
 * button on a card, a margin-note control) declares
 * `capabilities: {comments: {}}` and calls these verbs; every thread it
 * writes lands in the artifact's one shared comment store — the store
 * the claude.ai shell's comment mode renders — labelled as written via
 * the artifact. A declaring artifact is organization-internal and cannot
 * be shared publicly — except under the composer-only form,
 * `capabilities: {comments: {"composer_only": true}}`, which grants
 * ONLY {@link Claude.Comments.openComposer} and
 * {@link Claude.Comments.anchorFor} (the write verbs reject
 * `not_granted` and {@link Claude.Comments.canSendToClaude} resolves
 * `"off"`), never prompts for consent, and keeps the artifact
 * publicly shareable. Either form may add `"customAnchors": true`,
 * which grants {@link Claude.Comments.customAnchors}: the page positions
 * the comment pins itself, for content the shell cannot anchor to.
 * The page never holds a credential: the shell
 * performs every write with the viewer's own account, and attribution is
 * stamped by the platform, never taken from the page.
 *
 * WRITE-ONLY by design: there is no verb to list, read, edit, or watch
 * threads — the shell's comment mode already shows every thread to
 * everyone who can comment on this artifact and refreshes after each
 * successful write from this page, and
 * posted text is final (no one can edit it afterwards, the viewer
 * included). Do not build the page's own thread list on top of these
 * calls; offer the write affordance, confirm in place, and let the shell
 * display the thread. (A {@link Claude.Comments.customAnchors} page is
 * handed thread anchors only, to position the pins.) Keep a returned
 * `threadId` only if the page will act on that thread again this visit
 * — nothing hands it back later.
 *
 * Consent is the viewer's, per artifact, asked at the FIRST write: the
 * shell holds that call and shows the viewer a prompt, so it may stay
 * pending for as long as they take to decide. Call the write verbs,
 * openComposer, and compose only from a deliberate viewer gesture,
 * never at load or on a timer (registering
 * {@link Claude.Comments.customAnchors} at load is fine: it writes
 * nothing). Obtain the namespace with
 * `await claude.use("comments")` — `null` means this view cannot run
 * the capability; design for absence.
 */

declare namespace Claude {
  /**
   * Failure design — read before writing any call site. Two failures are
   * ROUTINE:
   *
   * - `consent_required` — the viewer has not (yet) allowed this page to
   *   comment as them. A dismissed prompt is not shown again during this
   *   page load — repeat calls settle `consent_required` quietly — so
   *   keep the draft text in the page's own UI, say the comment was not
   *   posted, and never loop or re-call on a timer.
   * - `forbidden` — this viewer cannot comment through the page: they
   *   chose not to allow it, they lack access, or the artifact no longer
   *   declares the capability. PERMANENT for this view — allowing again
   *   happens only from the viewer's own comment panel in claude.ai,
   *   never from the page: hide or disable write affordances from then
   *   on, with copy that says commenting from the page is off here
   *   rather than that something failed. On `resolve`/`delete` it can
   *   instead mean the viewer lacks moderation reach over that one
   *   thread (only its starter or an editor of the artifact has it) —
   *   disable that thread's control, not commenting as a whole.
   *
   * The rest are exceptional: branch the UX on the error `code`, never on
   * message text; retry only `unavailable` and `upstream_error`, at most
   * once after a short randomized delay and only from a fresh viewer
   * gesture — a rejected write is NOT proof nothing was written, so never
   * re-issue one unattended; treat `rate_limited` as a signal to slow the
   * page's own cadence, never to retry-loop.
   */
  namespace comments {
    /**
     * Rejection shape for every method. Branch on `.code`; `.message`
     * is human-readable but not localized.
     */
    interface CommentsError {
      code: CommentsErrorCode;
      message: string;
    }

    /**
     * Stable error codes. Treat unknown codes as `"upstream_error"` —
     * but note the lifecycle codes below are PERMANENT for the view:
     * never retry them.
     *
     * - `consent_required` — the viewer has not allowed page-written
     *   comments on this artifact yet. See the failure-design note above.
     * - `forbidden` — the viewer cannot write comments through this page
     *   (refused, no access, or no longer declared), or lacks moderation
     *   reach over the one thread a `resolve`/`delete` named.
     * - `invalid` — the arguments were rejected: empty or whitespace-only
     *   text, text over 4 KiB as UTF-8 or carrying control characters
     *   other than newlines and tabs, a malformed anchor or `threadId`,
     *   or arguments that are not plain data. Fix the call; do not retry
     *   it.
     * - `not_found` — the thread does not exist (deleted, on another
     *   artifact, or never visible to this viewer — not distinguishable).
     * - `rate_limited` — writing too often; slow down.
     * - `unavailable` — comments cannot be used from this view right now
     *   (the service is briefly degraded, commenting is switched off for
     *   this artifact, or the consent prompt could not be shown). One
     *   retry from a fresh gesture is reasonable; if it repeats, hide
     *   write affordances for this visit.
     * - `upstream_error` — anything else: a transient fault, or a
     *   condition retrying cannot fix (the artifact's thread or reply
     *   limit — design for deliberate, viewer-initiated threads, not one
     *   per element). If the one retry repeats it, stop and tell the
     *   viewer. Also the unanswered-call shape when the shell stops
     *   replying.
     * - `claude_unavailable` — {@link Comments.sendToClaude} only: the
     *   comment could not be sent to Claude from this view, decided BEFORE
     *   anything was written, so NOTHING was posted. The viewer is not an
     *   editor of the artifact, no Claude session could receive it, the
     *   call did not come from the viewer's own recent gesture, or sending
     *   to Claude is off here. Unlike `unavailable`, plain
     *   {@link Comments.create} / {@link Comments.reply} remain usable:
     *   keep the draft, offer the plain comment, and re-check
     *   {@link Comments.canSendToClaude} before offering the send again.
     *
     * Lifecycle codes (from the runtime itself, not the write path) —
     * permanent for this view, never retryable:
     * - `not_granted` — the viewer's session did not grant `comments` to
     *   this artifact's page (undeclared artifact, or a view that cannot
     *   comment); render the page without its write affordances. From
     *   {@link Comments.customAnchors}: the served declaration does not
     *   carry `"customAnchors": true` (not declared, or switched off
     *   here); run the page with shell anchoring.
     * - `capability_disabled` — granted but not usable in this view (the
     *   serving runtime predates it, or its module failed to load);
     *   treat like `not_granted`.
     * - `capability_removed` — the called method is not part of the
     *   runtime serving this view; treat like `capability_disabled`.
     * - `transform_error` — the call's arguments could not be prepared;
     *   treat like `invalid`.
     */
    type CommentsErrorCode =
      | "consent_required"
      | "forbidden"
      | "invalid"
      | "not_found"
      | "rate_limited"
      | "unavailable"
      | "upstream_error"
      | "claude_unavailable"
      | "not_granted"
      | "capability_disabled"
      | "capability_removed"
      | "transform_error";

    /**
     * Where a thread sits on the page — the positioning vocabulary the
     * shell's own click-to-comment produces, so a page-placed thread's
     * marker renders exactly where a shell-placed one would. Obtain it
     * from {@link Comments.anchorFor} and pass it on unchanged; the
     * fields are positioning data for the shell, so treat the object as
     * opaque and never persist it as layout data.
     */
    interface Anchor {
      path: string;
      x: number;
      y: number;
    }

    /** Resolution shape for {@link Comments.create}. */
    interface CreateResult {
      /** The new thread's identifier — the handle {@link Comments.reply},
       * {@link Comments.resolve}, and {@link Comments.delete} take. */
      threadId: string;
      /** The thread's opening comment. Informational. */
      commentId: string;
    }

    /** Resolution shape for {@link Comments.reply}. */
    interface ReplyResult {
      /** The appended comment. Informational. */
      commentId: string;
    }

    /**
     * What {@link Comments.sendToClaude} writes: a NEW thread at `anchor`
     * (as {@link Comments.create} would), or a reply into `threadId` (as
     * {@link Comments.reply} would) — exactly one of the two, with the
     * same text rules.
     */
    type SendToClaudeTarget =
      | { anchor: Anchor; text: string }
      | { threadId: string; text: string };

    /** Resolution shape for {@link Comments.sendToClaude}: the comment
     * was posted AND sent to Claude (the platform committed the send and
     * notified Claude sessions watching the artifact; a reply arrives in
     * the thread later, not in this result). */
    interface SendToClaudeResult {
      /** The thread written to — new (anchor form) or the one named. */
      threadId: string;
      /** The posted comment. Informational. */
      commentId: string;
    }

    /**
     * Resolution of {@link Comments.canSendToClaude} — whether
     * {@link Comments.sendToClaude} can go through for this viewer right
     * now. A snapshot, not a subscription: re-check when (re)showing the
     * control. Treat any unrecognized value as unavailable.
     *
     * - `available` — offer "Send to Claude".
     * - `writers_only` — the viewer can comment but is not an editor of
     *   the artifact; offer the plain comment only.
     * - `no_session` — no Claude session could receive it right now.
     * - `off` — sending to Claude is not offered in this view at all.
     */
    type CanSendToClaude = "available" | "writers_only" | "no_session" | "off";

    /**
     * Where {@link Comments.openComposer} opens the shell's composer:
     * exactly one of an Element or a Range, both attached to the current
     * document at call time. A Range's selected text becomes the
     * composer's quoted excerpt when it fits the platform's span bounds;
     * an oversized or unusual selection quietly degrades to the
     * enclosing element — the open itself never fails over it. The
     * target is taken as given; the page's `data-comment-target`
     * attribute, which anchors a viewer's own comment-mode click anywhere
     * inside a marked element to that element, does not apply to it.
     */
    type ComposerTarget = { element: Element } | { range: Range };

    /**
     * Resolution shape for {@link Comments.openComposer}. `opened:
     * false` is a SOFT refusal, not an error: the viewer is not
     * currently engaged with the artifact (the page does not hold
     * focus — open from the viewer's own in-page gesture and it will),
     * the shell is protecting a composer the viewer already has open
     * with typed text, the target sits inside a subtree the page
     * marked `data-uncommentable`, or, while a
     * {@link Comments.customAnchors} registration is live, the call
     * closed an empty composer or an open thread card instead of
     * opening one (it acts as the viewer's click). Do nothing — never
     * retry in a loop.
     */
    interface OpenComposerResult {
      opened: boolean;
    }

    /** A point in the artifact document's CSS pixels, scroll offset
     * included (`pageX`/`pageY`; a client rect plus `scrollX`/`scrollY`). */
    interface DocPoint {
      x: number;
      y: number;
    }

    /**
     * One thread as the shell discloses it to a
     * {@link Comments.customAnchors} page — never its text, authors, or
     * reply counts, which the shell renders itself. Threads the shell's
     * own click-to-comment anchored (CSS-path anchors) are listed too:
     * position the anchors the page recognizes, leave the rest unplaced.
     */
    interface OverrideThread {
      /** A handle valid for this registration only (for
       * {@link CustomAnchors.open} and {@link CustomAnchors.placed}); not
       * a store id, so it cannot feed the write verbs. Correlate a thread
       * the page created by its anchor string. */
      id: string;
      /** The thread's anchor, verbatim: a name the page passed to
       * {@link CustomAnchors.compose}, a {@link CustomAnchors.domAnchor}
       * path, or a shell CSS-path anchor the page never minted. */
      anchor: string;
      resolved: boolean;
      /** True on the one thread whose card the shell has open. */
      active: boolean;
    }

    /**
     * Optional third argument of {@link CustomAnchors.compose}, and the
     * optional fields of a {@link CustomAnchorsCallbacks.move} answer.
     * `label` and `detail` are plain text of at most 1024 UTF-16 units
     * each (longer rejects `invalid`; empty means none); the shell
     * collapses whitespace, drops control and invisible characters, and
     * keeps at most 128 bytes of the label and 512 of the detail as
     * UTF-8, or nothing when no letter or digit remains. Both are stored
     * only beside a {@link CustomAnchors.domAnchor} path: beside a
     * page-invented name the platform keeps the name alone (it is what
     * Claude later reads as the thread's location, so keep names
     * legible), though the open composer shows the label and a Send to
     * Claude from it carries both.
     */
    interface ComposeOptions {
      /** The page's own short words for the spot ("Revenue chart, Q3
       * bar"), shown as the thread's location and quoted to Claude,
       * where the platform shows location labels. */
      label?: string;
      /** A longer line of what the spot or drawn area covers (the
       * elements inside a drawn rectangle, say), kept for Claude rather
       * than shown on the card. */
      detail?: string;
      /** The anchor is an area the viewer just drew, not a point: over
       * an open composer it moves the composer to the new anchor, typed
       * text included, and over an open thread card it opens the
       * composer instead of only collapsing the card. */
      area?: boolean;
    }

    /** A {@link CustomAnchorsCallbacks.move} answer: the thread's new
     * anchor, shaped and validated as {@link CustomAnchors.compose}'s
     * arguments. */
    interface MoveResult extends ComposeOptions {
      anchor: string;
      at: Element | DocPoint;
    }

    /**
     * The callbacks {@link Comments.customAnchors} takes. The shell
     * drives them, many times a session; right after registration the
     * current state (`mode(true)`, `composing(true)`, the thread list)
     * is delivered too. Exceptions thrown inside a callback are caught
     * and discarded — keep them cheap and infallible.
     */
    interface CustomAnchorsCallbacks {
      /** Comment mode started or ended — by the viewer from the shell,
       * or started by the page's own {@link CustomAnchors.compose}. While
       * on, treat clicks on commentable spots as comment gestures and
       * keep {@link CustomAnchors.placed} reports current; while off,
       * stop (a visible control that calls compose may stay). A post
       * keeps the mode on and opens the posted card; the mode ends when
       * the viewer leaves it or on {@link CustomAnchors.exitMode}. */
      mode: (on: boolean) => void;
      /** The full current set of anchored threads on the page being
       * shown (at most 256), replacing the previous list; re-sent when
       * an entry changes (created, moved, resolved, deleted, card opened
       * or closed) or the shown page does. Sent only in sessions the
       * viewer entered from the shell's own controls — a session the
       * page started with compose receives none, even after its draft
       * posts — so drop the list and its handles at `mode(false)`. */
      threads: (list: OverrideThread[]) => void;
      /** The viewer opened thread `id` from the shell's side (its
       * comment list, say): bring that thread's subject into view —
       * while registered, the shell never scrolls the artifact itself.
       * Delivered only for handles in the current list, and only after
       * the page's first {@link CustomAnchors.placed} report. The page
       * owns this scroll, so honor `prefers-reduced-motion`. */
      reveal: (id: string) => void;
      /** The shell's new-comment composer opened (`true`) or closed
       * (`false`); held `true` throughout for a viewer who cannot post
       * here. A page that draws the viewer's area selection keeps it on
       * screen while this reads true and clears it on false. */
      composing?: (open: boolean) => void;
      /** Supplying this lets a thread's starter drag its pin to a new
       * spot. On drop the shell calls it with a handle from the current
       * list and the drop point; answer within about two seconds,
       * directly or with a promise, the new anchor for that point, or
       * `null` to refuse (the pin returns). An answer that would fail
       * {@link CustomAnchors.compose}'s argument rules, a rejection, or
       * a throw refuses too. The shell stores the new anchor and
       * re-sends the thread list. */
      move?: (
        id: string,
        at: DocPoint,
      ) => MoveResult | null | Promise<MoveResult | null>;
    }

    /** The controller {@link Comments.customAnchors} resolves with.
     * After {@link CustomAnchors.release}: compose and open reject
     * `invalid`, placed and exitMode do nothing, areas reads false. */
    interface CustomAnchors {
      /**
       * Open the shell's new-comment composer for a NEW thread anchored
       * at `anchor` — the override's {@link Comments.openComposer}, with
       * the same gesture rules (deliberate viewer gesture, artifact
       * focused, rate-limited), soft refusal, and rejections. `anchor`
       * is the page's own durable name for the spot (a shape id, a video
       * timestamp, a cell reference): non-empty, at most 128 bytes as
       * UTF-8, no control or invisible characters, else `invalid`; or a
       * {@link CustomAnchors.domAnchor} path. Never layout data. Under
       * the composer-only declaration only domAnchor paths are kept, so
       * a name rejects `invalid` there. `at` places the composer: a
       * connected Element (one inside a `data-uncommentable` subtree
       * resolves `{opened: false}`) or a {@link DocPoint}. There is no
       * text-range form.
       *
       * While a registration is live this call IS the viewer's click:
       * over an open empty composer or thread card it closes that and
       * resolves `{opened: false}` (call again to place); a composer
       * holding typed text is left alone (`{opened: false}`) unless
       * `opts.area` moves it. A draft the viewer collapsed unsent
       * reopens here pre-filled, caret at the end — the viewer's only
       * way back to it.
       */
      compose(
        anchor: string,
        at: Element | DocPoint,
        opts?: ComposeOptions,
      ): Promise<OpenComposerResult>;
      /**
       * The viewer asked to open thread `id` from the page's own UI
       * (clicked its subject, say; the shell's pins open their cards by
       * themselves): ask the shell to open that thread's card at the
       * position the page reported, else at `at`. Resolves once
       * sent, not once opened: the shell ignores a handle not in the
       * current list or already open, never dismisses a composer with
       * typed text or a card mid-send for it, and silently drops opens
       * past {@link Comments.openComposer}'s rate. Rejects `invalid` for
       * a malformed id or point.
       */
      open(id: string, at: Element | DocPoint): Promise<void>;
      /**
       * Report where each listed thread's pin belongs, handle to point.
       * Each call REPLACES the previous report; listed threads absent
       * from it are unplaced and shown in the shell's own comment list
       * instead. Report after every threads callback, an empty map
       * included (the first report also tells the shell the page is
       * listening), and again after anything that moves the subjects —
       * re-render, relayout, pan, zoom, resize; window scroll is
       * re-projected for you.
       */
      placed(map: Record<string, DocPoint>): void;
      /**
       * For commentable spots that are real DOM elements: build
       * `[anchor, point]` for `el` in the CSS-path grammar the shell's
       * own click-to-comment uses, so shell-placed and page-placed
       * threads on one element share an anchor. Pass the pointer event
       * to anchor at the gesture point instead of the element's center.
       * Throws `TypeError` for an element not in the document — a page
       * bug, not a {@link CommentsError}.
       */
      domAnchor(
        el: Element,
        ev?: { clientX: number; clientY: number },
      ): [anchor: string, at: DocPoint];
      /**
       * Ask the shell to leave comment mode on the page's own exit
       * gesture (the viewer picked another of the page's tools, say). A
       * request, not a state change: the shell confirms through
       * `mode(false)` and refuses while any composer holds unsent text
       * or a send is in flight; outside comment mode it does nothing.
       */
      exitMode(): void;
      /**
       * End the override: the shell's own click-to-comment and
       * anchoring resume; drop the handles. Idempotent. Register again
       * with {@link Comments.customAnchors} to take anchoring back.
       */
      release(): void;
      /**
       * Whether an area-anchored comment could be started right now:
       * false outside comment mode, for a viewer who cannot post here,
       * while a send is in flight, and after release.
       * Offer an area-drawing gesture only while it reads true; an
       * `area` flag sent otherwise is ignored.
       */
      readonly areas: boolean;
    }
  }

  /**
   * The `comments` verbs. Every method resolves with its
   * documented shape or rejects with {@link comments.CommentsError}; none
   * throws synchronously. Text is plain text — newlines allowed, no
   * markup rendered, at most 4 KiB as UTF-8; bound the page's input to
   * match. Writing "@Claude" in page-supplied text does NOT bring Claude
   * into the thread; the page's only way to send a comment to Claude is
   * {@link Comments.sendToClaude}, for editors of the artifact.
   */
  interface Comments {
    /**
     * Open the claude.ai shell's own new-comment composer anchored at
     * `target` — exactly what happens when the viewer enters comment
     * mode and clicks there. The page posts NOTHING: typing, submitting,
     * attribution, and display all stay in the shell, so this verb needs
     * no consent prompt. Use it to make commenting discoverable from the
     * page's own UI (a "Comment" item in a context menu, a button on a
     * card); call it only from a deliberate viewer gesture — never on
     * load, on a timer, or in a loop (programmatic opens are
     * rate-limited: `rate_limited` rejections mean slow down).
     *
     * Resolves `{opened: true}` when the composer opened, and the soft
     * refusal `{opened: false}` when the shell declined to disturb a
     * composer holding the viewer's typed text (see
     * {@link comments.OpenComposerResult}). Rejects `unavailable` when
     * this view has no comments UI to open (the viewer cannot comment
     * here, or comments are off) — treat it as permanent for this view
     * and hide the affordance; `invalid` for a target that is not a
     * connected Element or Range.
     *
     * Available under BOTH declaration forms — the full
     * `capabilities: {comments: {}}` and the composer-only
     * `capabilities: {comments: {"composer_only": true}}`. Declare
     * composer-only when the page only wants this entry-point verb (and
     * {@link Comments.anchorFor}): the write verbs then reject
     * `not_granted`, no consent is ever asked, and — unlike a full
     * declaration — the artifact stays publicly shareable.
     */
    openComposer(
      target: comments.ComposerTarget,
    ): Promise<comments.OpenComposerResult>;

    /**
     * Build the {@link comments.Anchor} for `el`. Runs page-side and
     * never prompts; element geometry is read at call time, so call it at
     * the moment of the viewer's gesture on the element they are
     * commenting on, then pass the result straight to
     * {@link Comments.create}. Rejects `invalid` only when `el` is not an
     * element attached to the current document.
     */
    anchorFor(el: Element): Promise<comments.Anchor>;

    /**
     * Start a new thread at `anchor` with opening text `text`, written as
     * the current viewer. The first write on an artifact may stay pending
     * while the shell asks the viewer for consent. On success the shell's
     * comment display picks the thread up.
     */
    create(opts: {
      anchor: comments.Anchor;
      text: string;
    }): Promise<comments.CreateResult>;

    /** Append a reply to thread `threadId`, as the current viewer. Same
     * consent and text rules as {@link Comments.create}; an unknown or
     * deleted thread rejects `not_found`. */
    reply(threadId: string, text: string): Promise<comments.ReplyResult>;

    /**
     * Post a comment AND send it to Claude, exactly as the viewer pressing
     * "Send to Claude" in the claude.ai comment composer would: a new
     * thread at `anchor` or a reply into `threadId`, after which Claude
     * is brought into the thread and replies there. Editors of the
     * artifact only, and only from the viewer's own recent gesture — call
     * {@link Comments.canSendToClaude} first and enable the control only
     * on `"available"` (hide it, or show it disabled with the reason,
     * otherwise). Same consent, text, and thread rules (and the
     * same `consent_required` / `forbidden` / `invalid` / `not_found` /
     * `rate_limited` rejections) as {@link Comments.create} and
     * {@link Comments.reply}; additionally rejects `claude_unavailable`
     * when the send cannot go through — decided before anything is
     * written, so nothing was posted and the plain write verbs still
     * work. Sends are held to a human cadence: `rate_limited` means slow
     * down. Where the platform predates this method it rejects
     * `capability_removed` and posts nothing.
     */
    sendToClaude(
      target: comments.SendToClaudeTarget,
    ): Promise<comments.SendToClaudeResult>;

    /**
     * Whether {@link Comments.sendToClaude} can go through for this viewer
     * right now (see {@link comments.CanSendToClaude}). Call it before
     * rendering a "Send to Claude" control and enable the control only on
     * `"available"`; on any other value, or any rejection (where the
     * platform predates this method it rejects `capability_removed`),
     * hide it or show it disabled with the reason. Posts nothing, never
     * prompts, and is cheap to call on each render of the control; the
     * answer can change after load (watching Claude sessions are learned
     * asynchronously), so re-check when (re)showing the control.
     */
    canSendToClaude(): Promise<comments.CanSendToClaude>;

    /**
     * Mark a thread resolved (`resolved: true`) or reopen it (`false`).
     * Runs with the viewer's own moderation reach: a viewer who could not
     * resolve this thread from the shell cannot resolve it from the page
     * either (rejects `forbidden`). Idempotent — resolving an
     * already-resolved thread succeeds with no change.
     */
    resolve(threadId: string, resolved: boolean): Promise<void>;

    /**
     * Delete a thread and every reply in it. IRREVERSIBLE, and it runs
     * with the viewer's full moderation reach — a viewer who may delete
     * other people's threads from the shell deletes them from here too.
     * Offer it only behind a deliberate, confirmed viewer action on one
     * named thread; never call it in bulk, on load, or from page logic
     * the viewer did not directly trigger.
     */
    delete(threadId: string): Promise<void>;

    /**
     * Take over comment ANCHORING from the shell, for content its
     * CSS-path anchors cannot follow — canvas and WebGL scenes, video
     * timelines, generated documents whose DOM re-renders. Anchors become
     * opaque strings the page invents and later recognizes; the page
     * does its own hit-testing, decides where each thread's pin goes and
     * reports it, and the shell draws the pin there and keeps rendering
     * every card, composer, and list, while its own click-to-comment,
     * hover ring, and pin cursor stand down inside the artifact. The
     * page draws no pins of its own (highlighting the subject is fine).
     *
     * Requires `"customAnchors": true` added to either declaration
     * form: `capabilities: {comments: {"customAnchors": true}}`
     * (the full form: write verbs under consent) or
     * `{comments: {"composer_only": true, "customAnchors": true}}`
     * (no consent, no page write verbs; keeps no page-invented anchor
     * name, so {@link comments.CustomAnchors.compose} takes only
     * {@link comments.CustomAnchors.domAnchor} paths there). Without it
     * the call rejects `not_granted`. If a publish is refused with
     * `capabilities.comments: unavailable`, remove only
     * `"customAnchors": true` from the declaration, republish, and run
     * the page with shell anchoring. A missing required callback
     * rejects `invalid`, and so does a second registration before
     * {@link comments.CustomAnchors.release}.
     */
    customAnchors(
      callbacks: comments.CustomAnchorsCallbacks,
    ): Promise<comments.CustomAnchors>;
  }
}

interface ClaudeCapabilityMap {
  comments: Claude.Comments;
}

--- [on-demand file: /tmp/claude-0/bundled-skills/2.1.280/{BUNDLE_ID_REDACTED}/artifact-capabilities/0.2.52/db.d.ts] ---
/**
 * The `db` capability — a persistent, realtime document store for this
 * artifact, shared by its viewers.
 *
 * One store per artifact: JSON documents at slash-separated paths
 * (`collection/doc`, nesting deeper as `collection/doc/subcollection/doc`),
 * surviving reloads, republishes, and sessions. The store is created on
 * the first write and erased when the artifact is deleted. Reads and
 * subscriptions see other viewers' writes live. Declare
 * `capabilities: {db: {}}` — a declaring artifact is organization-internal
 * and cannot be shared publicly, so every reader and writer is a
 * signed-in member of the owner's organization.
 *
 * ACCESS RULES. By default every viewer reads and writes shared
 * documents and each viewer's own `data/users/<id>/` subtree is private.
 * To change who may read or write where, declare rules keyed on the
 * viewer's sharing level — `interact` (can interact: uses the page and
 * changes its shared data), `admin` (can edit: also publishes versions
 * and assets; the share menu's "Can edit", Editor or Manager, or an editor
 * invited by email while the artifact is not also shared by link),
 * `owner`, plus `view`, the lowest level, for paths that should stay
 * readable by everyone the server admits (every signed-in viewer of a
 * db artifact is at least `interact`, so `view` only ever widens reads,
 * never writes) — as the minimum level for each action at a path and below:
 *   capabilities: { db: { rules: [
 *     { path: "", read: "interact", write: "admin" },
 *     { path: "data/users/{self}", write: "interact" },
 *   ] } }
 * reads "anyone who can open the page reads shared data, only editors
 * write it, and every viewer writes their own subtree". A rule applies
 * to its path and everything below; a deeper rule overrides it there and
 * may be stricter or looser. A level left unset inherits from the nearest
 * rule above (the root defaults to read: "view", write: "interact").
 * An artifact created from a type often ships with that type's rules
 * already declared (commonly `write: "admin"` on shared data): read its
 * manifest before assuming the defaults.
 * Writing implies reading: a rule's write level is never below its read
 * level. A path ending in `/{self}` names each viewer's own subtree under
 * that prefix: nobody else — the artifact's owner included — sees a
 * sibling's subtree unless a rule at the prefix opens it, and `{self}`
 * must be the last segment. `{self}` works under ANY prefix, not only
 * `data/users`: "everyone reads the votes, each viewer writes only
 * their own" is
 *   { path: "votes", read: "view", write: "admin" },
 *   { path: "votes/{self}", write: "interact" }
 * with each viewer writing `votes/<their id>` (or documents below it) —
 * a rule declared AT the prefix of a `{self}` rule (here `votes`) must
 * set BOTH `read` and `write`, or the declaration is rejected at
 * publish; with no prefix rule, siblings' subtrees stay private as under
 * `data/users`. At most 64 rules; paths follow the
 * document-path grammar below. The owner meets every level, so level
 * rules never limit the owner; only `{self}` privacy does. Who holds
 * which level, in the share menu's words: "Can edit", Editor and Manager
 * hold `admin`, as does an editor invited by email (where the menu
 * offers that) unless the artifact is also shared by link. "Can
 * interact", on a person or on general access, holds `interact`, as
 * does a member of the organization who arrives by a public link. A
 * view-only member (Viewer or "Can view"; but on an older menu that
 * offers no view-only level, a person listed as Viewer and the
 * organization-wide "Can view" are `interact`) holds `view`, as does
 * every other signed-in visitor from outside the organization, by
 * public link or email invitation. A member who is a Commenter holds
 * `view` on shared data yet still writes their own `data/users/<id>/`
 * subtree; no other `view` holder writes anywhere. A signed-out visitor
 * has no data at all. So by default only `interact` and above write
 * shared documents. A call below
 * the minimum fails the same way as a sibling's `{self}` subtree: a read
 * sees a non-existent document and a write rejects `invalid_argument` —
 * so gate controls up front on what the `user` capability reports
 * (`can("data.write")` = may write shared documents under the root rule;
 * `canEdit()` = admin, for controls a rule reserves for admin;
 * `isOwner()` = owner) rather than branching on the code. When
 * `can("data.write")` resolves null, or `claude.use("user")` itself
 * does, the platform has said nothing about this viewer's write level:
 * keep shared-data inputs, and if a well-formed `set()` then rejects
 * `invalid_argument` render them read-only for the rest of the visit.
 * Rules take effect for the live version on the next call after it goes
 * live; `{db: {}}` restores the defaults.
 * AVAILABILITY is a
 * per-view fact: obtain the namespace with `await claude.use("db")` —
 * it resolves `null` when this view cannot run db (not served, not
 * granted at initialization, or failed to load) — and handle the
 * lifecycle rejection codes on calls and the `onSnapshot` error
 * callback.
 */

/** Rejection shape for every method and the `onSnapshot` error
 * callback. `message` is human-readable but not localized. */
type DbError = {
  code: DbErrorCode;
  message: string;
};

/**
 * Stable error codes. Branch on `code`, never on message text; treat
 * unknown codes as `"unavailable"`.
 *
 * Store codes — the complete set for store operations:
 * - `invalid_argument` — the path, body, or query breaks a rule in
 *   the docs below (bad path grammar, non-object body, a document
 *   over 256 KiB or 32 levels deep, too many filters, an
 *   over-limit page size, ...). Surfaces at call time for verbs
 *   and on the error callback at subscribe time. Fix the call;
 *   retrying cannot succeed.
 * - `resource_exhausted` — a budget: the per-viewer call rate, the
 *   subscription cap (64 per view), too many concurrent writes or
 *   active leases, or a query that scans too many documents. Slow
 *   down, subscribe to less, or narrow the query; tightening a loop
 *   on it cannot succeed.
 * - `quota_exceeded` — a count cap is full: documents in the
 *   collection, documents in this artifact's database, or the
 *   organization's databases (the message names which, and the cap
 *   when known). Not transient: creating documents fails until some
 *   are deleted, while writes to existing documents still succeed.
 *   Surface it to the viewer; retrying cannot succeed.
 * - `unavailable` — a transient platform condition. Verbs: retry
 *   once after a short randomized delay. Subscriptions handle this
 *   INTERNALLY — delivery falls back to periodic refresh and
 *   recovers on its own; an `onSnapshot` error callback never
 *   receives it, EXCEPT when the platform bridge itself stops
 *   responding (a subscribe that never reaches the store): that
 *   listener is terminated with `unavailable` and a fresh
 *   `onSnapshot` is the only recovery.
 * - `revoked` — this view's grant was withdrawn while the page was
 *   running (access, sharing, or availability changed). Terminal for
 *   the page load: at most one delivery per listener; calls reject
 *   thereafter. Render the degraded experience; don't editorialize
 *   about why — the surrounding app owns access messaging.
 *
 * There is deliberately NO `permission-denied` and NO not-found code
 * on reads: a document this viewer cannot see behaves exactly like
 * one that does not exist (`exists: false`, omitted from queries).
 *
 * Lifecycle codes (from the runtime itself, not the store):
 * - `not_granted` — this view did not grant db to the frame.
 * - `capability_disabled` — granted but not usable in this view
 *   (the serving runtime predates it or its module failed to load).
 * - `capability_removed` — the called method is not part of the
 *   runtime serving this view; treat like `capability_disabled`.
 * - `transform_error` — the call's arguments could not be prepared;
 *   treat like `invalid_argument`.
 * (`queue_overflow`, from runtimes that queue calls made before they
 * are ready, can also reach an error callback; it is terminal for that
 * listener and falls under the unknown-code rule above.)
 */
type DbErrorCode =
  | "invalid_argument"
  | "resource_exhausted"
  | "quota_exceeded"
  | "unavailable"
  | "revoked"
  | "not_granted"
  | "capability_disabled"
  | "capability_removed"
  | "transform_error";

/**
 * PATH GRAMMAR (shared by every ref). A document path has an EVEN
 * number of slash-separated segments — the last is the document id,
 * the joined rest is its collection (`tasks/t1`, or nested:
 * `boards/b1/columns/c2`). A collection path is the odd-length
 * prefix form (`tasks`, `boards/b1/columns`). Count segments before
 * choosing the builder. `data/users/<id>` (3) is a COLLECTION — the
 * viewer's own — so one document per viewer is
 * `db.doc("data/users/" + uid + "/profile")` (4), and one document per
 * deck is `db.collection("data/users/" + uid).doc(deckId)` (4).
 * `data/users/<id>/decks` (4) is therefore a DOCUMENT path, not a
 * collection: a named per-viewer list is a subcollection under a
 * per-viewer document,
 * `db.doc("data/users/" + uid + "/profile").collection("decks")` (5),
 * each deck `.doc(deckId)` below it (6) — building from a ref like
 * this keeps the parity right for you. Segments use letters, digits,
 * and `_ - . ~ : @ +` only (never `.` or `..` alone); at most
 * 200 bytes per segment, 1000 bytes and 16 segments per path.
 * `doc()`, `collection()` and the builders on refs THROW a
 * `TypeError` synchronously for a path that breaks
 * this grammar (its message names the broken rule; for parity, the
 * segment count) — a programming error to fix where the path is
 * written, not a store condition to handle; building a ref never
 * touches the network. Paths are data you choose — there is no need to
 * pre-create a collection, and deleting a document does NOT delete
 * documents nested under its path.
 *
 * The `data/users/` path prefix is special, platform-side: each
 * viewer's own subtree under it is private per viewer — including
 * from the artifact's owner (the default `data/users/{self}` rule;
 * a declared rule at the `data/users` prefix opens siblings' subtrees
 * at its levels, see ACCESS RULES above). Address the viewer's subtree as
 * `data/users/<id>/...` using the AWAITED value of
 * {@link Claude.user.id} (declare `user` alongside `db` — without
 * the declaration `id()` resolves null; it is async, and an
 * un-awaited promise is not a valid path segment, so the builder
 * throws) — the
 * store recognizes exactly that id as this viewer, no other value
 * works. A null id means no private subtree: disable the per-viewer
 * feature for that visit rather than relocating its data to a
 * shared path; a view-only member has an id yet cannot write there
 * either, so treat a rejected write the same way. Another viewer's
 * documents under `data/users/`
 * read as non-existent (`exists: false`, omitted from queries and
 * `onSnapshot`) — the "shared by its viewers" default does NOT
 * apply inside this prefix — and a write (`set`/`update`/`delete`)
 * into another viewer's subtree rejects `invalid_argument`.
 * Hidden-until-reveal (sealed votes, planning poker): each viewer
 * writes their pick under their own `data/users/<id>/` path, where by
 * default nobody else can read it, and copies it to a shared path when
 * THEY reveal — rules are fixed at publish, so nothing a page does at
 * run time opens another viewer's subtree.
 */

/** Snapshot provenance. `fromCache: true` marks a view that is not
 * yet (or not currently) server-definitive — the first pages of a
 * subscription, or delivery during a connectivity gap. A definitive
 * snapshot follows automatically; no action is needed.
 * `hasPendingWrites` is true while the view includes this page's own
 * unconfirmed write (latency compensation). */
type SnapshotMetadata = {
  fromCache: boolean;
  hasPendingWrites: boolean;
};

/** One document, as reads and snapshots deliver it. Delivered
 *  snapshots and their `data()` are frozen; a document that didn't
 *  change is the same object across deliveries — compare with
 *  `===`, don't mutate or accumulate them (clone a body before
 *  editing it for a write). */
type DocumentSnapshot = {
  /** The last segment of the document's path. */
  id: string;
  /** False covers both a missing document and one this viewer cannot
   * see — deliberately indistinguishable. */
  exists: boolean;
  /** The document body; `undefined` when `exists` is false. */
  data(): Record<string, unknown> | undefined;
  metadata: SnapshotMetadata;
};

/** One ordered-view transition inside a query snapshot. Indexes are
 * positions in the snapshot's `docs` order: `oldIndex` is -1 for
 * `added`, `newIndex` is -1 for `removed`. `removed` covers
 * deletion, leaving the query, and losing visibility, identically; its
 * `doc` is the last snapshot the listener saw (`exists: true`,
 * carrying the final body), so a removal handler still has the data. */
type DocumentChange = {
  type: "added" | "modified" | "removed";
  doc: DocumentSnapshot;
  oldIndex: number;
  newIndex: number;
};

/** A query's matched set, in query order. */
type QuerySnapshot = {
  docs: DocumentSnapshot[];
  size: number;
  empty: boolean;
  /** The changes since the previous snapshot of this listener (the
   * first snapshot is all-`added`). */
  docChanges(): DocumentChange[];
  metadata: SnapshotMetadata;
};

/** Stop receiving snapshots. Idempotent; after it returns, the
 * callbacks never fire again. */
type Unsubscribe = () => void;

type AcquireOptions = {
  /** Who holds the lease — any stable string (a viewer id, a tab
   * id). Renewal requires the same holder. */
  holder: string;
  /** Requested lease length in milliseconds. Absent/0 means 30000;
   * values are clamped to [1000, 600000], never rejected. */
  ttlMs?: number;
  /** Merged into the document body when the lease is granted. */
  data?: Record<string, unknown>;
};

type AcquireResult = {
  acquired: boolean;
  /** The document's version after a granted acquire. */
  version?: number;
  /** RFC 3339 expiry of the lease now in force (granted or not). */
  expiresAt?: string;
  /** Your own holder string, echoed on a granted acquire; absent when
   * busy — the platform reveals `expiresAt`, never who holds it. */
  holder?: string;
};

/**
 * A reference to one document. Pure and synchronous to create — a
 * malformed path throws here; nothing reaches the store until a
 * terminal call.
 */
type DocumentReference = {
  /** The last path segment. */
  id: string;
  path: string;

  /** Read once. Absence is NOT an error — branch on `exists`. */
  get(): Promise<DocumentSnapshot>;

  /** Write the WHOLE document, creating it (and the store) if
   * absent — a full replace, Firestore-style. Use `update` to merge
   * into existing fields. Writes are last-writer-wins; there are no
   * transactions.
   *
   * ONE WRITE AT A TIME per document, only when its data changed:
   * await each `set`/`update` before the next to the same document;
   * write on a user action or a real state change, never from render
   * code, a snapshot callback, or a timer that rewrites unchanged or
   * clock-derived values; coalesce a burst of input events into one
   * write per pause. The page open in other tabs or devices writes the
   * same documents; overlapping writes to one document make each write
   * slower. */
  set(data: Record<string, unknown>): Promise<void>;

  /** Merge-write that REQUIRES the document to exist — rejects
   * `invalid_argument` otherwise (creating-on-miss would be a bug
   * for its use cases). Nested objects merge recursively; anything
   * else (arrays included) replaces that field wholesale. Same
   * one-write-at-a-time rule as `set`. Do NOT build monotonic
   * counters from read-modify-update — writes are last-writer-wins
   * and a retried write can apply twice. */
  update(data: Record<string, unknown>): Promise<void>;

  /** Delete this document. Idempotent; nested documents survive. */
  delete(): Promise<void>;

  /**
   * Cooperative short lease on this document — set-if-not-busy, the
   * single-writer primitive (one editor at a time, a migration that
   * should run once, a turn lock). NOT a security boundary: other
   * viewers can still write directly; leases only coordinate
   * callers that all use `acquire`. Busy resolves
   * `{acquired: false}` — a normal outcome, never an error. Leases
   * expire on their own (no release verb): prefer short `ttlMs`
   * and renew while working. There is no create-if-absent write, so
   * "claim a slot" (a seat, a username, first-come ownership) is:
   * `acquire` the slot document (short `ttlMs`, no `data`), `get()`
   * it, and while you hold the lease `set` your claim only if it does
   * not exist yet or its body names no owner, then let the lease
   * lapse; `{acquired: false}` means someone else is mid-claim — treat
   * the slot as taken or re-read after `expiresAt`. Do not carry the
   * claim in `acquire`'s `data` (it merges on every later grant too).
   * A bare get-then-set races and both callers believe they won.
   */
  acquire(options: AcquireOptions): Promise<AcquireResult>;

  /**
   * Subscribe to this document. `next` fires with the current state
   * soon after registration, then on every change — including other
   * viewers' writes, live. Your own writes appear immediately
   * (`hasPendingWrites: true` until confirmed). Delivery rides a
   * realtime stream when available and falls back to periodic
   * refresh (about 30 s foreground) — same callbacks either way.
   * `error` receives at most one terminal {@link DbError}
   * (`invalid_argument`, `resource_exhausted`, `revoked`, or the
   * dead-bridge `unavailable` above), after which the subscription
   * is dead. Pass it: without one a terminal error is reported via
   * `reportError` (your `error` event and console see it) and the
   * listener still dies.
   *
   * SUBSCRIBE ONCE per document or query (when the view starts, or
   * when the path or filter really changes), keep the returned
   * `Unsubscribe`, and call it when done. Never subscribe from code
   * that runs on every render (a React component body, a `render()`
   * function, anything the snapshot callback triggers): each call
   * opens another subscription, each snapshot re-renders, and the
   * page loops. In React, subscribe in a `useEffect`, build the ref or
   * query inside it, depend only on stable primitives, and return the
   * unsubscribe. Don't omit the dependency list or put a query built
   * during render in it: either one re-subscribes on every render. To
   * sort or filter by fast-changing UI state, subscribe once to the
   * wider set and derive the view in render.
   */
  onSnapshot(
    next: (snap: DocumentSnapshot) => void,
    error?: (e: DbError) => void,
  ): Unsubscribe;

  /** A subcollection under this document. */
  collection(path: string): CollectionReference;
};

/**
 * A filtered, ordered, limited view of one collection. Builders are
 * pure — each returns a NEW query; terminal calls do the work.
 * Filters and `orderBy` evaluate against top-level fields without
 * indexes (the store scans the collection), so keep queried
 * collections modest — hundreds to low thousands of documents.
 */
type Query = {
  /** Add a filter (up to 10). Operators: `==`, `!=`, `<`, `<=`,
   * `>`, `>=`, `in`, `not-in` (value arrays of at most 30), and
   * `array-contains`. */
  where(field: string, op: string, value: unknown): Query;

  /** Order by one top-level field (at most one `orderBy`);
   * `dir` defaults to `"asc"`. Documents missing the field sort
   * last. Without `orderBy`, results are ordered by document id
   * (ascending) — the same on every delivery path. */
  orderBy(field: string, dir?: "asc" | "desc"): Query;

  /** At most `n` documents (1-1000). An ordered, limited query is a
   * window: documents beyond the window are not delivered until
   * they enter it. */
  limit(n: number): Query;

  /** Read the matched set once, in query order. */
  get(): Promise<QuerySnapshot>;

  /** Subscribe to the matched set — same delivery contract and same
   * subscribe-once rule as {@link DocumentReference.onSnapshot} (in
   * React, subscribe inside the effect, never during render, and don't
   * list a query built during render as a dependency), with
   * `docChanges()` describing each transition. At most 64 active
   * subscriptions per view (the 65th rejects `resource_exhausted` on
   * the error callback). */
  onSnapshot(
    next: (snap: QuerySnapshot) => void,
    error?: (e: DbError) => void,
  ): Unsubscribe;
};

/** A collection: a {@link Query} over everything in it, plus
 * document access and creation. */
type CollectionReference = Query & {
  path: string;

  /** A document in this collection. Omit `id` to mint a fresh
   * client-generated id — the retriable-create idiom (the store has
   * no idempotency key; a retried create with a fresh ref leaves at
   * most one document per id). */
  doc(id?: string): DocumentReference;

  /** Create a document under a client-generated id and resolve its
   * ref. Sugar for `.doc().set(data)`. */
  add(data: Record<string, unknown>): Promise<DocumentReference>;
};

/**
 * The store surface. Refs are pure path holders — building them never
 * touches the network; only the calls on them do.
 *
 * DOCUMENT BODIES are plain-JSON OBJECTS (not arrays or scalars at
 * the top level): at most 256 KiB serialized and 32 levels deep.
 * CAPACITY: an artifact's database holds at most 5,000 documents in
 * total. Don't map an unbounded, growing stream (events, log lines,
 * messages) to one document per item — aggregate many items into one
 * document or prune old ones — and when a create rejects with
 * `quota_exceeded`, tell the viewer what happened and what to do.
 * Numbers are JSON numbers (double precision). Writes are
 * last-writer-wins — compare document STATE to reason about
 * concurrency, never row counts or call counts.
 */
type DB = {
  /** A document reference. The path must have an even number of
   * segments (`tasks/t1`); throws `TypeError` for a path that breaks
   * the grammar above. */
  doc(path: string): DocumentReference;

  /** A collection reference. The path must have an odd number of
   * segments (`tasks`, `boards/b1/columns`); throws `TypeError` for a
   * path that breaks the grammar above. */
  collection(path: string): CollectionReference;
};

interface ClaudeCapabilityMap {
  db: DB;
}

--- [on-demand file: /tmp/claude-0/bundled-skills/2.1.280/{BUNDLE_ID_REDACTED}/artifact-capabilities/0.2.52/downloads.d.ts] ---
/**
 * The `downloads` capability — offer a file your frame generated to the
 * viewer. `save({filename, data})` shows the viewer a confirmation
 * (final filename + size); the file is saved only if they accept. Frame
 * code never downloads directly. Obtain the namespace with
 * `await claude.use("downloads")` — `null` means this view cannot run
 * the capability; design for absence.
 */

declare namespace Claude {
  namespace downloads {
    /** Rejection shape for {@link save}. Branch on `.code`. */
    interface DownloadsError {
      code: DownloadsErrorCode;
      message: string;
    }

    /**
     * Stable error codes; treat unknown codes as `"unavailable"`.
     * - `rejected_extension` — extension missing or outside the allowlist
     *   (`gif png jpg jpeg webp mp4 webm txt json md` and
     *   `docx pptx epub csv ttf html svg pdf xlsx zip`). Offer the format the
     *   content wants (a plain table is a `csv`, a workbook an `xlsx`);
     *   do not pre-build fallbacks to other formats.
     * - `extension_not_enabled` — the platform has switched the second
     *   list off for this view. Not the normal state: if it arrives, tell
     *   the viewer that format is unavailable here and stop — no retry,
     *   no pre-built fallback chain.
     * - `too_large` — this file is over a ceiling: an export answer
     *   (`request` set) larger than the destination the viewer chose
     *   accepts (16 MiB today), or an ordinary save over 200 MiB in a
     *   host that writes files itself (the Claude Android app). Other
     *   ordinary saves have no size limit: never cap, trim, or re-encode
     *   a download up front; on `too_large`, offer a smaller rendition.
     * - `declined` — the viewer said no (or let the prompt expire);
     *   never auto-retry.
     * - `rate_limited` — a prompt is already open or too many recent
     *   prompts; wait, then retry.
     * - `bad_request` — caller bug: bad filename (non-string or >512
     *   chars), bad/empty/detached data, a malformed `request`, or an
     *   answered export whose extension is not the requested format.
     * - `request_unknown` — `request` named no open export request
     *   (expired, already answered, or never issued to this page);
     *   nothing was saved. Drop the work; never retry with that token.
     * - `unavailable` — saves unusable in this view; hide your save UI.
     * - `not_granted`, `capability_disabled`, `capability_removed`,
     *   `transform_error` — runtime lifecycle; treat like `unavailable`
     *   (`transform_error` like `bad_request`).
     */
    type DownloadsErrorCode =
      | "rejected_extension"
      | "extension_not_enabled"
      | "too_large"
      | "declined"
      | "rate_limited"
      | "bad_request"
      | "request_unknown"
      | "unavailable"
      | "not_granted"
      | "capability_disabled"
      | "capability_removed"
      | "transform_error";

    interface SaveRequest {
      /**
       * Suggested filename with extension. It is sanitized (invisible
       * characters dropped, repeated whitespace made one space, at most 240
       * bytes of UTF-8) and allowlist-checked; the viewer confirms the
       * FINAL name, which may differ.
       */
      filename: string;
      /**
       * Non-empty contents; no size limit short of `too_large` above.
       * Strings encode UTF-8. An
       * ArrayBuffer is TRANSFERRED (detached after the call) — pass
       * `buf.slice(0)` if you still need it; views are copied; a Blob is
       * handed over as-is, neither read nor transferred (except when
       * `request` is set: then it is read into one buffer), so prefer
       * a Blob for large files. MIME comes from the extension; a Blob's
       * own type (and a File's name) is ignored.
       */
      data: string | Blob | ArrayBuffer | ArrayBufferView;
      /**
       * Only when answering an export the platform asked this page for:
       * the opaque token that arrived with the request, verbatim. The
       * viewer is then asked to let the file go where they chose instead
       * of saving it, and the call resolves `"delivered"`. Omit for an
       * ordinary save.
       */
      request?: string;
    }

    interface SaveResult {
      /**
       * `"saved"` = viewer accepted and the file was handed to the host's
       * save surface — the browser download, the native share sheet in
       * the Claude iOS app, or the Claude Android app's own file write,
       * which it confirmed (a browser host may still drop a download
       * downstream, unobservably). `"delivered"` = the save carried `request` and the
       * viewer accepted: the file was handed to the platform for the
       * destination they chose, not saved; show no "saved" notice.
       */
      status: "saved" | "delivered";
    }

    /**
     * Offer the file. Resolves when the viewer accepts; rejects with
     * {@link DownloadsError} for every other outcome. One undecided
     * prompt at a time (first-wins).
     */
    function save(request: SaveRequest): Promise<SaveResult>;
  }
}

interface ClaudeCapabilityMap {
  downloads: typeof Claude.downloads;
}

--- [on-demand file: /tmp/claude-0/bundled-skills/2.1.280/{BUNDLE_ID_REDACTED}/artifact-capabilities/0.2.52/mcp.d.ts] ---
/**
 * The `mcp` capability — call the viewer's connected MCP tools from inside a frame.
 *
 * One decision, two arms: displaying data that should stay current is
 * `watchTool`; performing an action once is `callTool`. Use `listTools()`
 * to see which servers the viewer has available, and `server(name)` for a
 * handle whose methods are one server's tools. Calls run with the
 * viewer's credentials; your code never sees tokens. Obtain the
 * namespace with `const mcp = await claude.use("mcp")` — `null` means
 * this view cannot run the capability; design for absence. Besides the
 * viewer's connectors, a view may reach Claude's own servers for this
 * artifact (`kind: "artifact"` in `listTools()`; today `artifacts_data`,
 * this artifact's document store, on a page that declared `db`): then
 * `use("mcp")` resolves whatever the connector manifest's state — none
 * declared, or declared but not granted to this viewer.
 */

declare namespace Claude {
  /**
   * Failure design — read before writing any call site. Connector calls
   * fail routinely in normal operation (lapsed auth, a connector the
   * viewer has not added, a briefly unreachable upstream), and each code
   * on {@link Claude.mcp.McpError} has a different correct response.
   * Design the page's degraded states alongside its happy path:
   *
   * - Branch the UX on the error `code`, never on message text, and
   *   never collapse all failures into one generic banner. A single
   *   catch-all ("transient connector failure", "something went wrong")
   *   is the named anti-pattern for this capability: it hides the one
   *   action that would fix the page (reconnect, add the connector,
   *   choose one, or simply wait) and turns recoverable states into
   *   dead ends. A default branch with generic copy is fine for codes
   *   you do not handle individually — the anti-pattern is collapsing
   *   the codes that do have a distinct fix into that one banner.
   * - Retry only errors stamped `retryable: true` (today
   *   `server_unavailable`, `rate_limited` if it ever fires, and the
   *   `upstream_error` a first call gets when the viewer's consent for
   *   that connector could not be asked or was left undecided just now)
   *   — at most once per user-visible refresh, after a short randomized
   *   delay, honoring `retryAfterMs` when present, and ONLY for reads.
   *   `server_unavailable` (the runtime's reply timeout and upstream
   *   5xx land here) and `upstream_error` are AMBIGUOUS outcomes for
   *   writes: a rejection is NOT proof the tool did not run. Re-issue a
   *   write only behind a fresh user gesture, and where the connector
   *   offers a read, re-read state first. Never retry `needs_reauth` or
   *   `server_not_connected` unattended — repeating the call cannot
   *   succeed on its own: `needs_reauth` means credential refresh was
   *   already exhausted upstream, and `server_not_connected` means no
   *   connector is configured at all (for a `host:` server: no host
   *   bridge on this surface, or the local server is not running). Render
   *   their documented reconnect/add or no-host fallback copy instead; a
   *   later viewer action may bring a host server back.
   * - Consent is readable and requestable per connector via the
   *   `permissions` capability's scoped names: `"mcp:<server>"`, with
   *   the server name exactly as declared in the manifest (the same
   *   string passed to {@link Claude.mcp.callTool}). A multi-connector
   *   page should gate each section on its own server's state
   *   (`state("mcp:<server>")`) and ask per section
   *   (`request(["mcp:<server>"])`) rather than asking for everything
   *   up front; bare `"mcp"` remains the whole-manifest aggregate —
   *   "granted" only when every declared server is covered, and asking
   *   it asks for all of them. `use("mcp")` resolving non-`null` is
   *   the availability gate. Any state other
   *   than `"unavailable"` from a permissions read means present, and
   *   `"prompt"` means proceed (the first call asks) — never gate
   *   rendering on `=== "granted"`, and tolerate rejection on any
   *   permissions read (`.catch(() => "unavailable")`). Handle the
   *   lifecycle rejection codes on every call — availability is
   *   per-view and can change across a re-boot.
   * - A tool-level failure REJECTS with `tool_error` (the connector was
   *   reachable and answered, but reported failure) — the full result
   *   envelope rides the rejection's `result` field for the rare
   *   inspector. An immediate retry with the same arguments rarely
   *   helps; surface the reported message in the affected section.
   * - Host servers (`host:<name>`): a manifest entry whose `server`
   *   starts with `host:` names an MCP server running on the VIEWER'S
   *   DEVICE, reached through the Claude app that shows the page (the
   *   desktop app first). `<name>` is the local server's name with
   *   anything outside `[A-Za-z0-9_-]` replaced by `_`. The API is the
   *   same — `callTool("host:filesystem", "read_file", {...})`, consent
   *   per server via `"mcp:host:filesystem"` — with three differences:
   *   outside the app (a browser tab, an embedded drawer) every call
   *   fails — `server_not_connected` once the shell routes `host:`
   *   calls to the app; the service itself never runs a `host:` tool —
   *   and there `listTools()` then omits the server, so always render a
   *   no-host fallback; the app may ask the viewer to confirm a call
   *   that is not annotated read-only, which can take a while or come
   *   back `cancelled`; and only the Artifact's owner can use host
   *   servers for now. Once the shell routes `host:` calls to the app,
   *   tool input goes to the device rather than the service, which then
   *   sees which tool ran, never its arguments.
   * - Pages that make several calls per refresh (dashboards,
   *   multi-section reports) contain each failure in the section it
   *   affects: one failed call annotates or greys out its own section
   *   while the rest render normally. Keep the previous successful
   *   data visible with a stale/last-updated indicator (drive it from
   *   the result's `cache.storedAt`, never `Date.now()`), and prefer
   *   {@link Claude.mcp.watchTool} for such sections — it replays,
   *   refreshes, and coalesces for you. When every section fails at
   *   once with the same code, treat it as a page-level condition:
   *   show one message with a reload affordance instead of repeating
   *   the same error in every section.
   * - In a {@link Claude.mcp.watchTool} handler: transient errors keep
   *   last-good data; authz denials (`needs_reauth`,
   *   `server_not_connected`, `blocked_by_policy`, `approval_required`)
   *   RETRACT rendered data; registration failures mean no live updates
   *   will ever arrive — full doctrine on {@link Claude.mcp.watchTool}.
   */
  namespace mcp {
    /**
     * Rejection shape for {@link callTool} and {@link listTools}, and
     * the `error` payload of {@link watchTool} events. Branch on `.code`
     * for UX; `.message` is human-readable but not localized. `.server`
     * echoes the connector display name when the failure is scoped to
     * one connector.
     *
     * For one of Claude's own servers (`kind: "artifact"`) the codes keep
     * their meaning with these readings: `not_in_manifest` — this
     * artifact's data is not reachable for this viewer any more (or the
     * call named another artifact); `bad_request` — a tool the page may
     * not call, or malformed input; `capability_disabled` — this view has
     * lost its binding to the server; `server_unavailable` (retryable) —
     * the server did not answer in time or is paused; `tool_error` — the
     * store refused the operation, `.message` carrying its error envelope
     * as JSON text (`{"error":{"code", ...}}`) and `.result` the whole
     * result. `needs_reauth`, `selection_required` and
     * `blocked_by_policy` do not arise for them.
     */
    interface McpError {
      code: McpErrorCode;
      /** Connector display name (e.g. `"Google Calendar"`), when applicable. */
      server?: string;
      message: string;
      /**
       * Stamped ONLY as `true`, by the layer that produced the error,
       * when repeating the call unattended (no viewer action) may
       * succeed — correct even for codes newer than this contract.
       * Absent = do not auto-retry. Licenses AT MOST one retry per
       * user-visible refresh, after a short randomized delay; honor
       * `retryAfterMs`. Never loop.
       */
      retryable?: boolean;
      /** Earliest sensible retry, ms from receipt (shell-clamped at 60 s max). */
      retryAfterMs?: number;
      /** Present on `tool_error`: the full result envelope the tool
       * returned, for the rare inspector that needs more than
       * `.message`. */
      result?: unknown;
    }

    /**
     * Stable error codes. Treat unknown codes as `"upstream_error"`.
     *
     * - `needs_reauth` — connector token expired/revoked. The shell
     *   usually pre-empts this at load with its own reconnect prompt, so
     *   don't build an always-on reconnect banner; keep a lightweight
     *   in-frame fallback ("Reconnect {server} in claude.ai Settings →
     *   Connectors") for mid-session lapses and dismissed/suppressed
     *   prompts.
     * - `server_not_connected` — no callable connector with this display
     *   name for the current viewer. Also usually pre-empted by the
     *   shell's load-time prompt; in-frame fallback: "Add {server} in
     *   claude.ai Settings → Connectors". For a `host:` server it also
     *   means this surface has no host bridge (not inside the Claude
     *   app) or the local server is not running — render the no-host
     *   fallback; the shell never prompts for these.
     * - `selection_required` — the viewer has more than one callable
     *   connector with this display name and has not yet chosen one. The
     *   shell prompts the viewer to choose at most once per loaded version
     *   of the artifact (a live version update can re-arm one prompt); if
     *   they dismiss the prompt the error can persist. Back off or fall
     *   back to a degraded view, as for `server_not_connected`.
     * - `server_not_found` — resolved server no longer exists upstream.
     * - `server_unavailable` — upstream MCP server unreachable/5xx/timeout;
     *   transient, stamped `retryable: true`.
     * - `not_in_manifest` — `(server, tool)` is outside the frame's
     *   published manifest (a page bug), or outside the scope the viewer
     *   consented to: they turned this connector off for the page, or
     *   declined it when the page's first call on it asked. Render that
     *   connector's section as not allowed for this view; do not re-ask
     *   in a loop.
     * - `blocked_by_policy` — tool is in the manifest but org policy blocks
     *   it for this viewer.
     * - `approval_required` — org policy requires per-call approval for
     *   this tool and none was given; per-call approval is not yet
     *   supported in artifacts. Not retryable without viewer action;
     *   render a "needs approval" degraded state. (Older runtimes
     *   degrade this code to `upstream_error` per the unknown-code
     *   rule.)
     * - `tool_error` — the tool ran but reported failure. The call
     *   REJECTS with this code; the full envelope rides the rejection's
     *   `result`. (Tool failures no longer resolve with an `isError`
     *   flag.)
     * - `bad_request` — caller bug: `server`/`tool` not strings, `input`
     *   not JSON-serializable (or arguments not structured-cloneable),
     *   a duplicate watch registration, the per-view watch limit (64 —
     *   unsubscribe unused watches), or an unknown method on an older
     *   shell.
     * - `cancelled` — the call's `AbortSignal` fired (upstream outcome
     *   UNKNOWN: the tool may still have run), or, for a `host:` server
     *   only, the viewer declined the app's confirm for a call that is
     *   not annotated read-only (that call never ran). Without a signal
     *   it is only ever the latter.
     * - `rate_limited` — RESERVED: never returned today, but handle it
     *   anyway. The shell refused the call locally (the page exceeded
     *   its connector budget). Wait `retryAfterMs` (else a few
     *   seconds), retry at most once, never tighten a polling loop.
     *   Upstream throttling stays `server_unavailable`.
     * - `upstream_error` — anything else. Also the unanswered-call
     *   shape when an established shell stops replying — after the
     *   shell-announced reply budget (~130 s by default). Also a first
     *   call on a connector whose consent the viewer could not give just
     *   then (another prompt was open, or the prompt closed before a
     *   decision): stamped `retryable: true` with `retryAfterMs`, and
     *   that call never reached the connector, so re-issuing it after the
     *   wait is safe even for a write — but it is not distinguishable by
     *   shape from other retryable `upstream_error`s, so a write that
     *   must not run twice still waits for a fresh user gesture. Top-level,
     *   a page served by the platform on the artifact's own host has
     *   `window.claude`, and `use("mcp")` resolves this same namespace
     *   there only when the platform lets the artifact act as the
     *   signed-in viewer (the platform answers its calls with these same
     *   codes plus the two top-level codes below; Claude's own artifact
     *   servers are not reachable there) and `null` otherwise; any other
     *   top-level copy has no `window.claude` at all; an
     *   embedded-but-unserved frame resolves `use("mcp")` `null` within
     *   about 10 s. Gate on `use("mcp")`'s resolution, never by probing
     *   with a call.
     *
     * Lifecycle codes (from the runtime itself, not the connector path):
     * - `not_granted` — the viewer's session did not grant MCP to this
     *   frame; render the no-MCP experience.
     * - `capability_disabled` — MCP was granted but is not usable in this
     *   view (the serving runtime predates it, its module failed to
     *   load, or this boot carries no connector bridge); render the
     *   no-MCP experience.
     * - `capability_removed` — the called method is not part of the
     *   runtime serving this view; treat like `capability_disabled`.
     * - `transform_error` — the call's arguments could not be prepared;
     *   treat like `bad_request`.
     *
     * Top-level codes (only on a page served top-level on the artifact's
     * own host; never inside a viewer):
     * - `consent_required` — the viewer has not allowed this connector for
     *   this artifact there: they declined when the call asked, or the
     *   call waited about ten minutes for an answer (its "Review in Claude"
     *   notice stays up). The call never reached the connector. Render
     *   that connector's section as not allowed with a way to try again,
     *   and call again only behind a fresh user gesture: that call asks
     *   again, except that right after a decline the runtime waits out a
     *   short quiet spell (seconds, longer after repeated declines) before
     *   its notice goes up, the call waiting meanwhile; in a
     *   {@link watchTool} handler treat it as a denial — the watch asks
     *   again by itself once the viewer allows the connector or returns to
     *   the tab.
     * - `user_changed` — the account signed in on this host is no longer
     *   the viewer the page was loaded for; the runtime replaces the page.
     *   Render nothing from the call and make no further calls.
     */
    type McpErrorCode =
      | "needs_reauth"
      | "server_not_connected"
      | "selection_required"
      | "server_not_found"
      | "server_unavailable"
      | "not_in_manifest"
      | "blocked_by_policy"
      | "approval_required"
      | "tool_error"
      | "bad_request"
      | "cancelled"
      | "rate_limited"
      | "upstream_error"
      | "not_granted"
      | "capability_disabled"
      | "capability_removed"
      | "transform_error"
      | "consent_required"
      | "user_changed";

    /** One content block in a {@link CallToolResult}. */
    type ContentBlock =
      | { type: "text"; text: string }
      | { type: "image"; data: string; mimeType: string }
      | { type: string; [k: string]: unknown };

    /** Resolution of {@link callTool} and the `data` payload of
     * {@link watchTool} events — the tool's result. */
    interface CallToolResult {
      content: ContentBlock[];
      /** Present when the connector emits structured output. */
      structuredContent?: unknown;
      /**
       * Convenience: the JSON payload most connectors return —
       * `structuredContent` when present, else the first text block's
       * text parsed as JSON when it parses, else that text verbatim.
       * Read this instead of digging through `content`; the blocks
       * remain for images and multi-block results. (Text blocks no
       * longer carry a parsed `json` sibling — `payload` is its
       * documented home.)
       */
      payload?: unknown;
      /**
       * Present only when this resolution was served from the call
       * cache — shell-attested: the broker strips any inbound `cache`
       * field from upstream results before store and before delivery.
       * `storedAt` is when the served result was originally produced
       * (epoch ms) — drive "last updated" indicators for CACHED results
       * from it, never `Date.now()`; a result with no `cache` marker
       * executed fresh and may be stamped at receipt. `revalidating` is
       * `true` only on a
       * {@link watchTool} replay whose refresh is already in flight —
       * a newer delivery will follow. Absent = executed fresh (or an
       * older shell — treat as fresh). A result that is not a JSON
       * object (a bare string or array) cannot carry this marker and
       * always reads as fresh.
       */
      cache?: { storedAt: number; revalidating: boolean };
    }

    /** Advisory tool annotations — UNVERIFIED connector
     * self-description. Use to shape UX (labels, refresh affordances,
     * an in-page confirm before a destructive action), never as a
     * safety proof. A hint is present only when the connector
     * explicitly declared it; absent means the server did not say —
     * treat as unknown. */
    interface ToolAnnotations {
      /** The tool declares it does not modify state. Informs the
       * shell's caching policy for reads — see {@link CallToolOptions}. */
      readOnlyHint?: boolean;
      /** The tool may perform destructive (non-additive) updates. */
      destructiveHint?: boolean;
    }

    /** One tool exposed by a server. */
    interface ToolInfo {
      name: string;
      description: string;
      /** Absent as a whole on older shells, and for tools whose
       * server declared nothing. */
      annotations?: ToolAnnotations;
    }

    /** {@link describeTool}'s answer: one tool with its JSON Schemas. */
    interface ToolDescription extends ToolInfo {
      /** JSON Schema of the tool's `input` argument. */
      inputSchema: unknown;
      /** JSON Schema of the call's `payload`, when the server declares one. */
      outputSchema?: unknown;
    }

    /**
     * A per-server handle from {@link server}: one own method per listed
     * tool (any valid tool name — letters, digits, `_`, `.`, `-` — except
     * `then`, `toJSON` and `Object.prototype` members; reach a hyphenated
     * one as `handle["get-doc"](input)`). Each method takes the tool's `input` (and
     * {@link CallToolOptions}), resolves to the call's `payload` (see
     * {@link CallToolResult}; the whole result when no payload is
     * derivable), and rejects with the same {@link McpError}
     * {@link callTool} would. The object is frozen; any other tool stays
     * reachable through {@link callTool}.
     */
    type ServerHandle = Readonly<
      Record<
        string,
        (input?: unknown, options?: CallToolOptions) => Promise<unknown>
      >
    >;

    /**
     * Connector auth posture — a CLOSED set, normalized by the runtime.
     * Treat any unrecognized value as `"unknown"` (an older shell can
     * forward a raw upstream string). A manifest server absent from
     * `servers` has no connector for this viewer — same fix copy as
     * `server_not_connected`.
     * - `"connected"` — no auth action needed (authenticated or
     *   no-auth); individual calls can still reject (e.g.
     *   `selection_required`, `blocked_by_policy`).
     * - `"needs_reauth"` — credentials lapsed; same fix copy as the
     *   `needs_reauth` error branch.
     * - `"unknown"` — status check degraded or newer state; do NOT
     *   render reconnect UI — branch on call-time codes.
     */
    type ServerAuthStatus = "connected" | "needs_reauth" | "unknown";

    /** One connector the viewer has connected, intersected with the
     * manifest — or, before the viewer has been asked about it, one the
     * page declares (`authStatus: "unknown"`).
     *
     * ADDRESSING (settled): `server` is the connector DISPLAY NAME and
     * will remain so — it will never accept a connector id (ids are
     * per-viewer-account facts; a published page runs for many
     * viewers). If machine-assisted disambiguation is ever added it
     * arrives additively as an options hint that narrows the single
     * per-view name binding (conflicting hints reject `bad_request`) —
     * never per-call resolution, never the `server` positional.
     * ServerInfo carries no viewer-account identifiers, no icon URLs,
     * and no provenance fields. Deliberate and stable. */
    interface ServerInfo {
      /** Connector display name — the `server` argument to {@link callTool}. */
      server: string;
      /** What kind of server this is: absent or `"connector"` — one of the
       * viewer's claude.ai connectors; `"artifact"` — one of Claude's own
       * servers for this artifact (no manifest entry, no viewer consent,
       * never bars public sharing; its tools act on this artifact only;
       * {@link watchTool}, {@link invalidate} and {@link CallToolOptions}
       * caching do not apply to it — keep live data on `use("db")`).
       * Older shells never list artifact servers. */
      kind?: "connector" | "artifact";
      authStatus: ServerAuthStatus;
      tools: ToolInfo[];
    }

    /** Resolution of {@link listTools}. */
    interface ListToolsResult {
      servers: ServerInfo[];
      /**
       * Present and `true` when a {@link callTool} input may carry a
       * {@link FileArgument} in this view (a full `listTools()` call only,
       * never the one-server form). Absent: an older viewer, or no file
       * route for this viewer and artifact — send the bytes inline
       * (base64 under the 1 MiB input limit) or hide the action.
       */
      fileArgs?: boolean;
    }

    /**
     * A file inside a tool's `input`: exactly one leaf whose object has
     * this single member, placed where the tool wants the file's base64
     * (for example `{title, base64Content: {$file: {...}}, contentMimeType}`).
     * The viewer stages the bytes on the platform and the tool receives
     * the base64 string in the leaf's place, so the call's 1 MiB input
     * limit does not count the file. Limits: `data` at most 16 MiB, a
     * media type the platform accepts for staging, and `name` a bare
     * file name with an extension (the platform refuses one that does not
     * match the type). Over the
     * limit, malformed, or two leaves: `bad_request`. No file route for
     * this view ({@link ListToolsResult.fileArgs} absent):
     * `capability_disabled`. Check `fileArgs` first: a viewer that
     * predates file arguments sends the leaf without its bytes (or
     * refuses a large one as too big) and the tool fails. A call carrying
     * a file is a write: never cached, never a {@link watchTool} input.
     */
    interface FileArgument {
      $file: {
        data: Blob | ArrayBuffer | ArrayBufferView;
        name: string;
        type: string;
      };
    }

    /** Options for {@link callTool}. */
    interface CallToolOptions {
      /**
       * `false` — never cache this call, including where the read-only
       * default would apply.
       * Omitted — tools with a wire-explicit `readOnlyHint: true`
       * annotation default to `{staleTime: 0, gcTime: 5 min}`: the
       * result is stored (feeding {@link watchTool} replays and
       * coalescing with concurrent identical calls), and a repeat call
       * past `staleTime` executes fresh. Unannotated tools and
       * declared writes are never cached by default.
       * Object — opt in / tune. On tools with a wire-explicit
       * `readOnlyHint: false` annotation the object is ignored and the
       * call runs uncached (policy floor: a declared write can never
       * be cached or re-executed by cache machinery). Tools that do
       * not declare `readOnlyHint` behave as before: uncached unless
       * you opt in. Need confirmed-fresh data after an action?
       * `{cache: {refresh: true}}`.
       *
       * Freshness (fetchQuery semantics): a cached entry is served
       * only when younger than `staleTime` (your declared freshness);
       * older entries EXECUTE and resolve fresh. `callTool` never
       * serves anything past its declared freshness and never
       * revalidates in the background — a promise resolves once, so a
       * background result would have no delivery path. Keep data
       * current instead with {@link watchTool}, whose handler can hear
       * every refresh.
       *
       * Call identity is order-insensitive: `input` objects differing
       * only in property order are the same call, sharing one entry
       * and any in-flight execution. Cached per viewer + artifact;
       * successful results only; best-effort, size-bounded, cleared on
       * logout/account change/denial. Older shells ignore this option
       * (same call, uncached) — no feature detection needed.
       */
      cache?:
        | false
        | {
            /** Serve-without-execution window. Default 0; capped at
             * 300000 ms (5 min) — the cap bounds how long revoked
             * access keeps answering. */
            staleTime?: number;
            /** Entry lifetime. Default 300000 ms (5 min); capped at
             * 86400000 (24 h); zero/negative disables caching. */
            gcTime?: number;
            /** Skip the cache read: execute upstream, overwrite the
             * entry ("invalidate then call" in one flag). Failed
             * results still aren't stored — the previous entry remains
             * unless the failure was a denial. Ignored when not
             * caching. */
            refresh?: boolean;
          };
      /**
       * Abort this call. Held by the runtime — never crosses to the
       * shell; abort rejects promptly with `{code: "cancelled"}` and
       * best-effort-cancels the upstream execution. Best-effort: the
       * tool MAY still have run — treat an aborted call as outcome-unknown
       * and never pass a signal on a one-shot action you cannot
       * double-fire. (A `host:` call can also reject `cancelled` with no
       * signal — the viewer declined the app's confirm; that one never
       * ran.) An AbortSignal such as `AbortSignal.timeout(ms)`,
       * where available, is the per-call deadline mechanism — there is
       * deliberately no `timeoutMs` option. Older shells ignore the
       * cancel: the promise still rejects promptly.
       */
      signal?: AbortSignal;
    }

    /**
     * Do it once, now — the arm for ACTIONS. Call a tool on one of the
     * viewer's connectors. Serves a cached result only when younger
     * than `staleTime` (your declared freshness); otherwise executes
     * and resolves fresh. Never serves stale and revalidates behind
     * your back — a promise cannot hear the refresh. Rendering data
     * that should stay current? That is {@link watchTool}.
     *
     * `server` is the connector's display name (e.g. `"Google
     * Calendar"`), not a UUID — or `host:<name>` for a local server on
     * the viewer's device (see the namespace doc). `(server, tool)`
     * must be inside the scope the viewer consented to or the call
     * rejects with `not_in_manifest`.
     *
     * `input` must be plain JSON: objects, arrays, strings, numbers,
     * booleans, `null`. `Map`/`Set`/`Date`/typed arrays/`BigInt` reject
     * with `bad_request`. Omit for tools that take no arguments. The one
     * non-JSON value allowed is a single {@link FileArgument} leaf, when
     * {@link ListToolsResult.fileArgs} is `true`.
     *
     * Resolves with {@link CallToolResult} — read `result.payload` for
     * the JSON answer. A tool-level failure REJECTS with
     * `{code: "tool_error"}`. Rejects with {@link McpError}; never
     * throws synchronously.
     *
     * @param server  Connector display name.
     * @param tool    Tool name as listed by {@link listTools}.
     * @param input   JSON-serializable arguments object.
     * @param options Caching + cancellation — {@link CallToolOptions}.
     */
    function callTool(
      server: string,
      tool: string,
      input?: unknown,
      options?: CallToolOptions,
    ): Promise<CallToolResult>;

    /** One event delivered to a {@link watchTool} handler. */
    type WatchEvent =
      | { type: "data"; result: CallToolResult }
      | { type: "error"; error: McpError };

    /** Returned by {@link watchTool}. Synchronous and idempotent: after
     * it returns, the handler never fires. */
    type Unsubscribe = () => void;

    /**
     * Keep this data current — the arm for DISPLAY. Replays the cached
     * entry immediately (marked via `result.cache`; `revalidating:
     * true` when its refresh is already in flight — the one place a
     * past-freshness value is served, because this handler hears the
     * correction), executes when the entry is missing or stale, and
     * delivers every newer result for the identity — from its own
     * executions, from `refetchInterval` polls (clamped to a ~30 s
     * floor, paused while the page is hidden with a catch-up refetch
     * on return, coalesced per identity so N sections cost one
     * flight), from other cached callers of the same identity (calls
     * that opt OUT of caching do not feed watchers), and from
     * {@link invalidate}.
     *
     * Watch reads only — never one-shot actions; tools with a
     * wire-explicit `readOnlyHint: false` annotation reject.
     *
     * Returns a SYNCHRONOUS {@link Unsubscribe}. The first delivery
     * (replay included) arrives no earlier than a microtask after
     * registration — store the unsubscribe before anything can fire.
     * The one synchronous throw on this surface: a non-function
     * `handler` is a `TypeError` (with no handler there is no event
     * channel to route the failure to).
     *
     * ALL failures arrive on the handler as `{type: "error"}` events —
     * registration failures included (an older shell's `bad_request`
     * for the unknown method, `not_granted`, the 64-watch per-view
     * limit): no live updates will arrive, and the page simply keeps
     * the static experience it already renders. Transient errors keep
     * last-good data visible; authz denials retract it (see the
     * failure-design notes above).
     *
     * @param server  Connector display name.
     * @param tool    Tool name as listed by {@link listTools}.
     * @param input   JSON-serializable arguments (use `null` for
     *                input-less tools).
     * @param handler Receives {@link WatchEvent}s until unsubscribed.
     * @param options `cache` as on {@link callTool} (no `refresh`);
     *                `refetchInterval` declares polling, in ms.
     */
    function watchTool(
      server: string,
      tool: string,
      input: unknown,
      handler: (ev: WatchEvent) => void,
      options?: {
        cache?: { staleTime?: number; gcTime?: number };
        refetchInterval?: number;
      },
    ): Unsubscribe;

    /**
     * Drop cached {@link callTool} results (this artifact + viewer only).
     * Each argument narrows the scope, and `undefined` is the same as
     * omitting it: `invalidate()` = all; `(server)` = one connector;
     * `(server, tool)` = one tool, any input; a non-`undefined` `input` =
     * one exact argument set, matched by the cache's order-insensitive
     * call identity (`null` and `{}` both mean the input-less call —
     * unlike callTool, where an `undefined` input is also that same
     * call). `input` requires `server` and `tool` (else `bad_request`).
     * Once resolved, a matching callTool re-executes, and matching
     * WATCHED identities re-execute and deliver — call after a write so
     * cached reads refetch.
     *
     * Old shells reject `bad_request` ("unknown method"); old runtimes
     * `capability_removed`. Treat any rejection as nothing-cached and
     * continue.
     */
    function invalidate(
      server?: string,
      tool?: string,
      input?: unknown,
    ): Promise<void>;

    /**
     * List the connectors callable from this frame: the frame's published
     * manifest intersected with the connectors the current viewer has
     * actually connected. Call at load to adapt the UI to what's available
     * before calling {@link callTool}. A connector the viewer has not yet
     * been asked about lists from the manifest alone — `authStatus:
     * "unknown"`, its declared tool names, empty descriptions, no
     * annotations — and the first {@link callTool} or {@link watchTool}
     * on it asks the viewer (the call waits for the answer); listing
     * never asks.
     *
     * Duplicate-connector selection FIELDS never reach pages, but the
     * pending state is observable: a duplicated, not-yet-chosen connector
     * lists here with an empty tool set (as a not-connected connector
     * does) until the viewer chooses, and {@link callTool} rejects with
     * `selection_required`. Render the same degraded view you use for
     * `server_not_connected`.
     *
     * With `server`, lists that one server or none. Claude's own servers
     * for this artifact (`kind: "artifact"`) list first when present; one
     * the shell cannot read right now is omitted from the list (ask
     * {@link server} for it to see why).
     *
     * Rejects with {@link McpError}; never throws synchronously.
     */
    function listTools(server?: string): Promise<ListToolsResult>;

    /**
     * A handle for one server — a connector from the manifest, or one of
     * Claude's own servers for this artifact — whose methods are its
     * listed tools ({@link ServerHandle}):
     *
     *     const data = await mcp.server("artifacts_data");
     *     await data.set({ path: "tasks/t1", data: { title: "Ship it" } });
     *     const { docs } = await data.query({ collection: "tasks" });
     *
     * Rejects `server_not_connected` when no server by that name is
     * reachable from this view or it lists with no callable tools (on an
     * older shell that is every artifact server), `needs_reauth` for a
     * connector that lists in that state, and otherwise with
     * {@link McpError} as {@link listTools} does.
     */
    function server(name: string): Promise<ServerHandle>;

    /**
     * One tool's description and JSON Schemas. Answered for Claude's own
     * artifact servers; a connector name rejects `bad_request`, and an
     * older shell rejects an artifact server's too (`bad_request`, or
     * `capability_disabled` with no connector bridge) — treat any
     * rejection as "no schema available".
     */
    function describeTool(
      server: string,
      tool: string,
    ): Promise<ToolDescription>;
  }
}

interface ClaudeCapabilityMap {
  mcp: typeof Claude.mcp;
}

--- [on-demand file: /tmp/claude-0/bundled-skills/2.1.280/{BUNDLE_ID_REDACTED}/artifact-capabilities/0.2.52/permissions.d.ts] ---
/**
 * The `permissions` capability — read and request this page's capability
 * permissions at runtime. Two verbs: `state` reads (never prompts),
 * `request` asks (at most one batched dialog per call). Obtain the
 * namespace with `await claude.use("permissions")` — `null` means this
 * view cannot run the capability; design for absence.
 *
 * By default every capability asks the viewer lazily, at its first use; a
 * page that prefers the single up-front dialog calls `request` with no
 * arguments (or with a subset of names) during startup.
 *
 * States are UX consent, not capability: a "granted" answer does not
 * bypass any server-side check, and a capability call can still fail for
 * server-side reasons (entitlement, policy, auth) after a grant.
 */

declare namespace Claude {
  namespace permissions {
    /**
     * - "granted": usable now — consented, or a capability class that
     *   needs no standing grant (its own surface confirms each use).
     * - "prompt": available; first use (or `request`) will ask the
     *   viewer.
     * - "denied": the viewer declined during THIS page load. Resets on
     *   the next load; `request` will not re-ask this load.
     * - "unavailable": not usable and not askable here. Deliberately one
     *   bucket — an undeclared capability and a declared-but-unavailable
     *   one answer identically, so design for absence rather than
     *   probing why.
     */
    type PermissionState = "granted" | "prompt" | "denied" | "unavailable";

    /**
     * Read without prompting. With a capability name, resolves that one
     * state — unknown names answer "unavailable". With no arguments,
     * resolves the full map of this page's available capabilities;
     * unavailable capabilities are omitted entirely, so treat an absent
     * key as "unavailable" rather than expecting a key per declared
     * capability.
     *
     * Some capabilities additionally support SCOPED names —
     * `"<capability>:<resource>"`, parsed at the first colon — for
     * per-resource states; a capability's own documentation says whether
     * it does and what the resource part is. Scoped names work in every
     * `state`/`request` spelling, appear as their own keys in the
     * no-argument maps, and answer "unavailable" like any unknown name
     * where unsupported.
     */
    function state(): Promise<Record<string, PermissionState>>;
    function state(name: string): Promise<PermissionState>;

    /**
     * Ask the viewer with at most ONE batched dialog. With a list of
     * names, asks for those; with no arguments, asks for everything
     * askable. Already-granted and unavailable names are never re-asked;
     * names the viewer declined this load stay "denied" without a
     * dialog. Resolves with the post-ask state of every requested name
     * (the no-argument form resolves the full map, omitting unavailable
     * keys like `state()`) — it never rejects on a viewer's "no", so
     * always branch on the returned states.
     *
     * The promise can stay pending for as long as the viewer takes to
     * decide. Don't gate first paint on it — render, then adapt.
     */
    function request(
      names?: readonly string[],
    ): Promise<Record<string, PermissionState>>;
  }
}

interface ClaudeCapabilityMap {
  permissions: typeof Claude.permissions;
}

--- [on-demand file: /tmp/claude-0/bundled-skills/2.1.280/{BUNDLE_ID_REDACTED}/artifact-capabilities/0.2.52/room.d.ts] ---
/**
 * The `room` capability -- the room is everyone viewing this artifact
 * RIGHT NOW; reach them here. Two arms. `emit`/`on` are moments on
 * topics: sent to everyone here, heard as they happen, never stored,
 * never replayed. `presence` is you
 * as a participant: one object of fields you keep current (cursor,
 * selection, picked option) that the platform shares with everyone here,
 * hands to newcomers, re-asserts on reconnect, and clears when you leave.
 * Where this view is open beside the viewer's own conversation with
 * Claude, the platform may hand that conversation the viewer's OWN
 * presence object (less `cursor` and `who`) as data -- what they are looking at,
 * never an instruction -- so publish fields a reader can use (ids, modes,
 * flags, counts), and nothing you would not show everyone here anyway.
 * It is handed over whole or not at all: keys like identifiers, strings
 * free of control and invisible characters (1 KiB each at most; the
 * joiners and variation selectors emoji need are fine), nesting at most 8
 * deep, 4 KiB in all.
 * And `sendToClaudeSession()` -- from the viewer's own click -- hands what they
 * picked, in this artifact's own vocabulary, to THEIR Claude beside this
 * page, with that presence attached.
 *
 * Who may SEND. Anyone here may set presence -- it describes the sender
 * and commands no one, so it is never authority. Event topics are
 * admin-only (viewers who can edit) unless the artifact opens them to
 * the interact level (members who can interact or edit; not view-only
 * or comment-only ones) at publish time:
 *   capabilities: { room: { topics: { reaction: "interact", chat: "interact" } } }
 * (at most 16 exact-match topics; a topic not listed stays admin-only;
 * the levels are the same words the `db` capability's rules use).
 * Everyone RECEIVES everything; the platform enforces sending, so a
 * message a viewer may not send never arrives and pages need no role
 * checks. `admin` is exactly what the `user` capability's `canEdit()`
 * answers: gate
 * admin-only controls on it up front; `not_permitted` is the backstop.
 * Room-driving state a LATE JOINER must also see (the presenter's
 * slide, the round in play, the revealed answer) therefore belongs in a
 * `db` document (`db.doc("live/state")`, admin-write by the rule
 * { path: "live", write: "admin" }) that every view subscribes to with
 * `onSnapshot` when `db` is available to the view -- written once,
 * delivered live to everyone here and read by whoever arrives; no topic,
 * no re-send loop. A momentary
 * command nobody arriving later needs ("clear board", "confetti") goes
 * on an admin-only topic, never in presence. Without `db`, followers
 * remember the `peer` of the last such message and the sender re-emits
 * when `onPeers` reports `joined` (events are not replayed) and on a
 * slow interval; put an epoch in `data` if two writers can contend.
 *
 * Who is here. Same-org signed-in viewers (`kind: "viewer"`), plus -- when
 * the server admits it (flag-gated, off by default) -- the Claude Code
 * session that published this page, as an agent peer (`kind: "agent"`,
 * never `isMe`). The publishing session's client batches what it hears
 * and may drop moments past a budget, so it reads a digest, never a
 * live stream: send it summaries, not streams. Viewers outside the org
 * and every other agent cannot connect in v1 (an agent otherwise
 * narrates through `db`). Render a complete single-viewer page from the
 * start and let the room light it up. If a viewer who is NOT in the
 * room must eventually see it, it is not room data -- write it to `db`
 * or publish a version with `artifact`. A new version reloads every view
 * and empties the room. Obtain the namespace with
 * `await claude.use("room")`; `null` means this view cannot connect --
 * design for absence.
 */
declare namespace Claude {
  namespace room {
    /** Plain JSON -- a signal, never a document. */
    type Json = unknown;
    /** ^[a-z][a-z0-9_.-]{0,47}$ -- your own vocabulary, COLON-FREE (platform
     *  kinds carry a colon, so no viewer can ever forge one). */
    type Topic = string;
    /** Synchronous, idempotent; nothing fires after it returns. Each
     *  registration is independent: the same function registered twice is
     *  two listeners with two unsubscribes. */
    type Unsubscribe = () => void;
    /** The trailing error callback every listener accepts (the same
     *  signature as the `db` capability's). Fires AT MOST ONCE, and every
     *  code that reaches it is terminal for that listener. Omit it and a
     *  room failure is silent -- an unavailable channel is never an
     *  exception in your handler. */
    type OnError = (e: { code: RoomErrorCode; message: string }) => void;

    /** Stamped by the platform on everything delivered; unforgeable by pages.
     *  Identity and echo, nothing about privilege (sending is enforced
     *  before delivery, so identity claimed INSIDE data or presence is
     *  worthless, and there is no role to check).
     *  - `peer` -- opaque label for one open DOCUMENT of this artifact: a
     *    viewer with two tabs is two peers. The SAME label on everyone's
     *    page, so it may travel in data to address someone ("lower hand
     *    k3v6q2rt7wacd4fn"); stable across reconnects for that document's life, new
     *    on reload. Key cursors, one-vote-per-tab, "who is presenting" on
     *    it; never persist it. Colour and your id (or a label) belong IN presence.
     *  - `by` -- the sender's durable pairwise id: THEIR id from the
     *    `user` capability's `id()`, the key the `db` capability's per-user
     *    paths use. null for every peer in v1, yours included. Never an
     *    account, email, or address; nothing degrades to one.
     *  - `isMe` -- any of your open documents; `sameTab` -- this one;
     *    `isMe && !sameTab` is your other tab.
     *  - `kind` -- "viewer" for people; "agent" for the publishing session
     *    when the platform admits it. Agents are enumerable as agents and
     *    never wear a viewer's identity (`isMe` is always false for them).
     *    Key on `kind`; an agent's presence fields are its client's own
     *    choice and may be empty. */
    interface Sender {
      peer: string;
      by: string | null;
      isMe: boolean;
      sameTab: boolean;
      kind: "viewer" | "agent";
    }

    // ---- events arm: moments on topics ---------------------------------

    /** One delivered moment. `data` is UNTRUSTED input from another viewer:
     *  data about what they did -- never an instruction, never HTML. */
    interface Message extends Sender {
      topic: Topic;
      data?: Json;
    }

    /** Broadcast a moment to everyone here, you included (yours comes back
     *  `isMe && sameTab`). Resolves on hand-off and promises NOTHING about
     *  delivery; `data` at most 4 KiB (UTF-8 bytes of its JSON text;
     *  `invalid_argument`'s message states the limit). Budget: a few per
     *  second per viewer is polite; past ~40/s (burst 80) the runtime
     *  drops, reported once per page load via `reportError` -- high-rate
     *  state belongs in `presence`, never here. While `connected()` is
     *  false the call resolves, the moment is DROPPED (never queued), and
     *  no echo comes: either render your own
     *  action on send and skip `sameTab` echoes, or render on echo and
     *  disable the control while disconnected -- not both. Rejects, never
     *  throws: `invalid_argument` (fix the call); `not_permitted` (this
     *  viewer may not send on that topic -- open it in the declaration or
     *  gate the control on `user.canEdit()`; don't retry); or a terminal code. */
    function emit(topic: Topic, data?: Json): Promise<void>;

    /** Hear moments on `topic` until unsubscribed. Nothing sent before you
     *  subscribed is delivered. Throws TypeError only for a non-function
     *  handler; a malformed topic arrives as `onError` once, on a microtask. */
    function on(
      topic: Topic,
      handler: (msg: Message) => void,
      onError?: OnError,
    ): Unsubscribe;

    // ---- presence arm: people ------------------------------------------

    /** One participant -- one open document -- you included. `presence` is
     *  their current object; its fields are whatever that page set, so read
     *  defensively (a phone has no cursor). `updatedAt` is YOUR clock
     *  (`Date.now()`, ms) when their presence last CHANGED here; keepalives
     *  don't bump it. Dim idle peers with it; for "raised 2 min ago" put the
     *  sender's own timestamp in a field. Peers and their `presence` are
     *  frozen, and one that didn't change is the same object across
     *  deliveries -- compare with ===, don't mutate or accumulate them.
     *  (The `db` capability makes the identical promise about snapshots.) */
    interface Peer extends Sender {
      presence: Readonly<Record<string, Json>>;
      updatedAt: number;
    }

    /** Merge `patch` into YOUR presence object: per field, latest value wins;
     *  a top-level `null` removes the field; no field you set is skipped.
     *  Applied locally at once (your cursor moves without a round-trip) and
     *  sent coalesced, whole, about 30 times a second -- call it from every
     *  pointermove if you like. Your MERGED object (not the patch) must
     *  stay within 4 KiB of JSON text (UTF-8 bytes); a patch that would
     *  exceed it rejects `invalid_argument` and is not applied. Send
     *  absolute state ("at 0.42, 0.31"), never deltas. If you publish
     *  viewers' presence, render everyone's, with a marked "you". v1
     *  delivers no names and `by` is null, so identify yourself IN
     *  presence: put your own AWAITED `user.id()` there (declare
     *  `user: {scopes: ["profile"]}`; `user: {}` gives ids but no names)
     *  and let each page resolve the ids on screen with
     *  `user.profiles(ids)` -- names and avatars as ITS viewer sees them
     *  (`p.name || "Someone"`), instead of trusting a name string another
     *  page shipped; a typed nickname and colour in presence are the
     *  fallback when `user` is undeclared or `id()` is null. Either way
     *  it is display data, untrusted like everything else here, never
     *  authority.
     *  There is no ordering between your presence and your events. Rejects,
     *  never throws, like `emit` minus `not_permitted`. */
    function presence(patch: Record<string, Json | null>): Promise<void>;

    /** Everyone here now, you included (once the platform answers, with
     *  `presence: {}` until you set one, present even while disconnected).
     *  A synchronous getter, never a Promise: the SAME frozen snapshot until
     *  something changes (a frozen empty array until the first answer) --
     *  pass it straight to `useSyncExternalStore`, or read it every frame.
     *  Complete up to about 256 peers; beyond that a lower bound (events
     *  still reach everyone). */
    function peers(): readonly Peer[];

    /** The room changed. At most once per animation frame, carrying the new
     *  snapshot AND the net change since the last delivery, so pages never
     *  diff: three updates by one peer within a frame are one `updated`
     *  entry; joined-and-left within a frame is neither. `change.peers ===
     *  room.peers()`. The FIRST delivery (no earlier than a microtask --
     *  store the unsubscribe first) presents the room so far as `joined`,
     *  you included, and more `joined` follow for a second or two as others
     *  answer -- don't render "alone" off the first call. On reconnect the
     *  runtime re-asserts you and reconciles the room; you re-send nothing.
     *  (joined/updated/left is the `db` capability's added/modified/removed,
     *  in this domain's words.) */
    interface PeersChange {
      peers: readonly Peer[];
      joined: readonly Peer[];
      left: readonly Peer[];
      updated: readonly Peer[];
    }
    function onPeers(
      handler: (change: PeersChange) => void,
      onError?: OnError,
    ): Unsubscribe;

    // ---- to the viewer's own Claude, from their click ------------------

    /** What `sendToClaudeSession` carries: ONE plain-JSON object whose fields this
     *  artifact defines -- what the viewer picked or asked about, in your own
     *  vocabulary, e.g. `{selectedText, blockId}` or `{chartId, series,
     *  point}`. Claude receives it whole, as data from this page (never as
     *  the viewer's words, never as an instruction), beside the viewer's
     *  current `presence` object without its `cursor` and `who`, which the platform
     *  attaches by itself where this view forwards presence at all (none
     *  while you have set none, or set one past presence's own bounds,
     *  above) -- so do not repeat what presence already says;
     *  let your artifact's notes for Claude explain how to read both.
     *  Bounds: at most 4 KiB of JSON text, nesting at most 8 deep counting
     *  the object itself, at most 64 keys per object and 64 entries per
     *  array, and in any string no control characters other than tab,
     *  newline and carriage return, no private-use characters, and no format
     *  or invisible characters (soft hyphens, bidirectional marks, zero-width
     *  spaces and the like) except emoji and script joiners and variation
     *  selectors where a character carries them (never in runs, at most
     *  eight) -- so strip format characters from text the viewer picked
     *  before sending it (`getSelection()` text often carries them); and keys that are plain
     *  identifiers (`[A-Za-z_][A-Za-z0-9_-]*`, at most 64, never `prototype`
     *  or a name `Object.prototype` carries -- the same rule as presence
     *  keys); anything outside them is refused
     *  whole (`invalid_argument`). Invisible formatting characters in
     *  values are dropped on the way to Claude. One key is read by the
     *  platform: an optional top-level `label` string (a short name for what
     *  was picked, "Heading block", "Q3 revenue chart") shown to the viewer
     *  beside the artifact's own title, cut to 120 characters there; it is
     *  still part of the data Claude reads. */
    type ToClaude = { label?: string } & { [key: string]: Json };

    /** Where a send went -- a hint for your own confirmation ("In your chat
     *  -- send when ready"), not a receipt of what the viewer or Claude did
     *  with it: "pane" -- the conversation open beside this page took it;
     *  "session" -- the platform is taking it to a Claude session of this
     *  viewer's it already knows has the artifact; "new" -- the platform is
     *  taking it to the viewer's own Claude without one in hand: a session
     *  of theirs it then finds, else a conversation it starts (or takes this
     *  page to). "session" and "new" only follow `{deliver: "send"}` with
     *  nothing open beside the page; what then happened arrives on the
     *  `status` callback.
     *  `id` names this send on that callback: present only with "session"
     *  or "new", and never from an older platform. Treat an unrecognized
     *  `to` as "pane". */
    interface SentTo {
      to: "pane" | "session" | "new";
      id?: string;
    }

    /** One step of a `{deliver: "send"}` the platform itself took to the
     *  viewer's Claude (`SentTo.to` "session" or "new"), told to that
     *  send's `onStatus` callback: `working` -- on its way, nothing has it
     *  yet; `sent` -- a session or a new conversation of the viewer's took
     *  it; `failed` -- it reached no Claude, with `reason` saying why in a
     *  closed set the platform documents (`signed_out`, `reauth`,
     *  `refused`, `unavailable`, `unconfirmed`, and more; treat one you do
     *  not know as `unavailable`); a later `sent` supersedes a `failed`, and
     *  a state may be told more than once. `shell` names the platform build
     *  that said so, for your own telemetry. A state you do not recognize
     *  changes nothing you show. Expect no calls when `SentTo` carried no
     *  `id`. */
    interface SendStatus {
      state: "working" | "sent" | "failed";
      reason?: string;
      shell?: string;
    }

    /** How `sendToClaudeSession` hands `data` over. `deliver` (default
     *  "stage"): "stage" -- it appears in the viewer's composer as one
     *  attachment they can see and remove, and nothing reaches Claude until
     *  the viewer sends their own message with it; "send" -- for a control
     *  whose whole point is that Claude acts on it now (a "Build this now"
     *  button): the platform shows the viewer what this page is about to
     *  send and asks them, in its own dialog, whether to send it; their Send
     *  starts Claude's turn with `data` as the whole message (framed as
     *  coming from this page, never as their words), their Cancel discards
     *  it, and a platform that cannot ask (an older one, or a conversation
     *  that cannot take a turn right now) stages it instead. With nothing
     *  open beside the page, a "send" from one of the platform's own page
     *  types goes to the viewer's own Claude instead -- a session of theirs
     *  that has the artifact, else a new conversation of theirs, else a
     *  chat this page leaves for -- on the viewer's own key press in that
     *  page; other pages hear `claude_unavailable` there, as for "stage".
     *  The call resolves when the platform has taken it, before the viewer
     *  decides or the conversation answers -- so with "send" word your own
     *  confirmation for either outcome ("Sent to Claude -- check the
     *  conversation"), or pass `onStatus` to hear how a send the platform
     *  itself took went (`SendStatus`), as `sample`'s `onText` hears a reply. Treat an unrecognized `deliver` as
     *  "stage"; the platform does. */
    interface SendToClaudeSessionOptions {
      deliver?: "stage" | "send";
      /** Called with each step of a send the platform itself took to the
       *  viewer's Claude (`SentTo` "session" or "new"); never for one the
       *  conversation beside the page took, nor for a staged send. Kept in
       *  the page; nothing of it crosses to the platform. */
      onStatus?: (status: SendStatus) => void;
    }

    /** `canSendToClaudeSession`'s answer -- whether a `sendToClaudeSession`
     *  can go through from this view right now. A snapshot, not a subscription: re-check
     *  when (re)showing the control, and treat an unrecognized value as
     *  unavailable.
     *  - "available" -- offer the control: a conversation open beside this
     *    page takes it.
     *  - "available_if_summoned" -- nothing is open beside the page, but a
     *    `{deliver: "send"}` goes to the viewer's own Claude (`SentTo`
     *    "session" or "new"); a staged send is still `claude_unavailable`.
     *    Offer a control that sends, not one that stages.
     *  - "no_session" -- nothing beside this view would take it right now
     *    (the page is not open next to a conversation with Claude).
     *  - "unsupported" -- this browser cannot prove the viewer's click to the
     *    platform (most can); hide the control rather than show one that
     *    always fails.
     *  - "off" -- sending to Claude is not offered in this view at all. */
    type CanSendToClaudeSession =
      | "available"
      | "available_if_summoned"
      | "no_session"
      | "unsupported"
      | "off";

    /** Hand something to the VIEWER'S OWN Claude -- the conversation open
     *  beside this page -- on their say-so: call it FROM their click or key
     *  press on your control, synchronously (nothing awaited before it), on
     *  the namespace you obtained with `await claude.use("room")` at
     *  startup; the gesture is proven from the call itself, and a call
     *  outside one is refused. By default it STAGES: `data` appears in the
     *  viewer's composer as one attachment they can see and remove, named for
     *  this artifact (with your `label`, when given), a newer send from this
     *  page replaces it, and nothing reaches Claude until the viewer sends
     *  their own message; with `{deliver: "send"}` the platform instead asks
     *  the viewer to send it now, or, with nothing open beside one of its own
     *  page types, takes it to the viewer's Claude itself
     *  (`SendToClaudeSessionOptions`). There is no way for a page to start
     *  Claude's turn by itself: the viewer's own Enter or their answer to the
     *  platform's dialog does. For the platform's own page types, whose code
     *  is the platform's, the viewer's key press on the page's control is
     *  that answer: the platform may submit a `{deliver: "send"}` without
     *  its dialog beside a conversation, and does so for every such page
     *  type when it takes the send to the viewer's Claude itself. To write
     *  a comment and
     *  bring Claude into its thread, use the `comments` capability's
     *  `sendToClaude` instead. Resolves `SentTo` once the platform has
     *  taken it. Rejects, never throws: `invalid_argument`
     *  (not a plain object, empty, or outside the bounds above -- `message`
     *  says which; nothing was sent), `claude_unavailable` (no provable
     *  gesture, or nothing beside this view takes it; nothing was sent:
     *  keep the viewer's draft and re-check `canSendToClaudeSession`),
     *  `rate_limited` (sends are held to a human cadence; try again
     *  shortly), or `upstream_error`. Independent of the room's
     *  connection: it works while `connected()` is false and after a
     *  terminal error, because it goes to the viewer's conversation, not
     *  to the room. Where the platform predates the method the call
     *  rejects (`capability_removed`, or `invalid_argument` naming an
     *  unknown method from an older platform half -- not a page bug then)
     *  and sends nothing: gate the control on `canSendToClaudeSession`, not on
     *  the code. */
    function sendToClaudeSession(
      data: ToClaude,
      options?: SendToClaudeSessionOptions,
    ): Promise<SentTo>;

    /** Whether `sendToClaudeSession` can go through for this viewer right now:
     *  call it before rendering your control and enable the control only
     *  on "available" (either `deliver`) or "available_if_summoned"
     *  (`deliver: "send"` only); on any other value or any rejection (a platform that
     *  predates the method rejects `capability_removed` or
     *  `invalid_argument`), hide it. Posts nothing to Claude, never
     *  prompts, cheap per render; the answer can change after load, so
     *  re-check when (re)showing the control. */
    function canSendToClaudeSession(): Promise<CanSendToClaudeSession>;

    // ---- connection: fail-open, but visible ----------------------------

    /** Are you talking to anyone right now? A synchronous FUNCTION --
     *  keep the parentheses. false at load is normal (true within about
     *  a second); brief reconnects are normal (the platform refreshes the
     *  connection periodically); treat only a true-to-false edge that
     *  persists ~2 s as a disconnect.
     *  false can also be permanent: a viewer the platform cannot connect
     *  gets `not_granted` once on every listener's `onError` and from every
     *  call (the `sendToClaudeSession` pair excepted) -- your terminal path,
     *  never a spinner keyed on this. */
    function connected(): boolean;
    /** Fires once with the current state soon after registration (no
     *  earlier than a microtask), then on every change. */
    function onConnection(
      handler: (connected: boolean) => void,
      onError?: OnError,
    ): Unsubscribe;

    /** `emit`/`presence`/`sendToClaudeSession` reject with these -- as
     *  Promises, never synchronous throws. Listeners receive only the
     *  terminal ones, once, via `onError`.
     *  - `invalid_argument` -- topic grammar, non-JSON or exotic values, too
     *    deep, over the byte limit, or not a function where one is
     *    required; `message` says which. A page bug: fix the call.
     *  - `not_permitted` -- `emit` only, see above. A declaration bug.
     *  - `upstream_error` -- transient or unknown; not terminal, safe to drop.
     *  - `claude_unavailable` / `rate_limited` -- `sendToClaudeSession` only, see
     *    there; not terminal.
     *  Terminal for this page load -- every listener hears one and is dead,
     *  calls reject with it thereafter (`sendToClaudeSession` and
     *  `canSendToClaudeSession` excepted), `peers()` decays to just you,
     *  `connected()` reads false; render the single-viewer page once and
     *  don't editorialize (the surrounding app owns access messaging):
     *  - `revoked` -- this view's grant was WITHDRAWN while running (access
     *    or sharing changed). A platform pause of the channel is NOT this:
     *    it reads as connected() false and recovers. Same code, same
     *    meaning, in `db`.
     *  - `not_granted` -- never granted: this viewer cannot be connected.
     *  - `capability_disabled` / `capability_removed` / `transform_error` --
     *    lifecycle. Treat an unknown code as `upstream_error`. */
    type RoomErrorCode =
      | "invalid_argument"
      | "not_permitted"
      | "upstream_error"
      | "claude_unavailable"
      | "rate_limited"
      | "revoked"
      | "not_granted"
      | "capability_disabled"
      | "capability_removed"
      | "transform_error";
  }
}

interface ClaudeCapabilityMap {
  room: typeof Claude.room;
}

--- [on-demand file: /tmp/claude-0/bundled-skills/2.1.280/{BUNDLE_ID_REDACTED}/artifact-capabilities/0.2.52/sample.d.ts] ---
/**
 * The `sample` capability — ask Claude from the published artifact, on
 * the viewer's own Claude account, and get the answer (live, as it is
 * written, if you want to show it that way).
 *
 * The short version:
 *
 *     const sample = await claude.use("sample")                          // null: hide the feature
 *     const { text, truncated } = await sample(input, options?)         // the whole answer
 *     const data = await sample.json(input, options?)                    // the answer parsed as JSON
 *     // input   = "prompt" | [{role: "user"|"assistant", content}, ...] ending on a user turn
 *     // options = { onText?({text, delta}), signal?, tools?, images?, modelTier?, cache? }
 *     // failure = one rejected {code, message, text?}; text = the part you may keep
 *
 * One function, one promise. Pass `onText` to render the answer while it
 * streams (each call brings `text`, the WHOLE answer so far, to assign,
 * and `delta`, the new part, to append); pass `signal` to be able to stop. The same promise
 * resolves at the end with the full text, or rejects with the one error
 * shape. There is no stream object, no handle and no second promise.
 *
 * Each call is independent and memory-less: Claude sees ONLY the `input`
 * you pass (a prompt string, or the short list of turns the PAGE keeps
 * for a chat) plus any `images`, under fixed platform framing. It cannot
 * browse, remembers nothing between calls, has no tools except the page
 * functions you pass in `options.tools`, and there is no system prompt
 * the page controls: put the instruction, the page's data and the output
 * format you want in `input`.
 *
 * Availability. Inside a viewer the page is framed and `window.claude`
 * exists before any page script runs; served top-level by the platform on
 * the artifact's own host it exists too, with every `use()` resolving
 * `null` there for now, while any other top-level copy of the page has
 * no `window.claude` at all. `const sample =
 * await claude.use("sample")` resolves this function as soon as the
 * runtime starts, asking the viewer nothing, or `null` where it never
 * can (for example the page is framed by a host that is not a Claude
 * viewer; decided about ten seconds after load) — design for absence
 * and hide the feature. Consent is per call, not per `use()`: a viewer
 * who declines still gets the function and every call rejects
 * `not_granted`, so your `catch` hides the feature too. Inside a React
 * effect, `await claude.use("sample")` in the effect itself and treat
 * `null` like `not_granted`: absence.
 *
 * Cost and consent — read before designing UI around it. A call that
 * reaches Claude spends the VIEWER's own Claude usage, so the first call
 * in a view asks the viewer to allow it; the call waits while they decide
 * and a decline rejects `not_granted` for the rest of the view. Answers
 * are cached for the viewer by default: repeating a call with the same
 * `input`, `modelTier` and `images` within five minutes replays the
 * stored answer without contacting Claude (see
 * {@link sample.SampleOptions.cache}). A couple of calls run at once for
 * a viewer, a few more wait their turn, and a flood rejects
 * `rate_limited`. So: sample on an explicit viewer action ("Ask",
 * "Summarize", "Send") or once at load with a prompt that is stable
 * across loads — never from a loop or a timer — and render a sensible
 * page when sampling is unavailable.
 *
 * Timing to design for: on `"quick"` a short prompt answers in a second
 * or two; on `"default"`/`"complex"` Claude thinks silently before it
 * writes, so the first text usually takes 5-60 s (up to two minutes for
 * a long structured prompt), then streams in over seconds; each round is
 * capped at about five minutes; a call that uses `tools` is several
 * rounds back to back — each thinks, then calls your tools or writes: a
 * three-round call on the default tier commonly takes 30-90 s (about a
 * second per round on `"quick"`), longer with images (re-sent every
 * round). Show progress from inside your `execute` functions. Show
 * "Thinking..." from the moment
 * you call until `onText` first fires (that also covers the consent
 * dialog and a call waiting its turn), and offer a Stop button on
 * anything long. A call can still fail AFTER `onText` has fired: the
 * promise rejects and `e.text` tells you what may stay on screen.
 *
 * Failure design: every failure is one rejected promise carrying a
 * {@link sample.SampleError} `{code, message, text?}` — never a
 * synchronous throw. Branch on `code`, never on `message`; NEVER retry
 * from a loop. {@link sample.SampleErrorCode} groups the codes by what
 * the page should do about each.
 */
declare namespace Claude {
  /**
   * Ask Claude. Resolves with the complete answer; rejects with a
   * {@link sample.SampleError}. Never throws synchronously.
   *
   * The request leaves the page right after your call returns (on the
   * next microtask), not when you `await` — so a call whose `signal` is
   * aborted in the same synchronous block (a React effect cleanup, a
   * superseded keystroke) sends nothing, asks the viewer nothing and
   * costs nothing. The arguments are read once, at call time: later
   * changes to a turn array or a `FileList` do not affect the call.
   *
   *     // One-shot: a button that summarizes what the page shows
   *     const sample = await claude.use("sample");          // null: hide the button
   *     btn.onclick = async () => {
   *       btn.disabled = true;
   *       out.textContent = "Thinking...";
   *       try {
   *         const { text } = await sample("Summarize in 3 bullets:\n\n" + notes.textContent);
   *         out.textContent = text;
   *       } catch (e) {
   *         out.textContent = copyFor(e.code);                // your map from code to viewer copy
   *       } finally {
   *         btn.disabled = false;
   *       }
   *     };
   *
   *     // Streaming with a Stop button: render the answer as it is written
   *     let ctl;
   *     stopBtn.onclick = () => ctl?.abort();
   *     askBtn.onclick = async () => {
   *       ctl = new AbortController();                     // a NEW controller per call
   *       out.textContent = "Thinking...";
   *       try {
   *         const { truncated } = await sample("Explain this config:\n\n" + src, {
   *           signal: ctl.signal,
   *           onText: ({ text }) => { out.textContent = text; },   // whole answer so far
   *         });
   *         if (truncated) note.textContent = "Cut short — ask for less at a time.";
   *       } catch (e) {
   *         out.textContent = e.text ?? "";                 // keep what may be kept; else clears
   *         if (e.code !== "cancelled") note.textContent = copyFor(e.code);
   *       }
   *     };
   *
   *     // Chat: standing instructions are a leading user turn; the list ends on the new message
   *     turns.push({ role: "user", content: box.value });
   *     const { text } = await sample([{ role: "user", content: RULES }, ...turns], {
   *       cache: false, signal: ctl.signal, onText: ({ text }) => { bubble.textContent = text; },
   *     });
   *     turns.push({ role: "assistant", content: text });
   *
   * @param input   What Claude reads: a prompt string, or user/assistant
   *                turns starting and ending on a user turn — see
   *                {@link sample.SampleInput}. At most 64 KiB of text in total.
   * @param options {@link sample.SampleOptions}: `onText` to stream, `signal`
   *                to cancel, `tools`, `images`, `modelTier`, `cache`.
   *                Optional; must be a plain object.
   */
  function sample(
    input: sample.SampleInput,
    options?: sample