const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ACCENT = "#9a4dff";
const WHITE = "#ffffff";

function compassSvg({ size, fg = WHITE, bg = "transparent", padding = 0.18 }) {
  const inset = size * padding;
  const r = (size - inset * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const stroke = size * 0.035;
  const needleOuter = r * 0.72;
  const needleInner = r * 0.18;
  const backgroundRect =
    bg === "transparent"
      ? ""
      : `<rect width="${size}" height="${size}" fill="${bg}"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${backgroundRect}
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${fg}" stroke-width="${stroke}"/>
  <polygon points="
    ${cx},${cy - needleOuter}
    ${cx + needleInner},${cy}
    ${cx},${cy + needleOuter}
    ${cx - needleInner},${cy}
  " fill="${fg}"/>
  <circle cx="${cx}" cy="${cy}" r="${stroke * 1.2}" fill="${fg}"/>
</svg>`;
}

function adaptiveSvg({ size }) {
  return compassSvg({ size, fg: WHITE, bg: "transparent", padding: 0.28 });
}

async function write(svg, outPath, size) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
  console.log("wrote", outPath);
}

async function main() {
  const assetsDir = path.join(__dirname, "..", "assets", "images");
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  const splashSvg = compassSvg({ size: 1024, fg: WHITE });
  await write(splashSvg, path.join(assetsDir, "splash-icon.png"), 1024);

  const iconSvg = compassSvg({ size: 1024, fg: WHITE, bg: ACCENT, padding: 0.22 });
  await write(iconSvg, path.join(assetsDir, "icon.png"), 1024);

  const adaptive = adaptiveSvg({ size: 1024 });
  await write(adaptive, path.join(assetsDir, "adaptive-icon.png"), 1024);

  const favSvg = compassSvg({ size: 128, fg: ACCENT });
  await write(favSvg, path.join(assetsDir, "favicon.png"), 48);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
