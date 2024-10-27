/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/saveDetectionResults/route.ts
import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { NextRequest, NextResponse } from 'next/server';

const RESULTS_FILE = 'all-detection-results.json';
const CLEANED_RESULTS_FILE = 'detection-results-cleaned.json';

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

interface CleanedResult {
  imagePath: string;
  numberOfResults: number;
  results: Array<{
    brawlerId: number;
    brawlerName: string;
    section: string;
  }>;
  hasDebugImage: boolean;
}

interface ResultsFile {
  lastUpdated: string;
  results: DetectionResult[];
}

interface CleanedResultsFile {
  lastUpdated: string;
  results: CleanedResult[];
}

interface BrawlerResult {
  brawlerId: number;
  brawlerName: string;
  confidence: number;
  location: { x: number; y: number };
  scale: number;
  section: string;
}

interface NewDetectionResult {
  imagePath: string;
  numberOfResults: number;
  results: BrawlerResult[];
  hasDebugImage: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const newData = await request.json();
    let existingData: ResultsFile = { lastUpdated: '', results: [] };
    let existingCleanedData: CleanedResultsFile = { lastUpdated: '', results: [] };

    try {
      // Try to read existing results files
      const filePath = join(process.cwd(), 'detection-results', RESULTS_FILE);
      const cleanedFilePath = join(process.cwd(), 'detection-results', CLEANED_RESULTS_FILE);
      
      const existingContent = await readFile(filePath, 'utf8');
      existingData = JSON.parse(existingContent);
      
      try {
        const existingCleanedContent = await readFile(cleanedFilePath, 'utf8');
        existingCleanedData = JSON.parse(existingCleanedContent);
      } catch (error) {
        console.log('No existing cleaned results file found, creating new one');
      }
    } catch (error) {
      console.log('No existing results files found, creating new ones');
    }

    // Ensure data structures exist
    if (!existingData.results) {
      existingData = { lastUpdated: '', results: [] };
    }
    if (!existingCleanedData.results) {
      existingCleanedData = { lastUpdated: '', results: [] };
    }

    // Process new results and create cleaned version
    const newResults: NewDetectionResult[] = Array.isArray(newData.results) ? newData.results : [newData];
    const cleanedNewResults: CleanedResult[] = newResults.map((result: NewDetectionResult) => ({
      imagePath: result.imagePath,
      numberOfResults: result.numberOfResults,
      hasDebugImage: result.hasDebugImage,
      results: result.results.map(({ brawlerId, brawlerName, section }: BrawlerResult) => ({
        brawlerId,
        brawlerName,
        section
      }))
    }));

    // Update both full and cleaned results
    const timestamp = new Date().toISOString();
    
    const updatedData: ResultsFile = {
      lastUpdated: timestamp,
      results: [...existingData.results, ...newResults]
    };

    const updatedCleanedData: CleanedResultsFile = {
      lastUpdated: timestamp,
      results: [...existingCleanedData.results, ...cleanedNewResults]
    };
    
    // Save both files
    const filePath = join(process.cwd(), 'detection-results', RESULTS_FILE);
    const cleanedFilePath = join(process.cwd(), 'detection-results', CLEANED_RESULTS_FILE);
    
    await Promise.all([
      writeFile(filePath, JSON.stringify(updatedData, null, 2), 'utf8'),
      writeFile(cleanedFilePath, JSON.stringify(updatedCleanedData, null, 2), 'utf8')
    ]);
    
    return NextResponse.json({ 
      success: true, 
      filename: RESULTS_FILE,
      cleanedFilename: CLEANED_RESULTS_FILE,
      message: `Results saved to ${RESULTS_FILE} and ${CLEANED_RESULTS_FILE}` 
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