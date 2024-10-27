/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/saveDetectionResults/route.ts
import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { NextRequest, NextResponse } from 'next/server';

const RESULTS_FILE = 'all-detection-results.json';

interface DetectionResult {
  imagePath: string;
  numberOfResults: number;
  results: Array<{
    brawlerId: number;
    brawlerName: string;
    confidence: number;
    location: { x: number; y: number };
    scale: number;
    section: string;
  }>;
  hasDebugImage: boolean;
}

interface ResultsFile {
  lastUpdated: string;
  results: DetectionResult[];
}

export async function POST(request: NextRequest) {
  try {
    const newData = await request.json();
    let existingData: ResultsFile = { lastUpdated: '', results: [] };

    try {
      // Try to read existing results file
      const filePath = join(process.cwd(), 'detection-results', RESULTS_FILE);
      const existingContent = await readFile(filePath, 'utf8');
      existingData = JSON.parse(existingContent);
    } catch (error) {
      // File doesn't exist yet or is invalid, start with empty structure
      console.log('No existing results file found, creating new one');
    }

    // Ensure existingData has the correct structure
    if (!existingData.results) {
      existingData = { lastUpdated: '', results: [] };
    }

    // Merge new results with existing ones
    const updatedData: ResultsFile = {
      lastUpdated: new Date().toISOString(),
      results: [
        ...existingData.results,
        ...(Array.isArray(newData.results) ? newData.results : [newData])
      ]
    };
    
    // Save to file
    const filePath = join(process.cwd(), 'detection-results', RESULTS_FILE);
    await writeFile(filePath, JSON.stringify(updatedData, null, 2), 'utf8');
    
    return NextResponse.json({ 
      success: true, 
      filename: RESULTS_FILE,
      message: `Results saved to ${RESULTS_FILE}` 
    });
  } catch (error) {
    console.error('Error saving detection results:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to save detection results' 
      }, 
      { status: 500 }
    );
  }
}