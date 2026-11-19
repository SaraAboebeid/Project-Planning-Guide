/* Original 16x16 pixel icons, drawn as character maps so they stay crisp at
   any integer scale and can be edited in place. One character = one pixel;
   "." is transparent. */
import { useState, type ReactElement } from "react";

const PALETTE: Record<string, string> = {
  k: "#000000", w: "#ffffff", g: "#c0c0c0", L: "#dfdfdf", d: "#808080",
  y: "#ffff00", o: "#808000", Y: "#d4a017", b: "#0000ff", n: "#000080",
  c: "#00ffff", t: "#008080", r: "#ff0000", m: "#800000", G: "#008000", l: "#00ff00",
};

export const ICONS = {
  trident: [
    ".Y.....Y.....Y..",
    "YYY...YYY...YYY.",
    ".Y.....Y.....Y..",
    ".Y.....Y.....Y..",
    ".Y.....Y.....Y..",
    ".YY....Y....YY..",
    "..YY...Y...YY...",
    "...YYYYYYYYY....",
    ".......Y........",
    ".......o........",
    ".......o........",
    ".......o........",
    ".......o........",
    ".......o........",
    ".......o........",
    ".......o........",
  ],
  building: [
    "................",
    "..kkkkkkkkkkkk..",
    "..kggggggggggkd.",
    "..kgbbgbbgbbgkd.",
    "..kgnngnngnngkd.",
    "..kggggggggggkd.",
    "..kgbbgbbgbbgkd.",
    "..kgnngnngnngkd.",
    "..kggggggggggkd.",
    "..kgbbgbbgbbgkd.",
    "..kgnngnngnngkd.",
    "..kggggggggggkd.",
    "..kgbbgmmgbbgkd.",
    "..kggggmmggggkd.",
    "..kkkkkkkkkkkkd.",
    "...dddddddddddd.",
  ],
  folder: [
    "................",
    "................",
    ".kkkkk..........",
    "kyyyyyk.........",
    "kyyyyyykkkkkkkk.",
    "kywwwwwwwwwwwwko",
    "kyyyyyyyyyyyyyko",
    "kyyyyyyyyyyyyyko",
    "kyyyyyyyyyyyyyko",
    "kyyyyyyyyyyyyyko",
    "kyyyyyyyyyyyyyko",
    "kyyyyyyyyyyyyyko",
    "kyyyyyyyyyyyyyko",
    "kkkkkkkkkkkkkkko",
    ".ooooooooooooooo",
    "................",
  ],
  notepad: [
    "..kkkkkkkkkkk...",
    "..knnnnnnnnnkd..",
    "..kwwwwwwwwwkd..",
    "..kwddddddwwkd..",
    "..kwwwwwwwwwkd..",
    "..kwdddddddwkd..",
    "..kwwwwwwwwwkd..",
    "..kwddddwwwwkd..",
    "..kwwwwwwwwwkd..",
    "..kwdddddddwkd..",
    "..kwwwwwwwwwkd..",
    "..kwdddddwwwkd..",
    "..kwwwwwwwwwkd..",
    "..kwwwwwwwwwkd..",
    "..kkkkkkkkkkkd..",
    "...ddddddddddd..",
  ],
  globe: [
    ".....kkkkkk.....",
    "...kkbbbbbbkk...",
    "..kbbGGbbbbbbk..",
    ".kbbGGGGbbbGGbk.",
    ".kbGGGGGbbGGGbk.",
    "kbbGGGGbbbbGGbbk",
    "kbbbGGGbbbbbGbbk",
    "kbbbbGGbbbbbbbbk",
    "kbbbbbGbbbGGGbbk",
    "kbbbbbbbbGGGGGbk",
    "kbbbbbbbbbGGGbbk",
    ".kbbbbbbbbGGbbk.",
    ".kbbbbbbbbbbbbk.",
    "..kbbbbbbbbbbk..",
    "...kkbbbbbbkk...",
    ".....kkkkkk.....",
  ],
  sheet: [
    "................",
    ".kkkkkkkkkkkkkk.",
    ".kGGGGGGGGGGGGk.",
    ".kwwwdwwwdwwwwk.",
    ".kddddddddddddk.",
    ".kwwwdwwwdwwwwk.",
    ".kddddddddddddk.",
    ".kwwwdwwwdwwwwk.",
    ".kddddddddddddk.",
    ".kwwwdwwwdwwwwk.",
    ".kddddddddddddk.",
    ".kwwwdwwwdwwwwk.",
    ".kddddddddddddk.",
    ".kwwwdwwwdwwwwk.",
    ".kkkkkkkkkkkkkk.",
    "................",
  ],
  map: [
    "................",
    ".kkkkkkkkkkkkkk.",
    ".kllllllccllllk.",
    ".kllllccllrrllk.",
    ".klllccllrrrrlk.",
    ".kllccllllrrllk.",
    ".klccllllllrllk.",
    ".kccllllllllllk.",
    ".kcllllyyyyyllk.",
    ".klllllyllllllk.",
    ".kllllyylllGGlk.",
    ".kllllyllllGGGk.",
    ".klllyylllllGGk.",
    ".kllyyllllllllk.",
    ".kkkkkkkkkkkkkk.",
    "................",
  ],
  wizard: [
    ".......kk....y..",
    "......kmmk..yyy.",
    ".....kmmmmk..y..",
    "....kmmmmmmk....",
    "...kmmmmmmmmk...",
    "..kmmmmmmmmmmk..",
    ".kkkkkkkkkkkkkk.",
    "..kyyyyyyyyyyk..",
    "..kybbyyyybbyk..",
    "..kybcyyyybcyk..",
    "..kyyyyyyyyyyk..",
    "..kybbyttybbyk..",
    "..kybcyttybcyk..",
    "..kyyyyttyyyyk..",
    "..kkkkkkkkkkkk..",
    "................",
  ],
  warning: [
    ".......kk.......",
    "......kyyk......",
    "......kyyk......",
    ".....kyyyyk.....",
    ".....kykkyk.....",
    "....kyykkyyk....",
    "....kyykkyyk....",
    "...kyyykkyyyk...",
    "...kyyykkyyyk...",
    "..kyyyykkyyyyk..",
    "..kyyyyyyyyyyk..",
    ".kyyyyykkyyyyyk.",
    ".kyyyyykkyyyyyk.",
    "kyyyyyyyyyyyyyyk",
    "kkkkkkkkkkkkkkkk",
    "................",
  ],
  error: [
    ".....kkkkkk.....",
    "...kkrrrrrrkk...",
    "..krrrrrrrrrrk..",
    ".krrwwrrrrwwrrk.",
    ".krrwwwrrwwwrrk.",
    "krrrrwwwwwwrrrrk",
    "krrrrrwwwwrrrrrk",
    "krrrrrrwwrrrrrrk",
    "krrrrrwwwwrrrrrk",
    "krrrrwwwwwwrrrrk",
    ".krrwwwrrwwwrrk.",
    ".krrwwrrrrwwrrk.",
    ".krrrrrrrrrrrrk.",
    "..krrrrrrrrrrk..",
    "...kkrrrrrrkk...",
    ".....kkkkkk.....",
  ],
  info: [
    ".....kkkkkk.....",
    "...kkbbbbbbkk...",
    "..kbbbbwwbbbbk..",
    ".kbbbbbwwbbbbbk.",
    ".kbbbbbbbbbbbbk.",
    "kbbbbbwwwbbbbbbk",
    "kbbbbbbwwbbbbbbk",
    "kbbbbbbwwbbbbbbk",
    "kbbbbbbwwbbbbbbk",
    "kbbbbbbwwbbbbbbk",
    "kbbbbbbwwbbbbbbk",
    ".kbbbbwwwwbbbbk.",
    ".kbbbbbbbbbbbbk.",
    "..kbbbbbbbbbbk..",
    "...kkbbbbbbkk...",
    ".....kkkkkk.....",
  ],
  report: [
    "..kkkkkkkkk.....",
    "..kwwwwwwwkk....",
    "..kwwwwwwwkwk...",
    "..kwwwwwwwkkkk..",
    "..kwwwwwwwwwwkd.",
    "..kwwwwwwwwrwkd.",
    "..kwwwwwwwwrwkd.",
    "..kwwwwbwwwrwkd.",
    "..kwwwwbwwwrwkd.",
    "..kwGwwbwwwrwkd.",
    "..kwGwwbwwwrwkd.",
    "..kwGwwbwwwrwkd.",
    "..kwkkkkkkkkwkd.",
    "..kwwwwwwwwwwkd.",
    "..kkkkkkkkkkkkd.",
    "...dddddddddddd.",
  ],
} satisfies Record<string, string[]>;

export type IconName = keyof typeof ICONS;

export function PixelIcon({ name, size = 32, title }: { name: IconName; size?: number; title?: string }) {
  const rows = ICONS[name];
  const rects: ReactElement[] = [];
  rows.forEach((row, y) => {
    // Merge horizontal runs of one colour into a single rect.
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run++;
      if (ch !== "." && PALETTE[ch]) {
        rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={run} height={1} fill={PALETTE[ch]} />);
      }
      x += run;
    }
  });
  return (
    <svg className="px" width={size} height={size} viewBox="0 0 16 16" role={title ? "img" : undefined}
      aria-label={title} aria-hidden={title ? undefined : true}>
      {rects}
    </svg>
  );
}

/** Poseidon's figure mark (public/logo.png, or logo-white.png for dark
    backgrounds); falls back to the pixel trident if the file is missing. */
export function BrandMark({ size = 18, white = false }: { size?: number; white?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <PixelIcon name="trident" size={size} />;
  return <img src={white ? "/logo-white.png" : "/logo.png"} width={size} height={size} alt=""
    style={{ objectFit: "contain" }} onError={() => setFailed(true)} />;
}
