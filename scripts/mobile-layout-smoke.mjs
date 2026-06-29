import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const [html, css] = await Promise.all([
  readFile(path.join(root, "app", "index.html"), "utf8"),
  readFile(path.join(root, "app", "styles.css"), "utf8")
]);

assert(html.includes('name="viewport" content="width=device-width, initial-scale=1.0"'), "viewport meta missing");
assert(css.includes("@media (max-width: 900px)"), "900px mobile breakpoint missing");
assert(css.includes("@media (max-width: 560px)"), "small-phone breakpoint missing");

const mobileBlock = css.slice(css.indexOf("@media (max-width: 900px)"), css.indexOf("@media (max-width: 560px)"));
const smallPhoneBlock = css.slice(css.indexOf("@media (max-width: 560px)"));

for (const needle of [
  "min-width: 0",
  ".topbar",
  "height: auto",
  ".workspace",
  "grid-template-columns: 1fr",
  ".hero-panel",
  ".lab-panel",
  ".side-rail",
  "grid-column: 1",
  "grid-row: auto",
  ".evidence-panel",
  ".lab-grid",
  ".video-stage",
  "aspect-ratio: 16 / 9",
  ".feedback-grid",
  ".multi-angle-row",
  "white-space: normal"
]) {
  assert(mobileBlock.includes(needle), `mobile CSS missing: ${needle}`);
}

for (const needle of [
  ".keyframes",
  "grid-template-columns: 1fr",
  "min-height: 190px"
]) {
  assert(smallPhoneBlock.includes(needle), `small-phone CSS missing: ${needle}`);
}

assert(!mobileBlock.includes("grid-column: 2"), "mobile CSS must not keep side rail in implicit second column");

console.log(JSON.stringify({
  ok: true,
  schema_version: "mobile_layout_smoke.v1",
  source_contract: "mobile_first_local_web_prototype",
  breakpoints: ["max-width: 900px", "max-width: 560px"],
  checks: {
    viewport_meta: true,
    body_min_width_reset: true,
    single_column_workspace: true,
    side_rail_single_column: true,
    evidence_single_column: true,
    video_aspect_ratio: true,
    multi_angle_rows_wrap: true,
    small_phone_keyframes_single_column: true
  }
}, null, 2));

function assert(condition, message) {
  if (!condition) throw new Error(`mobile layout smoke failed: ${message}`);
}
