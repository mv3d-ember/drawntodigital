// Paper Palette -> Procreate Swatches
// Client-side port of the original Streamlit app. Everything runs in-browser;
// no server is involved, so this can be hosted as a static site (e.g. GitHub Pages).

const fileInput = document.getElementById("file-input");
const previewSection = document.getElementById("preview-section");
const originalPreview = document.getElementById("original-preview");

const rowsInput = document.getElementById("rows-input");
const colsInput = document.getElementById("cols-input");

const useReferenceCheckbox = document.getElementById("use-reference");
const referenceFields = document.getElementById("reference-fields");
const refRowInput = document.getElementById("ref-row-input");
const refColInput = document.getElementById("ref-col-input");

const extractBtn = document.getElementById("extract-btn");
const correctedSection = document.getElementById("corrected-section");
const correctedCanvas = document.getElementById("corrected-canvas");

const paletteSection = document.getElementById("palette-section");
const swatchGrid = document.getElementById("swatch-grid");
const paletteNameInput = document.getElementById("palette-name");
const exportBtn = document.getElementById("export-btn");
const formatButtons = document.querySelectorAll(".format-btn");

const workCanvas = document.getElementById("work-canvas");
const workCtx = workCanvas.getContext("2d", { willReadFrequently: true });

let currentImage = null; // HTMLImageElement of the uploaded photo
let currentPalette = null; // array of [r, g, b]
let currentFormat = "rgb";

// --- Core functions (mirrors the Python implementation) ---

function extractGridColors(imageData, width, height, rows, cols) {
  const cellH = Math.floor(height / rows);
  const cellW = Math.floor(width / cols);
  const colors = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      const y0 = r * cellH, y1 = (r + 1) * cellH;
      const x0 = c * cellW, x1 = (c + 1) * cellW;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          sumR += imageData.data[i];
          sumG += imageData.data[i + 1];
          sumB += imageData.data[i + 2];
          count++;
        }
      }

      colors.push([
        Math.floor(sumR / count),
        Math.floor(sumG / count),
        Math.floor(sumB / count),
      ]);
    }
  }

  return colors;
}

function getCellBounds(width, height, rows, cols, rowIndex, colIndex) {
  const cellH = Math.floor(height / rows);
  const cellW = Math.floor(width / cols);
  return {
    x0: colIndex * cellW,
    x1: (colIndex + 1) * cellW,
    y0: rowIndex * cellH,
    y1: (rowIndex + 1) * cellH,
  };
}

function referencePatchAverage(imageData, width, bounds) {
  let sumR = 0, sumG = 0, sumB = 0, count = 0;
  for (let y = bounds.y0; y < bounds.y1; y++) {
    for (let x = bounds.x0; x < bounds.x1; x++) {
      const i = (y * width + x) * 4;
      sumR += imageData.data[i];
      sumG += imageData.data[i + 1];
      sumB += imageData.data[i + 2];
      count++;
    }
  }
  return [sumR / count, sumG / count, sumB / count];
}

function whiteBalanceCorrect(imageData, width, height, refAvg) {
  const avg = refAvg.map((v) => Math.min(255, Math.max(1, v))); // clip(avg, 1, 255)
  const scale = avg.map((v) => 255.0 / v);

  const out = new ImageData(width, height);
  const src = imageData.data;
  const dst = out.data;

  for (let i = 0; i < src.length; i += 4) {
    dst[i] = Math.min(255, Math.max(0, Math.floor(src[i] * scale[0])));
    dst[i + 1] = Math.min(255, Math.max(0, Math.floor(src[i + 1] * scale[1])));
    dst[i + 2] = Math.min(255, Math.max(0, Math.floor(src[i + 2] * scale[2])));
    dst[i + 3] = src[i + 3];
  }

  return out;
}

function rgbToHsv(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const v = max;
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  let h = 0;

  if (max !== min) {
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h, s, v };
}

function rgbToProcreateHsb(r, g, b) {
  const { h, s, v } = rgbToHsv(r, g, b);
  return { hue: h, saturation: s, brightness: v, colorSpace: 0, alpha: 1 };
}

function rgbToHex(r, g, b) {
  const toHex = (v) => v.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToCmyk(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);

  if (k === 1) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }

  const c = (1 - rn - k) / (1 - k);
  const m = (1 - gn - k) / (1 - k);
  const y = (1 - bn - k) / (1 - k);

  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100),
  };
}

function rgbToHsl(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function formatColor(r, g, b, format) {
  switch (format) {
    case "hex":
      return rgbToHex(r, g, b);
    case "cmyk": {
      const { c, m, y, k } = rgbToCmyk(r, g, b);
      return `cmyk(${c}, ${m}, ${y}, ${k})`;
    }
    case "hsb": {
      const { h, s, v } = rgbToHsv(r, g, b);
      return `hsb(${Math.round(h * 360)}°, ${Math.round(s * 100)}%, ${Math.round(v * 100)}%)`;
    }
    case "hsl": {
      const { h, s, l } = rgbToHsl(r, g, b);
      return `hsl(${h}°, ${s}%, ${l}%)`;
    }
    case "rgb":
    default:
      return `(${r}, ${g}, ${b})`;
  }
}

async function buildSwatchesFile(palette, name) {
  const swatches = palette.map(([r, g, b]) => rgbToProcreateHsb(r, g, b));
  const data = { name, swatches };

  const zip = new JSZip();
  zip.file("Swatches.json", JSON.stringify(data));
  return zip.generateAsync({ type: "blob" });
}

// --- UI wiring ---

function resetForNewImage() {
  currentPalette = null;
  paletteSection.classList.add("hidden");
  correctedSection.classList.add("hidden");
  swatchGrid.innerHTML = "";
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    currentImage = img;
    originalPreview.src = url;
    previewSection.classList.remove("hidden");
    resetForNewImage();
    syncReferenceBounds();
  };
  img.src = url;
});

function syncReferenceBounds() {
  const rows = parseInt(rowsInput.value, 10) || 1;
  const cols = parseInt(colsInput.value, 10) || 1;
  refRowInput.max = String(Math.max(0, rows - 1));
  refColInput.max = String(Math.max(0, cols - 1));
  if (parseInt(refRowInput.value, 10) > rows - 1) refRowInput.value = "0";
  if (parseInt(refColInput.value, 10) > cols - 1) refColInput.value = "0";
}

rowsInput.addEventListener("change", syncReferenceBounds);
colsInput.addEventListener("change", syncReferenceBounds);

useReferenceCheckbox.addEventListener("change", () => {
  referenceFields.classList.toggle("hidden", !useReferenceCheckbox.checked);
});

extractBtn.addEventListener("click", () => {
  if (!currentImage) return;

  const width = currentImage.naturalWidth;
  const height = currentImage.naturalHeight;
  const rows = parseInt(rowsInput.value, 10);
  const cols = parseInt(colsInput.value, 10);
  const useReference = useReferenceCheckbox.checked;

  workCanvas.width = width;
  workCanvas.height = height;
  workCtx.drawImage(currentImage, 0, 0, width, height);
  const originalData = workCtx.getImageData(0, 0, width, height);

  let workingData = originalData;
  let refRow = 0, refCol = 0;

  if (useReference) {
    refRow = parseInt(refRowInput.value, 10);
    refCol = parseInt(refColInput.value, 10);
    const bounds = getCellBounds(width, height, rows, cols, refRow, refCol);
    const refAvg = referencePatchAverage(originalData, width, bounds);
    workingData = whiteBalanceCorrect(originalData, width, height, refAvg);

    correctedCanvas.width = width;
    correctedCanvas.height = height;
    correctedCanvas.getContext("2d").putImageData(workingData, 0, 0);
    correctedSection.classList.remove("hidden");
  } else {
    correctedSection.classList.add("hidden");
  }

  let palette = extractGridColors(workingData, width, height, rows, cols);

  if (useReference) {
    const refIndex = refRow * cols + refCol;
    palette = palette.filter((_, i) => i !== refIndex);
  }

  currentPalette = palette;
  renderPalette(palette);
});

function renderPalette(palette) {
  swatchGrid.innerHTML = "";

  palette.forEach(([r, g, b]) => {
    const cell = document.createElement("div");
    cell.className = "swatch";

    const swatchColor = document.createElement("div");
    swatchColor.className = "swatch-color";
    swatchColor.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;

    const label = document.createElement("div");
    label.textContent = formatColor(r, g, b, currentFormat);

    cell.appendChild(swatchColor);
    cell.appendChild(label);
    swatchGrid.appendChild(cell);
  });

  paletteSection.classList.remove("hidden");
}

function setFormat(format) {
  currentFormat = format;

  formatButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.format === format);
  });

  if (currentPalette) {
    renderPalette(currentPalette);
  }
}

formatButtons.forEach((btn) => {
  btn.addEventListener("click", () => setFormat(btn.dataset.format));
});

setFormat(currentFormat);

exportBtn.addEventListener("click", async () => {
  if (!currentPalette) return;

  const name = paletteNameInput.value.trim() || "MyPalette";
  const blob = await buildSwatchesFile(currentPalette, name);

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.swatches`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});
