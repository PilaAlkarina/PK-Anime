/**
 * PostCSS fallbacks for the older Chromium inside Smart TV browsers (Samsung Tizen 4–5 runs
 * Chromium 56–63; Tizen 6.x still predates 87):
 * - `rgb(74 222 128 / var(--tw-bg-opacity))`, the syntax Tailwind 3 emits for every color, is
 *   unknown before Chromium 65 and the declaration is dropped (white backgrounds). It becomes
 *   `rgba(74, 222, 128, var(--tw-bg-opacity))`.
 * - `inset` (Chromium 87) gets top/right/bottom/left in front of it.
 */
const { list } = require("postcss");

const SPACE_ALPHA = /rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\/\s*([^)]+?)\s*\)/g;
const SPACE_PLAIN = /rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g;

function expandBox(value) {
  const parts = list.space(value);
  const [top, right = top, bottom = top, left = right] = parts;
  return { top, right, bottom, left };
}

module.exports = () => ({
  postcssPlugin: "pk-legacy",
  Declaration(decl) {
    if (decl.value.includes("rgb")) {
      const value = decl.value.replace(SPACE_ALPHA, "rgba($1, $2, $3, $4)").replace(SPACE_PLAIN, "rgb($1, $2, $3)");
      if (value !== decl.value) decl.value = value;
    }
    if (decl.prop === "inset" && !decl.parent.some((d) => d.type === "decl" && d.prop === "top")) {
      const box = expandBox(decl.value);
      for (const side of ["top", "right", "bottom", "left"]) {
        decl.cloneBefore({ prop: side, value: box[side] });
      }
    }
  },
});
module.exports.postcss = true;
