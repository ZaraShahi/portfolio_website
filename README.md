# Zara Shahi portfolio

This is a static website with editable HTML sections. No build or package installation is needed. Serve the repository over HTTP (for example, with VS Code Live Server); opening `index.html` directly using `file://` will not allow the section files to load.

## Page sections

- `index.html` contains navigation, the Artwork heading, section file references, Contact, and the footer.
- `sections/about.html` contains About.
- `sections/cv.html` contains the CV.
- `sections/artworks/weaving.html` contains the existing weaving artwork.
- `sections/artworks/photography.html` is ready for photography artwork.

Section files are HTML fragments, not standalone pages. Their image paths are relative to `index.html`, so use `assets/images/...`, not `../../assets/images/...`.

## Add artwork or detail slides

Copy a complete `portfolio-tile` button into the `portfolio-grid--carousel` in the relevant medium's file:

```html
<button class="portfolio-tile portfolio-tile--image" type="button"
  aria-label="Open Artwork Title artwork"
  data-caption="Artwork Title, Year, medium"
  data-slides="assets/images/example-1.jpg|assets/images/example-2.jpg">
  <img src="assets/images/example-1.jpg" alt="Artwork Title by Zara Shahi"
    loading="lazy" decoding="async" />
</button>
```

Put the image files in `assets/images/`. Change the title, caption, image paths, and alt text. Each button adds one tile to the row. Add more images to `data-slides`, separated by `|`, to add detail slides in the lightbox. The thumbnail typically uses the first image. No JavaScript changes are required.

Photography currently has an empty-state message and a commented-out button template. Remove the message and uncomment or paste buttons when adding real artwork.

## Add another medium

1. Copy `sections/artworks/photography.html` into a new file, such as `sections/artworks/papermaking.html`.
2. Replace every `photography` identifier with a unique medium identifier such as `papermaking`. This includes the section ID, heading ID, track ID, `aria-labelledby`, and both `aria-controls` values.
3. Change the visible heading and arrow/row labels. Replace the empty-state message with your artwork buttons.
4. Add one reference inside the Artwork section of `index.html`, in the desired display order:

```html
<div data-section-src="sections/artworks/papermaking.html"></div>
```

Each medium gets its own horizontal row, arrow controls, and lightbox slide list. Lightbox navigation wraps within that medium. The existing keyboard, zoom, pan, and touch controls are shared automatically.

## Loading and deployment

`script.js` loads all registered section files before initializing navigation, reveal animations, carousels, and the lightbox. Initial links such as `#about`, `#cv`, or `#photography` scroll to their section after loading. Failed loads display an error message instead of silently hiding content. JavaScript is required to load the sections.

The existing GitHub Pages workflow uploads the entire repository, including the section files. No deployment configuration changes are needed.
