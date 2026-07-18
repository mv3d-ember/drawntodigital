# Paper Palette → Procreate Swatches

A static, client-side port of the original Streamlit app. Upload a photo of a
paper paint/color palette, tell it your grid layout, optionally correct for
white balance using a reference gray/white square, then export the extracted
colors as a `.swatches` file for Procreate.

Everything runs in the browser (canvas pixel processing + [JSZip](https://stuk.github.io/jszip/)
for the export) — no server or build step required.

## Files

- `index.html` — page structure
- `style.css` — styling
- `app.js` — image processing and swatch export logic

## Running locally

Open `index.html` directly in a browser, or serve the folder:

```sh
python3 -m http.server 8000
```

## Deploying to GitHub Pages

A workflow at `.github/workflows/pages.yml` deploys the site automatically on
push to `main`. To enable it:

1. Merge/push this to `main`.
2. In the repo, go to **Settings → Pages** and set **Source** to
   **GitHub Actions**.
3. The site will be published at `https://<owner>.github.io/<repo>/`.

Alternatively, without the workflow, you can set **Settings → Pages → Source**
to **Deploy from a branch** and pick the branch/root folder containing these
files.
