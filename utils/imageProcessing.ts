import cv from '@techstark/opencv-js';
import { waitForOpenCV } from './opencv';

// Keep existing interfaces and section definitions...
export interface TemplateMatchResult {
  brawlerId: number;
  brawlerName: string;
  confidence: number;
  location: { x: number; y: number };
  section: 'firstPick' | 'sixthPick' | 'otherPicks';
  scale: number;
}

export const IMAGE_SECTIONS = {
  firstPick: {
    x: 704,
    y: 116,
    width: 576,
    height: 370
  },
  sixthPick: {
    x: 1385,
    y: 131,
    width: 504,
    height: 353
  },
  otherPicks: {
    x: 590,
    y: 755,
    width: 1329,
    height: 322
  }
};

export const SECTION_LIMITS = {
  firstPick: 6,
  sixthPick: 6,
  otherPicks: 16
};

// Optimized constants
const MATCH_THRESHOLD = 0.65;
const IOU_THRESHOLD = 0.3;
const MIN_EMOJI_SIZE = 45;

export async function preprocessImage(imageData: ArrayBuffer): Promise<any> {
  await waitForOpenCV();
  const data = new Uint8Array(imageData);
  const blob = new Blob([data], { type: 'image/png' });
  const imageUrl = URL.createObjectURL(blob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = imageUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    const mat = cv.imread(canvas);
    const processed = new cv.Mat();

    // Simplified preprocessing - just convert to RGB
    cv.cvtColor(mat, processed, cv.COLOR_RGBA2RGB);

    // Cleanup
    mat.delete();
    URL.revokeObjectURL(imageUrl);

    return processed;
  } catch (error) {
    URL.revokeObjectURL(imageUrl);
    throw error;
  }
}

// Simplified scale calculation
function calculateScales(
  templateSize: { width: number; height: number },
  sectionBounds: { width: number; height: number }
): number[] {
  const estimatedIconSize = Math.min(
    sectionBounds.width / 3,
    sectionBounds.height / 2
  );

  const baseScale = estimatedIconSize / Math.max(templateSize.width, templateSize.height);

  // Reduced number of scales
  return [
    baseScale * 0.8,
    baseScale * 0.9,
    baseScale,
    baseScale * 1.1,
    baseScale * 1.2
  ];
}

function calculateIOU(box1: any, box2: any) {
  const x1 = Math.max(box1.x, box2.x);
  const y1 = Math.max(box1.y, box2.y);
  const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
  const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

  if (x2 < x1 || y2 < y1) return 0;

  const intersection = (x2 - x1) * (y2 - y1);
  const area1 = box1.width * box1.height;
  const area2 = box2.width * box2.height;
  const union = area1 + area2 - intersection;

  return union > 0 ? intersection / union : 0;
}

// Memory-efficient filtering
function filterOverlappingMatches(
  matches: any[],
  templateSize: { width: number; height: number },
  section: string
): any[] {
  const sortedMatches = matches.sort((a, b) => b.confidence - a.confidence);
  const filteredMatches: any[] = [];
  const boxSize = templateSize.width * 1.2;

  // Track unique brawlers
  const detectedBrawlers = new Set<number>();

  for (const match of sortedMatches) {
    // Skip if we've already detected this brawler in this section
    if (detectedBrawlers.has(match.brawlerId)) {
      continue;
    }

    const matchBox = {
      x: match.location.x - boxSize/2,
      y: match.location.y - boxSize/2,
      width: boxSize,
      height: boxSize
    };

    const hasOverlap = filteredMatches.some(existing => {
      const existingBox = {
        x: existing.location.x - boxSize/2,
        y: existing.location.y - boxSize/2,
        width: boxSize,
        height: boxSize
      };
      return calculateIOU(matchBox, existingBox) > IOU_THRESHOLD;
    });

    if (!hasOverlap || match.confidence > 0.9) {
      filteredMatches.push(match);
      detectedBrawlers.add(match.brawlerId);
    }
  }

  return filteredMatches;
}


// Memory-efficient template matching
async function processTemplate(
  roi: any,
  template: any,
  brawlerId: number,
  brawlerName: string,
  bounds: any,
  scale: number,
  threshold: number
): Promise<any[]> {
  const matches: any[] = [];
  const grayRoi = new cv.Mat();
  const grayTemplate = new cv.Mat();
  const resizedTemplate = new cv.Mat();

  try {
    cv.cvtColor(roi, grayRoi, cv.COLOR_RGB2GRAY);
    cv.cvtColor(template, grayTemplate, cv.COLOR_RGBA2GRAY);

    const newSize = new cv.Size(
      Math.round(grayTemplate.cols * scale),
      Math.round(grayTemplate.rows * scale)
    );

    if (newSize.width >= MIN_EMOJI_SIZE && newSize.height >= MIN_EMOJI_SIZE) {
      cv.resize(grayTemplate, resizedTemplate, newSize, 0, 0, cv.INTER_AREA);
      const result = new cv.Mat();

      cv.matchTemplate(grayRoi, resizedTemplate, result, cv.TM_CCOEFF_NORMED);

      for (let y = 0; y < result.rows; y++) {
        for (let x = 0; x < result.cols; x++) {
          const confidence = result.floatAt(y, x);
          if (confidence >= threshold) {
            matches.push({
              brawlerId,
              brawlerName,
              confidence,
              location: {
                x: x + bounds.x + (newSize.width / 2),
                y: y + bounds.y + (newSize.height / 2)
              },
              scale
            });
          }
        }
      }
      result.delete();
    }
  } finally {
    grayRoi.delete();
    grayTemplate.delete();
    resizedTemplate.delete();
  }

  return matches;
}

export async function findBrawlers(
  guideImage: any,
  emojiTemplates: Array<{ brawlerId: number; brawlerName: string; template: any }>,
  threshold = MATCH_THRESHOLD
): Promise<{ results: TemplateMatchResult[], debugImage?: string }> {
  await waitForOpenCV();
  const results: TemplateMatchResult[] = [];

  for (const [sectionName, bounds] of Object.entries(IMAGE_SECTIONS)) {
    try {
      const roi = guideImage.roi(new cv.Rect(bounds.x, bounds.y, bounds.width, bounds.height));
      const sectionMatches: any[] = [];

      for (const { brawlerId, brawlerName, template } of emojiTemplates) {
        const scales = calculateScales(
          { width: template.cols, height: template.rows },
          bounds
        );

        const sectionThreshold = threshold * (sectionName === 'otherPicks' ? 1 : 0.9);

        for (const scale of scales) {
          const matches = await processTemplate(
            roi,
            template,
            brawlerId,
            brawlerName,
            bounds,
            scale,
            sectionThreshold
          );
          sectionMatches.push(...matches);
        }
      }

      console.log(`[${sectionName}] Found ${sectionMatches.length} initial matches`);

      const templateSize = {
        width: MIN_EMOJI_SIZE,
        height: MIN_EMOJI_SIZE
      };

      const filteredMatches = filterOverlappingMatches(sectionMatches, templateSize, sectionName);
      console.log(`[${sectionName}] After filtering: ${filteredMatches.length} matches`);

      results.push(...filteredMatches.map(match => ({
        ...match,
        section: sectionName as 'firstPick' | 'sixthPick' | 'otherPicks'
      })));

      roi.delete();
    } catch (error) {
      console.error(`Error processing section ${sectionName}:`, error);
    }
  }

  console.log(`Final results: ${results.length} matches`);
  const debugImage = drawDebugVisuals(guideImage, results);
  return { results, debugImage };
}

// Simplified debug visualization
function drawDebugVisuals(
  guideImage: any,
  results: TemplateMatchResult[]
): string {
  const debugMat = guideImage.clone();

  // Draw section boundaries
  for (const [sectionName, bounds] of Object.entries(IMAGE_SECTIONS)) {
    cv.rectangle(
      debugMat,
      new cv.Point(bounds.x, bounds.y),
      new cv.Point(bounds.x + bounds.width, bounds.y + bounds.height),
      new cv.Scalar(255, 0, 0, 255),
      2
    );
  }

  // Draw match locations
  for (const match of results) {
    const boxSize = MIN_EMOJI_SIZE * 1.5;
    const halfSize = boxSize / 2;

    cv.rectangle(
      debugMat,
      new cv.Point(match.location.x - halfSize, match.location.y - halfSize),
      new cv.Point(match.location.x + halfSize, match.location.y + halfSize),
      new cv.Scalar(0, 255, 0, 255),
      2
    );

    cv.putText(
      debugMat,
      `${match.brawlerName} (${Math.round(match.confidence * 100)}%)`,
      new cv.Point(match.location.x - halfSize, match.location.y - halfSize - 5),
      cv.FONT_HERSHEY_SIMPLEX,
      0.5,
      new cv.Scalar(0, 255, 0, 255),
      2
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = debugMat.cols;
  canvas.height = debugMat.rows;
  cv.imshow(canvas, debugMat);
  const base64 = canvas.toDataURL('image/png');
  debugMat.delete();
  return base64;
}