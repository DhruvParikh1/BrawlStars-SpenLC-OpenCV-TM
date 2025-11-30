Brawl Stars SpenLC Template-Matching Detector
============================================

This app ingests SpenLC draft guides, runs OpenCV template matching in the browser to detect every brawler emoji, and produces both JSON exports and debug overlays that show exactly what was found.

How it works
------------
- Guide intake: server component `app/page.tsx` loads every image in `public/guides/SpenLC` via `utils/getGuideImages.ts` and passes the list to the client.
- Emoji source: `/api/getBrawlerEmojis` fetches brawler emoji PNGs from the Brawlify CDN, caches them in memory (12 hours) to avoid re-fetching.
- Template matching: `components/BrawlerDetection.tsx` streams images through `utils/imageProcessing.ts`, which pads the three board regions (1st pick, 6th pick, other picks), tries multiple scales per emoji, filters overlaps, and tags each match with its section.
- Debug overlays: `findBrawlers` draws bounding boxes for matches and section bounds, then POSTs to `/api/saveDebugImage`, which writes PNGs to `public/debug-image-result`.
- Results export: `components/BrawlerDetection` POSTs detections to `/api/saveDetectionResults`, which appends to `detection-results/all-detection-results.json` (full data) and `detection-results/detection-results-cleaned.json` (ids, names, sections).

Run it yourself
---------------
```bash
npm install
npm run dev
# open http://localhost:3000
```

Usage notes
-----------
- Add or replace guide images in `public/guides/SpenLC` (PNG/JPG/GIF). They auto-load on page refresh.
- The detector processes images sequentially and will display progress plus save status for each file.
- Network is required the first time to fetch emojis; subsequent runs use the in-memory cache until it expires.
- Outputs accumulate; delete files in `detection-results/` or `public/debug-image-result/` if you want a clean run.

Artifacts
---------
- JSON: `detection-results/all-detection-results.json` (full coords/confidence) and `detection-results/detection-results-cleaned.json` (compact).
- Debug images: `public/debug-image-result/*-debug.png` with bounding boxes and section outlines.

Included debug samples
----------------------
<img alt="Belles Rock debug overlay" src="./public/debug-image-result/Belles-Rock-debug.png" width="420" />
<img alt="Hot Potato debug overlay" src="./public/debug-image-result/Hot-Potato-debug.png" width="420" />
<img alt="Snake Prairie debug overlay" src="./public/debug-image-result/Snake-Prairie-debug.png" width="420" />

Key files to explore
--------------------
- `components/BrawlerDetection.tsx` — orchestrates detection flow, progress UI, saving results.
- `utils/imageProcessing.ts` — OpenCV preprocessing, section bounds, matching, debug rendering.
- `app/api/getBrawlerEmojis/route.ts` — pulls and caches brawler emoji sprites from Brawlify.
- `app/api/saveDebugImage/route.ts` — saves base64 debug overlays to `public/debug-image-result`.
- `app/api/saveDetectionResults/route.ts` — appends run outputs to JSON artifacts.
