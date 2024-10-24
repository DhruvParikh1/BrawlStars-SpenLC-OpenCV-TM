'use client'
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { 
  TemplateMatchResult, 
  preprocessImage, 
  findBrawlers,
} from '../utils/imageProcessing';

interface Props {
  guideImagePath: string;
}

export const BrawlerDetection: React.FC<Props> = ({ guideImagePath }) => {
  const [results, setResults] = useState<TemplateMatchResult[]>([]);
  const [debugImage, setDebugImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const detectBrawlers = async () => {
      try {
        setLoading(true);
        setError(null);

        // Log input prop
        console.log('Component Props:', { guideImagePath });

        console.log('Loading guide image:', guideImagePath);
        const guideImageResponse = await axios.get(guideImagePath, {
          responseType: 'arraybuffer'
        });
        console.log('Guide Image Response:', {
          status: guideImageResponse.status,
          headers: guideImageResponse.headers,
          dataSize: guideImageResponse.data.length
        });

        const guideImage = await preprocessImage(guideImageResponse.data);

        console.log('Fetching emoji templates...');
        const emojiResponse = await axios.get('/api/getBrawlerEmojis');
        console.log('Emoji API Response:', {
          status: emojiResponse.status,
          dataLength: emojiResponse.data.length,
          sampleEmoji: emojiResponse.data[0] // Show structure of first emoji
        });

        const emojiData = emojiResponse.data;
        console.log('Processing templates...');

        const templates = await Promise.all(
          emojiData.map(async (emoji: any) => {
            console.log('Processing Emoji:', {
              brawlerId: emoji.brawlerId,
              brawlerName: emoji.brawlerName,
              emojiDataLength: emoji.emojiData.length
            });
            return {
              brawlerId: emoji.brawlerId,
              brawlerName: emoji.brawlerName,
              template: await preprocessImage(Buffer.from(emoji.emojiData, 'base64'))
            };
          })
        );

        console.log('Performing detection...');
        const { results: matchResults, debugImage } = await findBrawlers(guideImage, templates);
        console.log('Detection Results:', {
          numberOfResults: matchResults.length,
          results: matchResults,
          hasDebugImage: !!debugImage
        });

        setResults(matchResults);
        setDebugImage(debugImage || null);

        // Cleanup
        guideImage.delete();
        templates.forEach(({ template }) => template.delete());
      } catch (err) {
        console.error('Error in detectBrawlers:', {
          error: err,
          message: err instanceof Error ? err.message : 'An error occurred',
          stack: err instanceof Error ? err.stack : undefined
        });
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    detectBrawlers();
  }, [guideImagePath]);

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse">Detecting brawlers...</div>
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

  console.log('Rendering Results:', {
    totalResults: results.length,
    bySection: {
      firstPick: results.filter(r => r.section === 'firstPick').length,
      sixthPick: results.filter(r => r.section === 'sixthPick').length,
      otherPicks: results.filter(r => r.section === 'otherPicks').length
    },
    debugImagePresent: !!debugImage
  });

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Detection Results</h2>
      {debugImage && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Debug Visualization</h3>
          <img src={debugImage} alt="Debug visualization" className="border rounded" />
        </div>
      )}
      <div className="space-y-6">
        {(['firstPick', 'sixthPick', 'otherPicks'] as const).map((section) => (
          <div key={section} className="border rounded p-4">
            <h3 className="text-lg font-semibold mb-2">
              {section === 'firstPick' ? '1st Pick' :
               section === 'sixthPick' ? '6th Pick' : 'Other Picks'}
            </h3>
            <div className="flex flex-wrap gap-2">
              {results
                .filter((result) => result.section === section)
                .map((result) => (
                  <div
                    key={`${result.brawlerId}-${result.location.x}-${result.location.y}`}
                    className="bg-gray-100 rounded p-2"
                  >
                    <span className="font-medium text-black">{result.brawlerName}</span>
                    <span className="text-sm text-gray-500 ml-2">
                      ({Math.round(result.confidence * 100)}%)
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};