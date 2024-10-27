/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { 
  TemplateMatchResult, 
  preprocessImage, 
  findBrawlers,
} from '../utils/imageProcessing';

interface Props {
  guideImagePaths: string[];
}

interface SaveStatus {
  saving: boolean;
  error: string | null;
  filename: string | null;
}

interface DetectionResult {
  imagePath: string;
  results: TemplateMatchResult[];
  debugImagePath: string | null;
}

export const BrawlerDetection: React.FC<Props> = ({ guideImagePaths }) => {
  const [allResults, setAllResults] = useState<DetectionResult[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({
    saving: false,
    error: null,
    filename: null
  });

  useEffect(() => {
    const detectBrawlers = async () => {
      try {
        setLoading(true);
        setError(null);
        setSaveStatus({ saving: false, error: null, filename: null });
    
        // Process current image
        const currentPath = guideImagePaths[currentImageIndex];
        const guideImageResponse = await axios.get(currentPath, {
          responseType: 'arraybuffer'
        });
        const guideImage = await preprocessImage(guideImageResponse.data);
    
        const emojiResponse = await axios.get('/api/getBrawlerEmojis');
        const emojiData = emojiResponse.data;
    
        const templates = await Promise.all(
          emojiData.map(async (emoji: any) => ({
            brawlerId: emoji.brawlerId,
            brawlerName: emoji.brawlerName,
            template: await preprocessImage(Buffer.from(emoji.emojiData, 'base64'))
          }))
        );

        const { results: matchResults, debugImagePath } = await findBrawlers(guideImage, templates, currentPath);

        // Add results for current image
        const newResult: DetectionResult = {
          imagePath: currentPath,
          results: matchResults,
          debugImagePath: debugImagePath || null
        };

        setAllResults(prev => [...prev, newResult]);

        // Save combined results
        const detectionResults = {
          timestamp: new Date().toISOString(),
          results: [{
            imagePath: currentPath,
            numberOfResults: matchResults.length,
            results: matchResults,
            hasDebugImage: !!debugImagePath
          }]
        };

        setSaveStatus(prev => ({ ...prev, saving: true }));
        const saveResponse = await axios.post('/api/saveDetectionResults', detectionResults);
        
        if (saveResponse.data.success) {
          setSaveStatus({
            saving: false,
            error: null,
            filename: saveResponse.data.filename
          });
        } else {
          throw new Error(saveResponse.data.error || 'Failed to save results');
        }

        // Cleanup
        guideImage.delete();
        templates.forEach(({ template }) => template.delete());

        // Move to next image if available
        if (currentImageIndex < guideImagePaths.length - 1) {
          setCurrentImageIndex(prev => prev + 1);
        }
      } catch (err) {
        console.error('Error in detectBrawlers:', err);
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        setError(errorMessage);
        setSaveStatus(prev => ({
          ...prev,
          saving: false,
          error: `Failed to save results: ${errorMessage}`
        }));
      } finally {
        setLoading(false);
      }
    };

    detectBrawlers();
  }, [currentImageIndex, guideImagePaths]);

  if (loading && currentImageIndex === 0) {
    return (
      <div className="p-4">
        <div className="animate-pulse">
          Detecting brawlers... (Image {currentImageIndex + 1} of {guideImagePaths.length})
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-red-500 font-medium">Error:</div>
        <div className="mt-1">{error}</div>
        <button 
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Detection Results</h2>
      
      {/* Progress Indicator */}
      <div className="mb-4">
        Processing image {currentImageIndex + 1} of {guideImagePaths.length}
      </div>

      {/* Save Status */}
      {saveStatus.saving && (
        <div className="mb-4 text-blue-600">
          Saving results...
        </div>
      )}
      {saveStatus.filename && (
        <div className="mb-4 text-green-600">
          Results saved to: {saveStatus.filename}
        </div>
      )}
      {saveStatus.error && (
        <div className="mb-4 text-red-500">
          {saveStatus.error}
        </div>
      )}

      {/* Results for each processed image */}
      {allResults.map((result, index) => (
        <div key={result.imagePath} className="mb-8 border-b pb-8">
          <h3 className="text-lg font-semibold mb-4">
            Results for {result.imagePath.split('/').pop()}
          </h3>

          {result.debugImagePath && (
            <div className="mb-6">
              <h4 className="text-md font-semibold mb-2">Debug Visualization</h4>
              <img 
                src={`/debug-image-result/${result.debugImagePath.split('/').pop()}`} 
                alt="Debug visualization" 
                className="border rounded" 
              />
            </div>
          )}

          <div className="space-y-6">
            {(['firstPick', 'sixthPick', 'otherPicks'] as const).map((section) => (
              <div key={section} className="border rounded p-4">
                <h4 className="text-lg font-semibold mb-2">
                  {section === 'firstPick' ? '1st Pick' :
                   section === 'sixthPick' ? '6th Pick' : 'Other Picks'}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {result.results
                    .filter((detection) => detection.section === section)
                    .map((detection) => (
                      <div
                        key={`${detection.brawlerId}-${detection.location.x}-${detection.location.y}`}
                        className="bg-gray-100 rounded p-2"
                      >
                        <span className="font-medium text-black">{detection.brawlerName}</span>
                        <span className="text-sm text-gray-500 ml-2">
                          ({Math.round(detection.confidence * 100)}%)
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};