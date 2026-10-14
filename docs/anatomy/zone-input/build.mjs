// Builds "Fig 1 · Zone input": an isometric, interactive figure of one zone input on the
// v4 Smart Input Module (dry contact -> PC817 -> 74HC04 -> input-only GPIO36), with the
// routed isolation slot and the RGB status LED.
//
//   node docs/anatomy/zone-input/build.mjs            -> zone-input.html (dark)
//   node docs/anatomy/zone-input/build.mjs --light    -> zone-input-light.html
//   node docs/anatomy/zone-input/build.mjs --audit    -> also runs the geometry audit
//
// The drawing kit is NOT vendored into this repo: it is imported from the "anatomy" Claude
// skill (default ~/.claude/skills/anatomy, override with ANATOMY_HOME). The built HTML pages
// are standalone, so only rebuilding needs the skill.
//
// Facts come from docs/pinmap.md (v4 netlist) and firmware/smart-input-module.yaml:
// energized = GPIO HIGH, 1k series resistor, 10k pull-up, delayed_on 50 ms / delayed_off 1 s,
// a 500 ms output tick, and the RGB priority red > blinking blue > green.

import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const KIT_HOME = process.env.ANATOMY_HOME ?? join(homedir(), ".claude", "skills", "anatomy");
const load = (rel) => import(pathToFileURL(join(KIT_HOME, rel)).href);
const k = await load("kit/iso-kit.mjs");
const G = await load("kit/lathe.mjs");
const A = await load("kit/audit.mjs");
const { tubePieces, tubeSvg } = await load("kit/tube.mjs");
const { kitScript } = await load("scripts/inline-kit.mjs");

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--dark") ? "dark" : "light"; // light ships; --dark for the dark variant

// ---------------------------------------------------------------------------
// World: 1 mm = 2.5 units. x runs from the field side (-x) to the logic side (+x),
// the five channels are rows along y (Z1 nearest the viewer), z is up.
// ---------------------------------------------------------------------------
const W = 720;
const H = 470;
const AZIMUTH = 140; // looking from -x, +y: the terminal entries (-x faces) face the viewer
const ELEVATION = 32;

const BASE = { x: -208, y: -84, w: 406, d: 220, r: 8 };
const BASE_H = 12;
const FOOT_H = 5;
const PCB = { x: -134, y: -72, w: 322, d: 144, r: 4 };
const STANDOFF_H = 14;
const PCB_H = 4; // 1.6 mm
const T = STANDOFF_H + PCB_H; // top of the board
const SLOT = { x: -4, y: -66, w: 8, d: 132, r: 4 }; // 3.2 mm routed isolation slot
const KEEPOUT = 6.6; // silkscreen isolation boundary, each side of the slot

// Channel rows (y of each PC817's centre), and the 74HC04 gate each one uses (pinmap.md).
const ROWS = [
  { id: "Z1", y: 52, gpio: 36, inPin: 1, outPin: 2 },
  { id: "Z2", y: 26, gpio: 39, inPin: 3, outPin: 4 },
  { id: "Z3", y: 0, gpio: 34, inPin: 5, outPin: 6 },
  { id: "Z4", y: -26, gpio: 35, inPin: 9, outPin: 8 },
  { id: "MON", y: -52, gpio: 32, inPin: 11, outPin: 10 },
];
const PIN = 6.35; // 2.54 mm pitch

// 74HC04 (U8), DIP-14, long axis along y, notch toward +y.
const U8 = { x0: 62, x1: 78, rowL: 60.5, rowR: 79.5, y: 0 };
const u8Pin = (n) => (n <= 7 ? [U8.rowL, 19.05 - (n - 1) * PIN] : [U8.rowR, -19.05 + (n - 8) * PIN]);

// DevKitC on female headers H1 (x 112) and H2 (x 175.5); 38-pin board, 19 pins a side.
const H1X = 112;
const H2X = 175.5;
const HEADER_H = 21.25; // 8.5 mm female header
const DEV = { x: 108.75, y: -68.75, w: 70, d: 137.5, r: 2 };
const DEV_Z = T + HEADER_H;
const DEV_TOP = DEV_Z + 4;
const h1Pin = (n) => [H1X, 57.15 - (n - 1) * PIN]; // pin 1 3V3, 3 VP (GPIO36), 4 VN (39), 5 IO34 ...

// Test points and the two meters on the bench in front of the board.
const TP1 = [34, 64]; // Z1 collector / U8 pin 1
const TP2 = [92, 66]; // GPIO36
const TP3 = [[56, 64], [66, 66]]; // logic GND, one post per meter
const TP_TOP = T + 8;
const TP_BALL = 1.9;
// Each meter stands in front of and to the right of its test points, so its two leads
// run across the screen (a lead heading straight away from the viewer folds on screen).
const METERS = [
  { name: "meter.collector", x: 70, y: 103, tp: TP1, gnd: TP3[0] },
  { name: "meter.gpio", x: 140, y: 103, tp: TP2, gnd: TP3[1] },
];
const METER_R = 15;
const METER_FROM = 0;
const METER_SPAN = (100 * Math.PI) / 180;
const METER_FULL = 5; // 0-5 V scale

// RGB status LED U7 (HV-5RGB60, common cathode) near the DevKitC.
const RGB = [94, -50];

// The zone relay (stand-in for the FDAS panel's zone relay module) on the bench.
const RELAY = { x: -198, y: 30, w: 50, d: 44, r: 2 };
const RELAY_BASE_H = 8;
const RELAY_TERM_X = -158; // terminal blocks at the +x edge of its base, facing the board
const J1 = ROWS[0].y;
const PIN1_Y = J1 - PIN; // terminal pin 1 = signal
const PIN2_Y = J1 + PIN; // terminal pin 2 = shared field supply +
const ARMATURE_DROP = 1.5;
const BLADE_TRAVEL = 0.6; // closes the 0.6 gap between the two contact rivets

const P = k.fitProjection(
  [...k.boxCorners(BASE, -BASE_H - FOOT_H, 0), [DEV.x, DEV.y, DEV_TOP + 8], [DEV.x + DEV.w, DEV.y + DEV.d, DEV_TOP + 8], [RELAY.x, RELAY.y, 38]],
  W,
  H,
  { pad: 64, azimuth: AZIMUTH, elevation: ELEVATION },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const top = (pts, z = T) => k.onTop(pts, z, P);
const UP = (x, y, z) => G.frameOf([x, y, z], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const ALONG_X = (x, y, z) => G.frameOf([x, y, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);

const R = A.recorder(P);
const put = (name, ref, svg, shapes = [], rest = {}) => R.put({ name, at: ref, svg, shapes: shapes.map(R.solid), ...rest });

// A slab part: drawing plus its recorded shape.
function slab(name, plan, z, h, style = {}, { steps = 3, bevel = 0, inner = "" } = {}) {
  return { svg: S(k.slabOf(plan, z, h, P, steps, bevel), { ...style, inner }), shape: A.slab(plan, z, h, { name }, steps) };
}
function cyl(name, cx, cy, r, z, h, style = {}, steps = 24) {
  return { svg: S(k.cylinder(cx, cy, r, z, h, P, steps), style), shape: A.cylinder(cx, cy, r, z, h, { name }) };
}

// ---------------------------------------------------------------------------
// Bench base plate on feet (ground for the audit).
// ---------------------------------------------------------------------------
{
  const out = [`<path class="iso-halo" d="${k.haloOf(BASE, -BASE_H - FOOT_H, BASE_H, P)}"/>`];
  const shapes = [A.slab(BASE, -BASE_H, BASE_H, { name: "stand.base", ground: true }, 8)];
  const feet = [...k.corners(BASE, 24)].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) {
    out.push(S(k.cylinder(x, y, 8, -BASE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6.2, -BASE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(BASE, -BASE_H, BASE_H, P, 8, 1.6), { tone: "lo" }));
  out.push(Ln(k.planOutline(k.insetPlan(BASE, 5), 0, P), { tone: "faint" }));
  const screws = k.corners(BASE, 11);
  out.push(Ln(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(Dots(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // Ruler strip along the near (-x) edge, ticks every 2 mm, major every 10 mm.
  const strip = { x: BASE.x + 9, y: BASE.y + 9, w: 7, d: 96, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.y + 3, strip.y + strip.d - 3, 5, 5, strip.x + strip.w - 0.8, 0.6, [2, 3.6], P, "y");
  out.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
  // Label plate in the far corner with three rule lines (they stand for printed text).
  const label = { x: -196, y: 98, w: 38, d: 26, r: 1.5 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 4), { tone: "lo", crease: "none" }));
  out.push(Ln(k.planOutline(k.insetPlan(label, 1.8), 0.8, P), { tone: "faint" }));
  out.push(Ln([[6, 26], [6, 18], [6, 22]].map(([inset, len], i) => k.lineOnTop([label.x + inset, label.y + 7 + i * 5], [label.x + inset + len, label.y + 7 + i * 5], 0.8, P)).join(""), { tone: "lo", free: true }));
  out.push(Dots([at([label.x + 3.4, label.y + 3.4, 0.8]), at([label.x + label.w - 3.4, label.y + label.d - 3.4, 0.8])], { size: 0.45 }));
  put("stand.base", [0, 0, -BASE_H], out.join(""), shapes, { key: -1e6 });
}

// ---------------------------------------------------------------------------
// Standoffs under the board.
// ---------------------------------------------------------------------------
const STANDOFFS = k.corners(PCB, 7);
for (const [x, y] of STANDOFFS) {
  const post = cyl("standoff", x, y, 3.6, 0, STANDOFF_H, { tone: "mid" }, 6);
  put(R.nameFor("standoff"), [x, y, STANDOFF_H / 2], post.svg, [post.shape]);
}

// ---------------------------------------------------------------------------
// The board: FR-4 slab with the routed slot, copper, pads and vias.
// Copper nets carry classes the live script lights up (zi-field, zi-col, zi-gpio).
// ---------------------------------------------------------------------------
const pads = []; // [x, y, r]
const vias = []; // [x, y]
const copper = { plain: [], field: [], col: [], gpio: [] };
const trace = (net, pts) => copper[net].push(top(pts));
const pad = (x, y, r = 1.9) => pads.push([x, y, r]);
const via = (x, y) => vias.push([x, y]);

// Per-row footprints, shared by the copper here and the parts later.
const R6 = { x0: -91.25, len: 22.5, r: 4.4, padA: -96, padB: -64 }; // 1 k, 1 W axial (series)
const R1 = { x0: -40, len: 15.75, r: 3.1, padA: -44, padB: -20 }; // 10 k across the opto LED
const RPU = { x0: 20, len: 15.75, r: 3.1, padA: 16, padB: 40 }; // 10 k collector pull-up
const LED_X = -54;

for (const row of ROWS) {
  const y = row.y;
  const z1 = row.id === "Z1";
  const field = z1 ? "field" : "plain";
  // Field side. J pin 1 (signal) -> R6 -> LED -> PC817 pin 1 (anode); pin 2 (cathode) -> 0 V.
  pad(-110.5, y - PIN);
  pad(-110.5, y + PIN);
  pad(R6.padA, y - PIN);
  pad(R6.padB, y - PIN);
  pad(R1.padA, y + 7);
  pad(R1.padB, y + 7);
  pad(-9.5, y - PIN / 2);
  pad(-9.5, y + PIN / 2);
  trace(field, [[-110.5, y - PIN], [R6.padA, y - PIN]]);
  trace(field, [[R6.padB, y - PIN], [LED_X, y - PIN]]);
  trace(field, [[LED_X, y - PIN], [-13.3, y - PIN], [-9.5, y - PIN / 2]]);
  trace(field, [[R1.padA, y - PIN], [R1.padA, y + 7]]);
  trace(field, [[R1.padB, y + 7], [-13.3, y + 7], [-9.5, y + PIN / 2]]);
  trace(field, [[R1.padB, y + 7], [R1.padB, y + 11.5]]);
  via(R1.padB, y + 11.5); // field 0 V (24V- in 24 V mode)
  trace(field, [[-110.5, y + PIN], [-92, y + PIN]]);
  via(-92, y + PIN); // shared field supply + (24V+ in 24 V mode)

  // Logic side. Pin 4 collector -> pull-up and -> U8 input; pin 3 emitter -> GND.
  pad(9.5, y - PIN / 2);
  pad(9.5, y + PIN / 2);
  pad(RPU.padA, y - 9);
  pad(RPU.padB, y - 9);
  trace(z1 ? "col" : "plain", [[9.5, y - PIN / 2], [RPU.padA, y - 9]]);
  trace("plain", [[RPU.padB, y - 9], [RPU.padB, y - 14.5]]);
  via(RPU.padB, y - 14.5); // 3V3
  trace("plain", [[9.5, y + PIN / 2], [15, y + 8.5]]);
  via(15, y + 8.5); // logic GND
}

// Collector -> 74HC04 inputs (Z1-Z3 drawn on top; Z4 and MON drop to the bottom layer).
const colRoutes = {
  Z1: [[9.5, 48.825], [52, 48.825], [52, 22.25], [55.2, 19.05], [U8.rowL, 19.05]],
  Z2: [[9.5, 22.825], [48, 22.825], [48, 9.55], [51.2, 6.35], [U8.rowL, 6.35]],
  Z3: [[9.5, -3.175], [50, -3.175], [53.2, -6.35], [U8.rowL, -6.35]],
};
for (const row of ROWS) {
  const route = colRoutes[row.id];
  if (route) trace(row.id === "Z1" ? "col" : "plain", route);
  else {
    trace("plain", [[9.5, row.y - PIN / 2], [52, row.y - PIN / 2]]);
    via(52, row.y - PIN / 2);
  }
}
// 74HC04 outputs -> DevKitC header H1 (GPIO36, 39, 34); pins 8 and 10 drop to vias.
trace("gpio", [[U8.rowL, 12.7], [63.7, 9.525], [88, 9.525], [88, 44.45], [H1X, 44.45]]);
trace("plain", [[U8.rowL, 0], [63.7, 3.175], [94, 3.175], [94, 38.1], [H1X, 38.1]]);
trace("plain", [[U8.rowL, -12.7], [63.7, -9.525], [100, -9.525], [100, 31.75], [H1X, 31.75]]);
trace("plain", [[U8.rowR, -19.05], [86, -22]]);
via(86, -22);
trace("plain", [[U8.rowR, -6.35], [86, -3]]);
via(86, -3);
trace("plain", [[U8.rowR, 19.05], [86, 22]]); // VCC (pin 14) -> 3V3
via(86, 22);
trace("plain", [[U8.rowL, -19.05], [54, -22]]); // GND (pin 7)
via(54, -22);
for (let n = 1; n <= 14; n++) pad(...u8Pin(n), 1.6); // pin 13 (unused input) is left floating on v4
for (let n = 1; n <= 19; n++) {
  pad(...h1Pin(n), 1.6);
  pad(H2X, 57.15 - (n - 1) * PIN, 1.6);
}
// Test points: stubs onto the Z1 collector and GPIO36 nets; GND posts to their own vias.
trace("col", [[TP1[0], 48.825], TP1]);
trace("gpio", [[TP2[0], 44.45], TP2]);
for (const [x, y] of TP3) {
  trace("plain", [[x, y], [x, y - 6]]);
  via(x, y - 6);
}
// RGB LED: three resistors (R17-R19) to vias carrying GPIO23/19/18 from H2.
// U7 legs in a row along y: pin 1 blue, 2 red, 3 common cathode, 4 green.
const RGB_LEGS = [-1.9, -0.63, 0.63, 1.9].map((mm) => [RGB[0], RGB[1] + mm * 2.5]);
const RGB_RES = [-6, 0, 6].map((dx) => [RGB[0] + dx, RGB[1] - 10.5]);
RGB_LEGS.forEach(([x, y]) => pad(x, y, 1.2));
[[0, 0], [1, 1], [2, 3]].forEach(([r, leg]) => {
  const [x, y] = RGB_RES[r];
  const [lx, ly] = RGB_LEGS[leg];
  trace("plain", x === lx ? [[x, y + 2.5], [lx, ly]] : [[x, y + 2.5], [x, ly], [lx, ly]]);
  trace("plain", [[x, y - 2.5], [x, y - 4.5]]);
  via(x, y - 4.5);
});
trace("plain", [RGB_LEGS[2], [RGB[0] - 8, RGB_LEGS[2][1]]]);
via(RGB[0] - 8, RGB_LEGS[2][1]);

// Silkscreen outlines round each footprint (faint, closed).
const silk = [];
for (const row of ROWS) {
  silk.push(k.planOutline({ x: -122, y: row.y - 13.7, w: 23, d: 27.4, r: 0.5 }, T, P, 2));
  silk.push(k.planOutline({ x: -12, y: row.y - 7.5, w: 24, d: 15, r: 1 }, T, P, 2));
}
silk.push(k.planOutline({ x: 57, y: -26, w: 26, d: 52, r: 1 }, T, P, 2));

{
  const out = [];
  const board = k.slabOf(PCB, STANDOFF_H, PCB_H, P, 4, 0.6);
  // Slot: through the board. Walls first, then what you see through it (the bench below).
  const slotTop = k.planOutline(SLOT, T, P, 6);
  const slotBottom = k.planOutline(SLOT, STANDOFF_H, P, 6);
  const clipId = "zi-slot";
  out.push(S(board, { tone: "mid" }));
  out.push(`<clipPath id="${clipId}"><path d="${slotTop}"/></clipPath>`);
  out.push(`<path class="zi-wall" d="${slotTop}"/>`);
  out.push(`<g clip-path="url(#${clipId})"><path class="zi-void" d="${slotBottom}"/></g>`);
  out.push(Ln(slotTop, { tone: "mid" }));
  out.push(Ln(silk.join(""), { tone: "faint" }));
  // Silkscreen zone markings along the near edge, one each side of the slot.
  out.push(k.faceTextSvg(k.topMatrix([-96, 70.6], T, P, "x"), "FIELD 24V", { size: 4.2, tone: "hi", anchor: "start" }));
  out.push(k.faceTextSvg(k.topMatrix([8.5, 70.6], T, P, "x"), "LOGIC 3V3", { size: 4.2, tone: "hi", anchor: "start" }));
  // Isolation boundary printed edge to edge along both sides of the slot.
  out.push(Ln([-KEEPOUT, KEEPOUT].map((x) => top([[x, PCB.y], [x, PCB.y + PCB.d]])).join(""), { tone: "lo" }));
  out.push(Ln(copper.plain.join(""), { tone: "lo", className: "zi-cu" }));
  out.push(Ln(copper.field.join(""), { tone: "lo", className: "zi-cu zi-field" }));
  out.push(Ln(copper.col.join(""), { tone: "lo", className: "zi-cu zi-col" }));
  out.push(Ln(copper.gpio.join(""), { tone: "lo", className: "zi-cu zi-gpio" }));
  out.push(Ln(pads.map(([x, y, r]) => k.ring(x, y, r, T, P, 14)).join(""), { tone: "mid" }));
  out.push(Ln(vias.map(([x, y]) => k.ring(x, y, 1.3, T, P, 12)).join(""), { tone: "lo" }));
  out.push(Dots([...pads, ...vias].map(([x, y]) => at([x, y, T])), { size: 0.45, tone: "mid" }));
  // Mounting screws over the standoffs.
  out.push(Ln(STANDOFFS.map(([x, y]) => k.ring(x, y, 3, T, P, 16)).join(""), { tone: "lo" }));
  out.push(Dots(STANDOFFS.map(([x, y]) => at([x, y, T])), { size: 0.55 }));
  put("pcb", [PCB.x + PCB.w / 2, 0, STANDOFF_H], out.join(""), [A.slab(PCB, STANDOFF_H, PCB_H, { name: "pcb" }, 4)], { key: -1e5 });
}

// ---------------------------------------------------------------------------
// Parts on the board.
// ---------------------------------------------------------------------------

// 2-pin 5.08 mm screw terminal (Z1..Z4, MON). Wire entries on the -x face, screws on top.
function terminal(row) {
  const y = row.y;
  const plan = { x: -120, y: y - 12.7, w: 19, d: 25.4, r: 0.6 };
  const h = 25;
  const body = slab(`term.${row.id}`, plan, T, h, { tone: "mid" }, { bevel: 0.5 });
  const out = [body.svg];
  const shapes = [body.shape];
  for (const py of [y - PIN, y + PIN]) {
    // Wire entry: a closed square opening on the -x face.
    const hole = [[-120, py - 3.6, T + 4.4], [-120, py + 3.6, T + 4.4], [-120, py + 3.6, T + 11.6], [-120, py - 3.6, T + 11.6]];
    out.push(`<path class="zi-void" d="${path3(hole, true)}"/>`, Ln(path3(hole, true), { tone: "mid" }));
    // Screw well and slotted screw head.
    out.push(Ln(k.planOutline({ x: -116, y: py - 4.4, w: 8.8, d: 8.8, r: 0.6 }, T + h, P, 2), { tone: "lo" }));
    const screw = cyl("screw", -111.6, py, 3.2, T + h, 0.8, { tone: "hi", crease: "lo" }, 20);
    out.push(screw.svg, Ln(k.lineOnTop([-111.6 - 2.3, py - 2.3], [-111.6 + 2.3, py + 2.3], T + h + 0.8, P), { tone: "lo" }));
    shapes.push(screw.shape);
  }
  // Z1's terminal has its pin numbers printed on top, next to each screw.
  if (row.id === "Z1") for (const [n, py] of [["1", y - PIN], ["2", y + PIN]]) out.push(k.faceTextSvg(k.topMatrix([-117.6, py + 1.3], T + h, P, "x"), n, { size: 3.6, tone: "hi", anchor: "middle" }));
  // Interlock rib between the two positions, edge to edge on the near face.
  out.push(Ln(path3([[-120, y, T], [-120, y, T + h]]), { tone: "faint" }));
  put(`term.${row.id}`, [-110.5, y, T + h / 2], out.join(""), shapes);
}

// Axial resistor lying on the board along x, leads bent down into its pads.
function axial(name, spec, y, bands) {
  const { x0, len, r, padA, padB } = spec;
  const F = ALONG_X(x0, y, T + r);
  const profile = [[0, r * 0.72], [len * 0.07, r], [len * 0.3, r], [len * 0.34, r * 0.88], [len * 0.66, r * 0.88], [len * 0.7, r], [len * 0.93, r], [len, r * 0.72]];
  const leads = Ln(path3([[padA, y, T], [padA, y, T + r], [x0 + 1, y, T + r]]) + path3([[padB, y, T], [padB, y, T + r], [x0 + len - 1, y, T + r]]), { tone: "mid" });
  const inner = Ln(bands.map((s) => G.arcOf(F, s * len, s < 0.3 || s > 0.7 ? r : r * 0.88, P)).join(""), { tone: "mid" });
  const body = S(G.solidOf(profile, F, P, { steps: 24 }), { tone: "hi", crease: "lo", inner });
  put(name, [x0 + len / 2, y, T + r], leads + body, [A.solid(F, profile, { name })]);
}

// 5 mm LED on short legs: flange disc + body with a domed top.
function led5(name, cx, cy, { className = "", legs = 2 } = {}) {
  const z0 = T + 3;
  const F = UP(cx, cy, z0);
  const R0 = 6.25;
  const DOME = 9.3;
  const body = [[1.4, R0], [DOME, R0, 1]];
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    body.push([DOME + R0 * Math.sin(a), R0 * Math.cos(a), 1]);
  }
  body[body.length - 1][1] = 0;
  const flange = G.disc(0, 1.4, 7, F, P, { steps: 32 });
  const shell = G.lathe([[1.4, 0], ...body], F, P, { steps: 32 });
  const legX = legs === 4 ? [-1.9, -0.63, 0.63, 1.9] : [-1.27, 1.27];
  const legLines = Ln(legX.map((dx) => path3([[cx, cy + dx * 2.5, T], [cx, cy + dx * 2.5, z0]])).join(""), { tone: "mid" });
  const tint = className ? `<path class="${className}" d="${shell.fill}"/>` : "";
  const svg = legLines + S(flange, { tone: "mid" }) + S(shell, { tone: "hi", crease: "lo" }) + tint;
  const shapes = [A.disc(F, 0, 1.4, 7, { name: `${name}.flange` }), A.lathe(F, [[1.4, 0], ...body], { name })];
  for (const dx of legX) shapes.push(A.box([cx - 0.3, cy + dx * 2.5 - 0.3, T], [cx + 0.3, cy + dx * 2.5 + 0.3, z0], { name: `${name}.leg` }));
  return { svg, shapes, top: z0 + DOME + R0 };
}

// DIP package with gull legs on both long sides. axis "y": rows at x = cx +- rowHalf.
function dip(name, { cx, cy, pins, rowHalf, bodyW, bodyL, h, along }) {
  const z0 = T + 1.25;
  const plan = along === "y" ? { x: cx - bodyW / 2, y: cy - bodyL / 2, w: bodyW, d: bodyL, r: 0.6 } : null;
  const body = slab(name, plan, z0, h, { tone: "hi", crease: "lo" }, { bevel: 0.4 });
  const perSide = pins / 2;
  const span = (perSide - 1) * PIN;
  const far = [];
  const near = [];
  const shapes = [body.shape];
  for (const side of [-1, 1]) {
    for (let i = 0; i < perSide; i++) {
      const py = cy - span / 2 + i * PIN;
      const edge = cx + (side * bodyW) / 2;
      const legX = cx + side * rowHalf;
      const shoulder = { x: Math.min(edge, legX) - (side < 0 ? 0.4 : 0), y: py - 0.75, w: Math.abs(legX - edge) + 0.4, d: 1.5, r: 0.2 };
      const foot = { x: legX - 0.3, y: py - 0.4, w: 0.6, d: 0.8, r: 0.1 };
      const a = slab(`${name}.leg`, shoulder, z0 + 1.2, 0.6, { tone: "mid", crease: "none" }, { steps: 2 });
      const b = slab(`${name}.leg`, foot, T, z0 + 1.2 - T, { tone: "mid", crease: "none" }, { steps: 2 });
      (side < 0 ? near : far).push(b.svg + a.svg);
      shapes.push(a.shape, b.shape);
    }
  }
  return { body, far: far.join(""), near: near.join(""), shapes, top: z0 + h };
}

for (const row of ROWS) {
  const y = row.y;
  const z1 = row.id === "Z1";
  terminal(row);
  axial(`r6.${row.id}`, R6, y - PIN, [0.18, 0.26, 0.4, 0.82]); // brown black red . gold (1 k)
  axial(`r1.${row.id}`, R1, y + 7, [0.18, 0.26, 0.4, 0.82]);
  axial(`rpu.${row.id}`, RPU, y - 9, [0.18, 0.26, 0.4, 0.82]);
  const led = led5(`led.${row.id}`, LED_X, y - PIN, { className: z1 ? "zi-led-red" : "" });
  put(`led.${row.id}`, [LED_X, y - PIN, T + 8], led.svg, led.shapes);
  // PC817: DIP-4 straddling the slot. Pins 1-2 (LED) on the field side, 3-4 (transistor) on the logic side.
  const opto = dip(`pc817.${row.id}`, { cx: 0, cy: y, pins: 4, rowHalf: 9.5, bodyW: 16.2, bodyL: 11.5, h: 8.75, along: "y" });
  const optoTop = opto.top;
  const marks =
    Ln(k.ring(-5.2, y - 3.2, 1.1, optoTop, P, 12), { tone: "lo" }) +
    k.faceTextSvg(k.topMatrix([1.2, y + 1.4], optoTop, P, "x"), "PC817", { size: 2.3, tone: "lo", anchor: "middle" });
  put(`pc817.${row.id}`, [0, y, T + 5], opto.far + opto.body.svg + marks + opto.near, opto.shapes);
}

// 74HC04 (U8): DIP-14, notch toward +y.
{
  const u8 = dip("u8", { cx: 70, cy: 0, pins: 14, rowHalf: 9.5, bodyW: 16, bodyL: 48.25, h: 8.25, along: "y" });
  const z = u8.top;
  const notch = Array.from({ length: 13 }, (_, i) => {
    const a = Math.PI + (i / 12) * Math.PI;
    return [70 + 2.6 * Math.cos(a), 24.125 + 2.6 * Math.sin(a)];
  });
  const marks = Ln(top(notch, z), { tone: "lo" }) + Ln(k.ring(65, 19.5, 1.1, z, P, 12), { tone: "lo" });
  put("u8", [70, 0, T + 5], u8.far + u8.body.svg + marks + u8.near, u8.shapes);
}

// Female headers H1/H2 and the DevKitC module on top.
for (const [hx, name] of [[H1X, "h1"], [H2X, "h2"]]) {
  const plan = { x: hx - 3.175, y: -60.33, w: 6.35, d: 120.65, r: 0.4 };
  const lines = Array.from({ length: 18 }, (_, i) => path3([[hx - 3.175, -60.33 + (i + 1) * PIN, T], [hx - 3.175, -60.33 + (i + 1) * PIN, T + HEADER_H]]));
  const body = slab(name, plan, T, HEADER_H, { tone: "lo" }, { steps: 2, inner: Ln(lines.join(""), { tone: "faint" }) });
  put(name, [hx, 0, T + HEADER_H / 2], body.svg, [body.shape]);
}
{
  const out = [];
  const shapes = [];
  const board = slab("devkitc", DEV, DEV_Z, 4, { tone: "mid" }, { steps: 3, bevel: 0.5 });
  out.push(board.svg);
  shapes.push(board.shape);
  // Header solder joints along both edges.
  const joints = [];
  for (let n = 0; n < 19; n++) joints.push([H1X, 57.15 - n * PIN], [H2X, 57.15 - n * PIN]);
  out.push(Ln(joints.map(([x, y]) => k.ring(x, y, 1.6, DEV_TOP, P, 12)).join(""), { tone: "lo" }));
  out.push(Dots(joints.map(([x, y]) => at([x, y, DEV_TOP])), { size: 0.45, tone: "mid" }));
  // ESP32-WROOM module: carrier PCB, shield can, PCB antenna meander.
  const mod = { x: 121.25, y: 5, w: 45, d: 63.75, r: 0.6 };
  const can = { x: 123.75, y: 7.5, w: 40, d: 44, r: 0.8 };
  const modSlab = slab("wroom", mod, DEV_TOP, 2, { tone: "mid" }, { steps: 2 });
  const canSlab = slab("wroom.can", can, DEV_TOP + 2, 5.75, { tone: "hi", crease: "lo" }, { steps: 3, bevel: 0.6 });
  out.push(modSlab.svg);
  const castle = [];
  for (let i = 0; i < 14; i++) castle.push([mod.x + 1.5, mod.y + 3 + i * 3.18], [mod.x + mod.w - 1.5, mod.y + 3 + i * 3.18]);
  out.push(Dots(castle.map(([x, y]) => at([x, y, DEV_TOP + 2])), { size: 0.4, tone: "lo" }));
  const meander = [[can.x + 6, can.y + can.d + 1.2]];
  for (let i = 0; i < 7; i++) {
    const x = can.x + 6 + i * 4.4;
    meander.push([x, mod.y + mod.d - 2.5], [x + 2.2, mod.y + mod.d - 2.5], [x + 2.2, can.y + can.d + 3.5], [x + 4.4, can.y + can.d + 3.5]);
  }
  out.push(Ln(top(meander, DEV_TOP + 2), { tone: "lo" }), Dots([meander[0], meander[meander.length - 1]].map((p) => at([...p, DEV_TOP + 2])), { size: 0.5 }));
  out.push(canSlab.svg, Ln(k.planOutline(k.insetPlan(can, 3), DEV_TOP + 7.75, P, 3), { tone: "faint" }));
  shapes.push(modSlab.shape, canSlab.shape);
  // USB connector, CP2102 bridge, AMS1117 regulator, EN/BOOT buttons, power LED.
  const usb = slab("usb", { x: 134.4, y: -71, w: 18.75, d: 13, r: 0.8 }, DEV_TOP, 7, { tone: "hi", crease: "lo" }, { bevel: 0.4 });
  const cp = slab("cp2102", { x: 137.5, y: -42, w: 12.5, d: 12.5, r: 0.4 }, DEV_TOP, 2.25, { tone: "lo" });
  const reg = slab("ams1117", { x: 118, y: -26, w: 16, d: 9, r: 0.4 }, DEV_TOP, 4, { tone: "lo" });
  const tab = slab("ams1117.tab", { x: 121, y: -32, w: 10, d: 6, r: 0.3 }, DEV_TOP, 0.6, { tone: "mid", crease: "none" }, { steps: 2 });
  out.push(tab.svg, reg.svg, cp.svg);
  shapes.push(tab.shape, reg.shape, cp.shape);
  out.push(Dots([at([139.5, -40, DEV_TOP + 2.25])], { size: 0.45 }));
  for (const bx of [116, 162]) {
    const base = slab("button", { x: bx - 5, y: -62, w: 10, d: 8, r: 0.6 }, DEV_TOP, 3.5, { tone: "lo" });
    const cap = cyl("button.cap", bx, -58, 2.2, DEV_TOP + 3.5, 1.4, { tone: "hi", crease: "lo" }, 18);
    out.push(base.svg, cap.svg);
    shapes.push(base.shape, cap.shape);
  }
  const pled = slab("pled", { x: 158, y: -32, w: 3, d: 5, r: 0.3 }, DEV_TOP, 1.2, { tone: "hi", crease: "lo" }, { steps: 2 });
  out.push(pled.svg, usb.svg);
  shapes.push(pled.shape, usb.shape);
  put("devkitc", [143.75, 0, DEV_Z + 2], out.join(""), shapes);
}

// Test points: a pin with a ball top.
// Ball seated on the pin's rim; a lead ends where its rim (r 0.9) meets the ball surface.
const ballZ = TP_TOP + Math.sqrt(TP_BALL ** 2 - 0.9 ** 2) - 0.1;
for (const [x, y] of [TP1, TP2, ...TP3]) {
  const pin = cyl("tp.pin", x, y, 0.9, T, TP_TOP - T, { tone: "mid", crease: "none" }, 12);
  const ballAt = [x, y, ballZ];
  const ball = S(G.sphereOf(ballAt, TP_BALL, P), { tone: "hi" });
  put(R.nameFor("tp"), [x, y, TP_TOP], pin.svg + ball, [pin.shape, A.ball(ballAt, TP_BALL, { name: "tp.ball" })]);
}

// RGB status LED U7 with its three chip resistors.
{
  const led = led5("rgb", RGB[0], RGB[1], { className: "zi-rgb", legs: 4 });
  put("rgb", [RGB[0], RGB[1], T + 8], led.svg, led.shapes);
  for (const [x, y] of RGB_RES) {
    const body = slab("r.rgb", { x: x - 1.6, y: y - 2.5, w: 3.2, d: 5, r: 0.2 }, T, 1.2, { tone: "lo" }, { steps: 2 });
    const ends = Ln(k.planOutline({ x: x - 1.6, y: y - 2.5, w: 3.2, d: 1.1, r: 0.1 }, T + 1.2, P, 1) + k.planOutline({ x: x - 1.6, y: y + 1.4, w: 3.2, d: 1.1, r: 0.1 }, T + 1.2, P, 1), { tone: "mid" });
    put(R.nameFor("r.rgb"), [x, y, T], body.svg + ends, [body.shape]);
  }
}

// ---------------------------------------------------------------------------
// The zone relay on the bench (the panel's dry contact). Armature and moving contact
// blade are separate groups so the live script can move them.
// ---------------------------------------------------------------------------
const COIL = [-186, 52];
{
  const base = slab("relay.base", RELAY, 0, RELAY_BASE_H, { tone: "lo" }, { bevel: 0.6 });
  const seam = Ln(k.sideSeam(RELAY, 4, P, 3), { tone: "faint" });
  put("relay.base", [RELAY.x + RELAY.w / 2, RELAY.y + RELAY.d / 2, 4], base.svg + seam + Dots(k.corners(RELAY, 3).map(([x, y]) => at([x, y, RELAY_BASE_H])), { size: 0.5 }), [base.shape]);
  // Coil: bobbin flanges and winding.
  const [cx, cy] = COIL;
  const lower = cyl("relay.flange", cx, cy, 9.6, RELAY_BASE_H, 1.6, { tone: "mid" }, 32);
  const wind = cyl("relay.coil", cx, cy, 8.2, RELAY_BASE_H + 1.6, 20.8, { tone: "hi", crease: "lo" }, 32);
  const winding = Ln(Array.from({ length: 12 }, (_, i) => k.sideArc(cx, cy, 8.2, RELAY_BASE_H + 3.2 + i * 1.6, P, 24)).join(""), { tone: "faint" });
  const upper = cyl("relay.flange", cx, cy, 9.6, RELAY_BASE_H + 22.4, 1.6, { tone: "mid" }, 32);
  const pole = cyl("relay.pole", cx, cy, 3.4, RELAY_BASE_H + 24, 1.5, { tone: "mid" }, 20);
  put("relay.coil", [cx, cy, 20], lower.svg + wind.svg + winding + upper.svg + pole.svg, [lower.shape, wind.shape, upper.shape, pole.shape]);
  // Yoke: an L bracket on the far (-y) side, up to the armature hinge.
  const yoke = slab("relay.yoke", { x: cx - 8, y: 38, w: 16, d: 3, r: 0.4 }, RELAY_BASE_H, 26, { tone: "mid" }, { steps: 2, bevel: 0.4 });
  put("relay.yoke", [cx, 39.5, 20], yoke.svg + Dots([at([cx - 4, 41, 30]), at([cx + 4, 41, 30])], { size: 0.45 }), [yoke.shape]);
  // Terminal blocks facing the board: COM (to J pin 2) and NO (to J pin 1).
  for (const [ty, label] of [[PIN1_Y, "no"], [PIN2_Y, "com"]]) {
    const block = slab(`relay.term.${label}`, { x: RELAY_TERM_X, y: ty - 5, w: 10, d: 10, r: 0.6 }, RELAY_BASE_H, 8, { tone: "mid" }, { bevel: 0.4 });
    const screw = cyl("relay.screw", RELAY_TERM_X + 5, ty, 3, RELAY_BASE_H + 8, 0.8, { tone: "hi", crease: "lo" }, 18);
    const slot = Ln(k.lineOnTop([RELAY_TERM_X + 3, ty - 2], [RELAY_TERM_X + 7, ty + 2], RELAY_BASE_H + 8.8, P), { tone: "lo" });
    put(`relay.term.${label}`, [RELAY_TERM_X + 5, ty, 12], block.svg + screw.svg + slot, [block.shape, screw.shape]);
  }
}
// Contacts: the fixed NO blade (far) and the moving COM blade (near), each with a rivet.
const BLADE_X = -177;
const NO_BLADE = { x: BLADE_X, y: 60.6, w: 12, d: 0.8, r: 0.1 };
const COM_BLADE = { x: BLADE_X, y: 64.2, w: 12, d: 0.8, r: 0.1 };
{
  const blade = slab("relay.no", NO_BLADE, RELAY_BASE_H, 22, { tone: "mid", crease: "none" }, { steps: 1 });
  const rivet = slab("relay.no.rivet", { x: BLADE_X + 4, y: 61.4, w: 4, d: 1, r: 0.3 }, 26, 4, { tone: "hi", crease: "lo" }, { steps: 2 });
  put("relay.no", [BLADE_X + 6, 61, 18], blade.svg + rivet.svg, [blade.shape, rivet.shape]);
}
const COM_SVG = (() => {
  const blade = slab("relay.com", COM_BLADE, RELAY_BASE_H, 26, { tone: "hi", lit: true, crease: "none" }, { steps: 1 });
  const rivet = slab("relay.com.rivet", { x: BLADE_X + 4, y: 63.0, w: 4, d: 1.2, r: 0.3 }, 26, 4, { tone: "hi", lit: true }, { steps: 2 });
  return { svg: rivet.svg + blade.svg, shapes: [blade.shape, rivet.shape] };
})();
put("relay.com", [BLADE_X + 6, 64.6, 18], `<g data-part="blade">${COM_SVG.svg}</g>`, COM_SVG.shapes);
// Armature plate hinged on the yoke, reaching over the pole and onto the COM blade's tab.
{
  const plan = { x: COIL[0] - 8, y: 41, w: 16, d: 25, r: 0.6 };
  const arm = slab("relay.armature", plan, RELAY_BASE_H + 26, 1.5, { tone: "hi", lit: true }, { steps: 2, bevel: 0.4 });
  put("relay.armature", [COIL[0], 53, RELAY_BASE_H + 27], `<g data-part="armature">${arm.svg}</g>`, [arm.shape]);
}

// ---------------------------------------------------------------------------
// Bench voltmeters with binding posts. Needles are rebuilt by the live script.
// ---------------------------------------------------------------------------
const meterPivot = (m) => [m.x, m.y + 4];
const needleOf = (m, volts) => {
  const [px, py] = meterPivot(m);
  const angle = METER_FROM + (Math.max(0, Math.min(METER_FULL, volts)) / METER_FULL) * METER_SPAN;
  const sx = Math.sin(angle);
  const sy = -Math.cos(angle);
  return k.lineOnTop([px - sx * 3, py - sy * 3], [px + sx * (METER_R - 3.4), py + sy * (METER_R - 3.4)], 15.4, P);
};
// Each meter's + post sits on the side of its test point, so the two leads never cross.
// The needle at rest (0 V) as a thin bar lying on the face, for the audit.
const needleShape = (m) => {
  const [px, py] = meterPivot(m);
  const dir = [Math.sin(METER_FROM), -Math.cos(METER_FROM), 0];
  const len = METER_R - 3.4 + 3;
  const mid = [px + dir[0] * (len / 2 - 3), py + dir[1] * (len / 2 - 3), 15.4];
  return A.orientedBox(mid, [dir, [-dir[1], dir[0], 0], [0, 0, 1]], [len / 2, 0.3, 0.15], { name: `${m.name}.needle` });
};
const POSTS = METERS.map((m) => (m.tp[0] > m.gnd[0] ? { plus: [m.x + 13, m.y - 21], minus: [m.x - 13, m.y - 21] } : { plus: [m.x - 13, m.y - 21], minus: [m.x + 13, m.y - 21] }));
METERS.forEach((m, i) => {
  const housing = { x: m.x - 24, y: m.y - 28, w: 48, d: 50, r: 3 };
  const box = slab(`${m.name}.housing`, housing, 0, 11, { tone: "mid" }, { steps: 5, bevel: 0.8 });
  const [px, py] = meterPivot(m);
  const face = cyl(`${m.name}.face`, px, py, METER_R + 1.6, 11, 4.2, { tone: "hi", crease: "lo" }, 56);
  const bezel = Ln(k.ring(px, py, METER_R, 15.2, P, 56), { tone: "lo" });
  const ticks = k.radialTicks(px, py, METER_R - 1, 50, 10, 15.2, [1.2, 2.6], P, METER_FROM, METER_SPAN);
  const arc = Ln(top(Array.from({ length: 25 }, (_, j) => {
    const a = METER_FROM + (j / 24) * METER_SPAN;
    return [px + Math.sin(a) * (METER_R - 1), py - Math.cos(a) * (METER_R - 1)];
  }), 15.2), { tone: "mid" });
  const hub = cyl(`${m.name}.hub`, px, py, 1.4, 15.2, 0.8, { tone: "mid" }, 12);
  const out = [box.svg, face.svg, bezel, arc, Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" })];
  const shapes = [box.shape, face.shape];
  for (const [bx, by] of [POSTS[i].plus, POSTS[i].minus]) {
    const post = cyl(`${m.name}.post`, bx, by, 3.2, 11, 6, { tone: "mid" }, 20);
    const nut = cyl(`${m.name}.nut`, bx, by, 2, 17, 1.6, { tone: "hi", crease: "lo" }, 16);
    out.push(post.svg, Ln(k.knurl(bx, by, 3.2, 11, 17, 18, P), { tone: "lo" }), nut.svg);
    shapes.push(post.shape, nut.shape);
  }
  // Screws at the housing corners.
  out.push(Dots(k.corners(housing, 3.4).map(([x, y]) => at([x, y, 11])), { size: 0.45 }));
  put(m.name, [m.x, m.y, 6], out.join(""), shapes);
  put(`${m.name}.needle`, [px, py, 15.6], `<path data-part="needle-${i}" class="iso-line" data-tone="lit" data-free="start" d="${needleOf(m, 0)}" style="stroke-width:1.1"/>${hub.svg}`, [hub.shape, needleShape(m)]);
});

// ---------------------------------------------------------------------------
// Wires: two hook-up wires relay -> J1, four probe leads meters -> test points.
// ---------------------------------------------------------------------------
function cable(name, points, r, bend = Math.max(3, 2.6 * r)) {
  const route = G.fillet(points, bend, 7, { P, tube: r });
  R.route(name, route, r, { limp: true });
  // Chunks carry their own tube shape for depth sorting only (the route above is what the
  // clearance checks use), so they go straight to R.put rather than into R.solids.
  for (const piece of tubePieces(route, r, P, { maxLength: 14 })) {
    R.put({ name: R.nameFor(`${name}.chunk`), at: piece.mid, svg: tubeSvg(piece, { tone: "mid" }), shapes: [A.tube(piece.points, piece.radii, { name, limp: true })], route: name });
  }
}
cable("wire.com", [[RELAY_TERM_X + 10, PIN2_Y, 12], [-142, PIN2_Y, 12], [-132, PIN2_Y, T + 8], [-120, PIN2_Y, T + 8]], 1.4);
cable("wire.no", [[RELAY_TERM_X + 10, PIN1_Y, 12], [-142, PIN1_Y, 12], [-132, PIN1_Y, T + 8], [-120, PIN1_Y, T + 8]], 1.4);
METERS.forEach((m, i) => {
  for (const [from, to] of [[POSTS[i].plus, m.tp], [POSTS[i].minus, m.gnd]]) {
    // The lead arrives on a slant from the front and above, never straight down: a drop
    // straight after a leg running away from the viewer pinches to a V on screen.
    const C = [to[0], to[1], ballZ];
    const Q = [to[0] + 6, to[1] + 6, ballZ + 9];
    const end = G.add3(C, G.mul3(G.unit3(G.sub3(Q, C)), Math.sqrt(TP_BALL ** 2 - 0.9 ** 2)));
    cable(`lead.${m.name}.${from === POSTS[i].plus ? "plus" : "minus"}`, [[from[0], from[1], 18.6], [from[0], from[1], 30], Q, end], 0.9, 6);
  }
});

// ---------------------------------------------------------------------------
// Settle the painter's order from geometry and assemble the page.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Part labels. Each one is a tag in the margin with a leader to a dot on its part.
// [id, lines, world anchor, [screen x, screen y, side]]: side "end" puts the tag left of
// (x, y), "start" right of it; (x, y) is where the leader leaves the tag.
// The two meter tags carry a live reading (data-meter) that the page script updates.
// ---------------------------------------------------------------------------
const LABELS = [
  ["u8", ["U8 · 74HC04", "inverter"], [70, -8, T + 9.5], [300, 64, "end"]],
  ["rgb", ["U7 · RGB status LED"], [RGB[0], RGB[1], T + 3 + 15.55], [330, 28, "end"]],
  ["dev", ["ESP32 DevKitC"], [143.75, 29.5, DEV_TOP + 7.75], [560, 40, "start"]],
  ["gpio", ["GPIO36 (VP)", "H1 pin 3"], [H1X, 44.45, DEV_TOP], [585, 96, "start"]],
  ["relay", ["Zone relay", "panel's dry contact"], [-186, 53, RELAY_BASE_H + 27.5], [182, 352, "end"]],
  ["j1", ["J1 · Z1 terminal", "1 signal · 2 field +"], [-120, J1, T + 16], [292, 408, "start"]],
  ["r6", ["R6 · 1 k series"], [R6.x0 + R6.len / 2, J1 - PIN, T + 2 * R6.r], [336, 379, "start"]],
  ["led1", ["LED1 · red indicator"], [LED_X, J1 - PIN, T + 3 + 15.55], [380, 350, "start"]],
  ["slot", ["Isolation slot"], [0, 62, T], [424, 321, "start"]],
  ["u2", ["U2 · PC817", "optocoupler"], [0, J1, T + 10], [468, 292, "start"]],
  ["r11", ["R11 · 10 k pull-up"], [RPU.x0 + RPU.len / 2, J1 - 9, T + 2 * RPU.r], [512, 263, "start"]],
  ["mcol", ["Meter A: collector", "U8 pin 1 · 3.3 V"], [METERS[0].x, METERS[0].y + 22, 11], [556, 234, "start"]],
  ["mgpio", ["Meter B: GPIO36", "U8 pin 2 · 0.0 V"], [METERS[1].x, METERS[1].y + 22, 11], [600, 205, "start"]],
];
const TAG_FS = 8.2;
const TAG_LH = 10;
function labelSvg([id, lines, anchor, [tx, ty, side]]) {
  const charW = TAG_FS * 0.6;
  const w = Math.max(...lines.map((line) => line.length)) * charW + 8;
  const h = lines.length * TAG_LH + 4;
  const x0 = side === "end" ? tx - w : tx;
  const y0 = ty - h / 2;
  const [ax, ay] = at(anchor);
  const f = (v) => v.toFixed(1);
  const text = lines
    .map((line, i) => {
      const live = id === "mcol" || id === "mgpio" ? (i === 1 ? ` data-meter="${id === "mcol" ? 0 : 1}"` : "") : "";
      return `<tspan x="${f(x0 + 4)}" y="${f(y0 + 2 + TAG_FS + i * TAG_LH - 0.6)}"${live}>${line}</tspan>`;
    })
    .join("");
  return `<g class="zi-tag" data-label="${id}"><path class="zi-leader" d="M${f(tx)} ${f(ty)}L${f(ax)} ${f(ay)}"/><circle class="zi-pin" cx="${f(ax)}" cy="${f(ay)}" r="1.5"/><rect class="zi-tag-box" x="${f(x0)}" y="${f(y0)}" width="${f(w)}" height="${f(h)}" rx="2"/><text class="zi-tag-text">${text}</text></g>`;
}
const LABELS_SVG = `<g class="zi-labels">${LABELS.map(labelSvg).join("")}</g>`;

A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);

const LABEL =
  "A five-channel input board on standoffs over a bench plate. A routed slot splits the board into a field side and a logic side, and each PC817 optocoupler straddles the slot. An open-frame relay on the bench is wired into the Z1 terminal. Behind the optocouplers a 74HC04 inverter feeds an ESP32 DevKitC on header sockets, an RGB status LED sits beside it, and two bench voltmeters are clipped to test points on the Z1 collector and on GPIO36.";
const svg = k.figureSvg({
  width: W,
  height: H,
  label: LABEL,
  body: [...R.items.map((item) => `<g data-name="${item.name}">${item.svg}</g>`), LABELS_SVG],
});

const CSS = `
.zi-stage{cursor:pointer;outline:none}
.zi-stage:focus-visible{box-shadow:0 0 0 2px var(--anatomy-mid)}
.iso{--zi-void:#020202;--zi-wall:#0a0a0a;--zi-led:#ff4d4d;--zi-rgb-red:#ff4d4d;--zi-rgb-green:#3fdc8a;--zi-rgb-blue:#4d8dff}
.iso[data-theme="light"]{--zi-void:#d8d8d4;--zi-wall:#c4c4c0;--zi-led:#e5484d;--zi-rgb-red:#e5484d;--zi-rgb-green:#30a46c;--zi-rgb-blue:#3e63dd}
.zi-void{fill:var(--zi-void);stroke:none}
.zi-wall{fill:var(--zi-wall);stroke:none}
.zi-cu{transition:stroke 240ms var(--anatomy-ease)}
.zi-stage[data-contact="closed"] .zi-field{stroke:var(--anatomy-hi);stroke-dasharray:2 6;animation:iso-flow 1600ms linear infinite}
.zi-stage[data-collector="high"] .zi-col{stroke:var(--anatomy-hi)}
.zi-stage[data-gpio="high"] .zi-gpio{stroke:var(--anatomy-hi)}
.zi-led-red,.zi-rgb{fill:var(--zi-led);opacity:0;mix-blend-mode:var(--zi-blend,screen);transition:opacity 120ms linear}
.iso[data-theme="light"] .zi-led-red,.iso[data-theme="light"] .zi-rgb{--zi-blend:multiply}
.zi-stage[data-contact="closed"] .zi-led-red{opacity:.78}
.zi-stage[data-rgb="red"] .zi-rgb{fill:var(--zi-rgb-red)}
.zi-stage[data-rgb="green"] .zi-rgb{fill:var(--zi-rgb-green)}
.zi-stage[data-rgb="blue"] .zi-rgb{fill:var(--zi-rgb-blue)}
.zi-stage:not([data-rgb="off"]) .zi-rgb{opacity:.82}
.zi-leader{fill:none;stroke:var(--anatomy-hi);stroke-width:.6;vector-effect:non-scaling-stroke;opacity:.7}
.zi-pin{fill:var(--anatomy-card);stroke:var(--anatomy-hi);stroke-width:.8;vector-effect:non-scaling-stroke}
.zi-tag-box{fill:var(--anatomy-card);stroke:var(--anatomy-mid);stroke-width:.6;vector-effect:non-scaling-stroke}
.zi-tag-text{fill:var(--anatomy-strong);font-family:var(--anatomy-mono);font-size:${TAG_FS}px;letter-spacing:.01em}
.zi-labels{transition:opacity 200ms var(--anatomy-ease)}
.zi-stage[data-labels="off"] .zi-labels{opacity:0;pointer-events:none}
.zi-tools{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:10px}
.zi-tools button{font:inherit;font-family:var(--anatomy-mono);font-size:12px;letter-spacing:.04em;color:var(--anatomy-strong);background:var(--anatomy-card);border:1px solid var(--anatomy-mid);border-radius:6px;padding:6px 12px;cursor:pointer;min-height:32px}
.zi-tools button:hover{border-color:var(--anatomy-hi)}
.zi-tools button:focus-visible{outline:2px solid var(--anatomy-hi);outline-offset:2px}
.zi-tools button[aria-pressed="true"]{background:var(--anatomy-hi);color:var(--anatomy-card);border-color:var(--anatomy-hi)}
.zi-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (prefers-reduced-motion:reduce){.zi-stage[data-contact="closed"] .zi-field{animation:none;stroke-dasharray:none}}
`;

// Everything the live script needs, computed here so the page and the build agree.
const DATA = {
  P,
  meters: METERS.map((m) => ({ pivot: meterPivot(m), r: METER_R })),
  meterFrom: METER_FROM,
  meterSpan: METER_SPAN,
  meterFull: METER_FULL,
  armature: { drop: k.translateAlong(P, [0, 0, -ARMATURE_DROP]) },
  blade: { closed: k.translateAlong(P, [0, -BLADE_TRAVEL, 0]) },
};

const LIVE = `
const D = ${JSON.stringify(DATA)};
// --- Truth model (docs/pinmap.md, firmware/smart-input-module.yaml) -----------------
// Field loop in 24 V mode: (24 - 2.0 red LED - 1.2 opto LED) / 1 k.
const FIELD_MA = (24 - 2.0 - 1.2) / 1.0;
const VCE_SAT = 0.1;          // PC817 saturated (10 k pull-up asks only 0.33 mA)
const VCC = 3.3;              // 3V3 rail: pull-up and 74HC04 supply
const DELAYED_ON = 0.05;      // s, binary_sensor filter
const DELAYED_OFF = 1.0;      // s
const TICK = 0.5;             // s, the interval that sets the relays and RGB LED

const stage = document.querySelector(".zi-stage");
const svg = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const status = stage.querySelector("[data-status]");
const armature = svg.querySelector('[data-part="armature"]');
const blade = svg.querySelector('[data-part="blade"]');
const needles = [0, 1].map((i) => svg.querySelector('[data-part="needle-' + i + '"]'));
const meterTags = [0, 1].map((i) => svg.querySelector('[data-meter="' + i + '"]'));
const buttons = { relay: document.querySelector('[data-act="relay"]'), wifi: document.querySelector('[data-act="wifi"]'), labels: document.querySelector('[data-act="labels"]') };
const still = matchMedia("(prefers-reduced-motion: reduce)");

const state = { closed: false, wifi: true, sensor: false, changedAt: 0, blink: false, rgb: "green", lastTick: 0 };
const pos = { arm: 0, needle: [VCC, 0], rate: [0, 0] };
let clock = 0, last = 0, frame = 0, visible = false, touring = !still.matches, tourAt = 0, idleTimer = 0;

const collectorV = () => (state.closed ? VCE_SAT : VCC);
const gpioV = () => (state.closed ? VCC : 0);

function setContact(closed) {
  if (closed === state.closed) return;
  state.closed = closed;
  state.changedAt = clock;
}
function debounce() {
  // GPIO follows the contact within microseconds; the sensor waits out the filter.
  const raw = state.closed;
  if (raw !== state.sensor && clock - state.changedAt >= (raw ? DELAYED_ON : DELAYED_OFF)) state.sensor = raw;
}
function tick() {
  // Same priority as the firmware: any input active -> red, else Wi-Fi up -> green, else blink blue.
  state.blink = !state.blink;
  state.rgb = state.sensor ? "red" : state.wifi ? "green" : state.blink ? "blue" : "off";
}
function needle(i, volts) {
  const [px, py] = D.meters[i].pivot;
  const a = D.meterFrom + (Math.max(0, Math.min(D.meterFull, volts)) / D.meterFull) * D.meterSpan;
  const sx = Math.sin(a), sy = -Math.cos(a), r = D.meters[i].r - 3.4;
  return lineOnTop([px - sx * 3, py - sy * 3], [px + sx * r, py + sy * r], 15.4, D.P);
}
const TOUR = [[0, "close"], [3.6, "open"], [7.4, "wifi-off"], [11.4, "wifi-on"], [13.2, "loop"]];
function tour(dt) {
  const before = tourAt;
  tourAt += dt;
  for (const [t, what] of TOUR) {
    if (before <= t && tourAt > t) {
      if (what === "close") setContact(true);
      if (what === "open") setContact(false);
      if (what === "wifi-off") state.wifi = false;
      if (what === "wifi-on") state.wifi = true;
      if (what === "loop") tourAt = 0;
    }
  }
}
function draw() {
  stage.dataset.contact = state.closed ? "closed" : "open";
  stage.dataset.collector = collectorV() > 1.65 ? "high" : "low";
  stage.dataset.gpio = gpioV() > 1.65 ? "high" : "low";
  stage.dataset.rgb = still.matches && !state.sensor && !state.wifi ? "blue" : state.rgb;
  armature.setAttribute("transform", pos.arm > 0.001 ? scaled(D.armature.drop, pos.arm) : "");
  blade.setAttribute("transform", pos.arm > 0.001 ? scaled(D.blade.closed, pos.arm) : "");
  needles.forEach((el, i) => el.setAttribute("d", needle(i, pos.needle[i])));
  meterTags.forEach((el, i) => {
    const t = "U8 pin " + (i + 1) + " \u00b7 " + Math.max(0, pos.needle[i]).toFixed(1) + " V";
    if (el.textContent !== t) el.textContent = t;
  });
  buttons.relay.setAttribute("aria-pressed", String(state.closed));
  buttons.relay.textContent = state.closed ? "Open relay" : "Close relay";
  buttons.wifi.setAttribute("aria-pressed", String(!state.wifi));
  buttons.wifi.textContent = state.wifi ? "Drop Wi-Fi" : "Restore Wi-Fi";
  const led = state.rgb === "off" || state.rgb === "blue" ? (state.wifi ? "green" : "blinking blue") : state.rgb;
  const text = (state.closed ? "closed" : "open") + " \\u00b7 " + (state.closed ? (state.closed ? FIELD_MA.toFixed(1) : "0") + " mA \\u00b7 " : "") + "GPIO36 " + gpioV().toFixed(1) + " V \\u00b7 " + (state.sensor ? "ON" : "OFF") + " \\u00b7 " + led;
  if (readout.textContent !== text) readout.textContent = text;
  const said = "Zone 1 contact " + (state.closed ? "closed" : "open") + ", sensor " + (state.sensor ? "on" : "off") + ", status LED " + led + (state.wifi ? "" : ", Wi-Fi down");
  if (status.textContent !== said) status.textContent = said;
}
function scaled(translate, share) {
  const m = /translate\\(([-\\d.e]+)[ ,]+([-\\d.e]+)\\)/.exec(translate);
  return m ? "translate(" + (+m[1] * share).toFixed(2) + " " + (+m[2] * share).toFixed(2) + ")" : "";
}
function step(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
  last = now;
  clock += dt;
  if (touring) tour(dt);
  debounce();
  if (clock - state.lastTick >= TICK) { state.lastTick += TICK * Math.floor((clock - state.lastTick) / TICK); tick(); }
  const calm = still.matches;
  // Relay armature: pulls in within ~10 ms; ease it just enough to be seen.
  const want = state.closed ? 1 : 0;
  pos.arm = calm ? want : pos.arm + (want - pos.arm) * (1 - Math.exp(-dt / 0.035));
  // Meter movements: critically damped, about 0.3 s to settle, like a real moving-coil meter.
  const targets = [collectorV(), gpioV()];
  for (let i = 0; i < 2; i++) {
    if (calm) { pos.needle[i] = targets[i]; pos.rate[i] = 0; continue; }
    const w = 14;
    pos.rate[i] += (w * w * (targets[i] - pos.needle[i]) - 2 * w * pos.rate[i]) * dt;
    pos.needle[i] += pos.rate[i] * dt;
  }
  draw();
  frame = visible ? requestAnimationFrame(step) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(step); } };
function poke() {
  touring = false;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!still.matches) { touring = true; tourAt = state.closed ? 0.01 : 3.61; } }, 8000);
  run();
}
const toggleLabels = () => {
  const on = stage.dataset.labels !== "off";
  stage.dataset.labels = on ? "off" : "on";
  buttons.labels.setAttribute("aria-pressed", String(!on));
  buttons.labels.textContent = on ? "Show labels" : "Hide labels";
};
svg.addEventListener("click", () => { setContact(!state.closed); poke(); });
buttons.relay.addEventListener("click", () => { setContact(!state.closed); poke(); });
buttons.wifi.addEventListener("click", () => { state.wifi = !state.wifi; poke(); });
buttons.labels.addEventListener("click", toggleLabels);
stage.addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "Enter") { event.preventDefault(); setContact(!state.closed); poke(); }
  if (event.key === "w" || event.key === "W") { state.wifi = !state.wifi; poke(); }
  if (event.key === "l" || event.key === "L") toggleLabels();
});
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
still.addEventListener("change", () => { touring = !still.matches; run(); });
window.__zone = { state, set: (closed) => { setContact(closed); poke(); }, wifi: (on) => { state.wifi = on; poke(); } };
draw();
`;

// Notes pane beside the figure: the walkthrough as numbered steps, then the key.
const STEPS = [
  ["Dry contact", "The panel's zone relay closes a plain switch across J1 pin 1 (signal) and pin 2 (field supply +). The panel supplies no voltage, only the contact."],
  ["Field loop", "About 21 mA flows from the 24 V field supply through R6 (1 k), the red LED1 and the PC817's internal LED, then back to the field 0 V."],
  ["Isolation", "Light crosses the gap inside the PC817. No copper crosses the routed slot between the field side and the logic side."],
  ["Collector goes low", "The PC817's transistor saturates and pulls its collector from 3.3 V down to about 0.1 V against R11, the 10 k pull-up. Meter A shows it."],
  ["Inverted to HIGH", "The 74HC04 flips that, so input-only GPIO36 is driven to 3.3 V (Meter B). Energized means HIGH, and the pin never floats."],
  ["Firmware", "It polls the pin instead of using interrupts, because GPIO36 and 39 can glitch while Wi-Fi is on. Zone ON after 50 ms; OFF only after 1 s open."],
  ["Status LED", "Every 500 ms: red while any input is active, otherwise green on Wi-Fi, or blinking blue (1 Hz) without it."],
];
const KEYS = [
  ["lit", "Relay armature and contact, meter needles: what moves when the zone changes"],
  ["edge", "Copper: a net drawn bright is at 3.3 V; the dashed field loop means current flows"],
  ["dim", "Routed slot: field side and logic side share no copper"],
  ["red", "RGB LED red: an input is active"],
  ["green", "Green: idle, Wi-Fi up"],
  ["blue", "Blinking blue: Wi-Fi down"],
];
const NOTES = `<aside class="zi-notes" aria-label="How it works">
<h2>How one zone input works</h2>
<ol class="zi-steps">${STEPS.map(([head, text]) => `<li><strong>${head}.</strong> ${text}</li>`).join("")}</ol>
<p class="zi-caveat"><strong>Caveat:</strong> the slot only isolates in 24 V mode with a separately powered board. In 5 V mode, or when the board is fed by a non-isolated buck from the panel's own 24 V, both sides share a ground.</p>
<h3>Key</h3>
<ul class="zi-keys">${KEYS.map(([mark, text]) => `<li><span class="zi-swatch" data-mark="${mark}"></span>${text}</li>`).join("")}</ul>
</aside>`;

const LAYOUT_CSS = `
.iso-page{margin:24px auto 48px}
.zi-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,400px);gap:28px;align-items:start}
.zi-layout .iso-figure{margin:0}
.zi-notes{position:sticky;top:24px;font-size:13px;line-height:1.45;color:var(--anatomy-text)}
.zi-notes h2{margin:0 0 10px;font-size:15px;line-height:1.3;color:var(--anatomy-strong);font-weight:600}
.zi-notes h3{margin:12px 0 6px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--anatomy-muted);font-weight:600}
.zi-notes strong{color:var(--anatomy-strong);font-weight:600}
.zi-steps{margin:0;padding-left:20px;display:grid;gap:5px}
.zi-steps li::marker{color:var(--anatomy-muted);font-family:var(--anatomy-mono);font-size:12px}
.zi-caveat{margin:10px 0 0;padding:6px 10px;border-left:2px solid var(--anatomy-mid);background:var(--anatomy-card)}
.zi-keys{list-style:none;margin:0;padding:0;display:grid;gap:3px;font-size:12px;line-height:1.35;color:var(--anatomy-muted)}
.zi-keys li{display:flex;gap:8px;align-items:baseline}
.zi-swatch{flex:none;width:16px;height:0;border-top:1.5px solid var(--anatomy-hi);transform:translateY(-3px)}
.zi-swatch[data-mark="lit"]{border-top-color:var(--anatomy-lit)}
.zi-swatch[data-mark="dim"]{border-top-color:var(--anatomy-lo)}
.zi-swatch[data-mark="red"]{border-top-color:var(--zi-rgb-red)}
.zi-swatch[data-mark="green"]{border-top-color:var(--zi-rgb-green)}
.zi-swatch[data-mark="blue"]{border-top-color:var(--zi-rgb-blue)}
@media (max-width:960px){.zi-layout{grid-template-columns:minmax(0,1fr)}.zi-notes{position:static}}
`;

const body =
  `<style>${CSS}${LAYOUT_CSS}</style><div class="zi-layout">` +
  k.plateHtml({
    fig: "Fig 1",
    title: "Zone input, Z1",
    hint: "Click the board: relay · W: Wi-Fi · L: labels",
    readout: "open · GPIO36 0.0 V · OFF · green",
    body: `<div class="iso-stage zi-stage" tabindex="0" role="button" aria-pressed="false" aria-label="Zone 1 input. Press space or click to close or open the zone relay contact; press W to drop or restore Wi-Fi; press L to show or hide labels." data-contact="open" data-collector="high" data-gpio="low" data-rgb="green" data-labels="on">${svg}<span class="zi-sr" role="status" aria-live="polite" data-status></span></div><div class="zi-tools"><button type="button" data-act="relay" aria-pressed="false">Close relay</button><button type="button" data-act="wifi" aria-pressed="false">Drop Wi-Fi</button><button type="button" data-act="labels" aria-pressed="true">Hide labels</button></div>`,
  }) +
  NOTES +
  `</div>`;

const page = k.pageHtml({ title: "Zone input", theme: THEME, body, script: kitScript() + LIVE, width: 1200 });
const name = THEME === "light" ? "zone-input.html" : "zone-input-dark.html";
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `${R.solids.length} solids`, `scale ${KS.toFixed(3)}`);

A.auditOrExit(R, P, {});
