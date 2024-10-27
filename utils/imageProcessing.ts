/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import cv from '@techstark/opencv-js';
import { waitForOpenCV } from './opencv';

export interface TemplateMatchResult {
  brawlerId: number;
  brawlerName: string;
  confidence: number;
  location: { x: number; y: number };
  section: 'firstPick' | 'sixthPick' | 'otherPicks';
  scale: number;
}

// Add padding to section boundaries
const SECTION_PADDING = 30; // Pixels of padding around each section

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
    width: 505,
    height: 353
  },
  otherPicks: {
    x: 590,
    y: 742,
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

async function saveBase64Image(base64Data: string, filename: string): Promise<string> {
  try {
    const response = await fetch('/api/saveDebugImage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base64Data,
        filename,
      }),
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to save debug image');
    }

    return data.filepath;
  } catch (error) {
    console.error('Error saving debug image:', error);
    throw error;
  }
}

function generateDebugFilename(originalPath: string): string {
  const filename = originalPath.split('/').pop() || originalPath;
  const lastDotIndex = filename.lastIndexOf('.');
  const name = lastDotIndex > -1 ? filename.slice(0, lastDotIndex) : filename;
  const ext = lastDotIndex > -1 ? filename.slice(lastDotIndex) : '.png';
  return `${name}-debug${ext}`;
}

// Helper function to get padded bounds while respecting image boundaries
function getPaddedBounds(
  bounds: typeof IMAGE_SECTIONS[keyof typeof IMAGE_SECTIONS],
  imageWidth: number,
  imageHeight: number
) {
  return {
    x: Math.max(0, bounds.x - SECTION_PADDING),
    y: Math.max(0, bounds.y - SECTION_PADDING),
    width: Math.min(imageWidth - bounds.x + SECTION_PADDING, bounds.width + SECTION_PADDING * 2),
    height: Math.min(imageHeight - bounds.y + SECTION_PADDING, bounds.height + SECTION_PADDING * 2)
  };
}

// Helper function to adjust match locations back to original coordinate space
function adjustMatchLocation(
  match: any,
  paddingOffset: { x: number; y: number }
): any {
  return {
    ...match,
    location: {
      x: match.location.x + paddingOffset.x,
      y: match.location.y + paddingOffset.y
    }
  };
}

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

function filterOverlappingMatches(
  matches: any[],
  templateSize: { width: number; height: number },
  section: string,
  globalBrawlers: Set<number>
): any[] {
  const sortedMatches = matches.sort((a, b) => b.confidence - a.confidence);
  const filteredMatches: any[] = [];
  const boxSize = templateSize.width * 1.2;

  for (const match of sortedMatches) {
    // Skip if we've already detected this brawler in any section
    if (globalBrawlers.has(match.brawlerId)) {
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

    if (!hasOverlap || match.confidence > 0.80) {
      filteredMatches.push(match);
      globalBrawlers.add(match.brawlerId);
    }
  }

  return filteredMatches;
}

async function processTemplate(
  roi: any,
  template: any,
  brawlerId: number,
  brawlerName: string,
  bounds: any, // Keep this parameter for backward compatibility
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
                // Keep coordinates relative to ROI
                x: x + resizedTemplate.cols / 2,
                y: y + resizedTemplate.rows / 2
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
  originalImagePath: string,
  threshold = MATCH_THRESHOLD
): Promise<{ results: TemplateMatchResult[], debugImagePath?: string }> {
  await waitForOpenCV();
  const results: TemplateMatchResult[] = [];
  const globalBrawlers = new Set<number>();

  for (const [sectionName, bounds] of Object.entries(IMAGE_SECTIONS)) {
    try {
      // Get padded bounds for the section
      const paddedBounds = getPaddedBounds(bounds, guideImage.cols, guideImage.rows);

      // Create ROI with padded bounds
      const roi = guideImage.roi(new cv.Rect(
        paddedBounds.x,
        paddedBounds.y,
        paddedBounds.width,
        paddedBounds.height
      ));

      const sectionMatches: any[] = [];

      for (const { brawlerId, brawlerName, template } of emojiTemplates) {
        const scales = calculateScales(
          { width: template.cols, height: template.rows },
          paddedBounds
        );

        const sectionThreshold = threshold * (sectionName === 'otherPicks' ? 1 : 0.95);

        for (const scale of scales) {
          const matches = await processTemplate(
            roi,
            template,
            brawlerId,
            brawlerName,
            paddedBounds,
            scale,
            sectionThreshold
          );
          
          // Adjust matches to account for ROI position
          const adjustedMatches = matches.map(match => ({
            ...match,
            location: {
              x: match.location.x + (paddedBounds.x - bounds.x),
              y: match.location.y + (paddedBounds.y - bounds.y)
            }
          }));
          
          sectionMatches.push(...adjustedMatches);
        }
      }

      console.log(`[${sectionName}] Found ${sectionMatches.length} initial matches`);

      const templateSize = {
        width: MIN_EMOJI_SIZE,
        height: MIN_EMOJI_SIZE
      };

      // Filter matches
      const filteredMatches = filterOverlappingMatches(
        sectionMatches,
        templateSize,
        sectionName,
        globalBrawlers
      ).filter(match => {
        // Check if match center point falls within original section bounds
        const adjustedX = match.location.x + bounds.x;
        const adjustedY = match.location.y + bounds.y;
        return (
          adjustedX >= bounds.x &&
          adjustedX <= bounds.x + bounds.width &&
          adjustedY >= bounds.y &&
          adjustedY <= bounds.y + bounds.height
        );
      });

      console.log(`[${sectionName}] After filtering: ${filteredMatches.length} matches`);

      // Add final coordinate transformation to global space
      const globalMatches = filteredMatches.map(match => ({
        ...match,
        location: {
          x: match.location.x + bounds.x,
          y: match.location.y + bounds.y
        },
        section: sectionName as 'firstPick' | 'sixthPick' | 'otherPicks'
      }));

      results.push(...globalMatches);

      roi.delete();
    } catch (error) {
      console.error(`Error processing section ${sectionName}:`, error);
    }
  }

  console.log(`Final results: ${results.length} matches`);
  const debugImage = drawDebugVisuals(guideImage, results);
  
  // Save debug image
  let debugImagePath: string | undefined;
  try {
    const filename = generateDebugFilename(originalImagePath);
    debugImagePath = await saveBase64Image(debugImage, filename);
    console.log(`Debug image saved to: ${debugImagePath}`);
  } catch (error) {
    console.error('Failed to save debug image:', error);
  }

  return { results, debugImagePath };
}

function drawDebugVisuals(
  guideImage: any,
  results: TemplateMatchResult[]
): string {
  const debugMat = guideImage.clone();

  // Draw section boundaries
  for (const [sectionName, bounds] of Object.entries(IMAGE_SECTIONS)) {
    // Draw original section boundaries
    cv.rectangle(
      debugMat,
      new cv.Point(bounds.x, bounds.y),
      new cv.Point(bounds.x + bounds.width, bounds.y + bounds.height),
      new cv.Scalar(255, 0, 0, 255), // Red for original bounds
      2
    );

    // Draw padded section boundaries in a different color
    const paddedBounds = getPaddedBounds(bounds, debugMat.cols, debugMat.rows);
    cv.rectangle(
      debugMat,
      new cv.Point(paddedBounds.x, paddedBounds.y),
      new cv.Point(paddedBounds.x + paddedBounds.width, paddedBounds.y + paddedBounds.height),
      new cv.Scalar(0, 0, 255, 255), // Blue for padded bounds
      1
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

export const debugUtils = {
  saveBase64Image,
  generateDebugFilename
};