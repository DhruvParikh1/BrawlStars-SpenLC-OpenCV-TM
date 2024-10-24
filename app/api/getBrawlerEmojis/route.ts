// app/api/getBrawlerEmojis/route.ts
import { NextResponse } from 'next/server';
import NodeCache from 'node-cache';
import axios from 'axios';
import type { BrawlerResponse } from '../../../types/brawlerDataTypes';

const cache = new NodeCache({ stdTTL: 43200, checkperiod: 600 });
const EMOJI_CACHE_KEY = 'brawlerEmojis';
const BRAWLIFY_API_URL = 'https://api.brawlify.com/v1/brawlers';

export async function GET() {
  try {
    // Check cache first
    const cachedEmojis = cache.get(EMOJI_CACHE_KEY);
    if (cachedEmojis) {
      console.log('Returning cached emojis');
      return NextResponse.json(cachedEmojis);
    }

    // Fetch brawler data directly from Brawlify
    console.log('Fetching brawler data from Brawlify...');
    const brawlerResponse = await axios.get<BrawlerResponse>(BRAWLIFY_API_URL);
    const brawlers = brawlerResponse.data;

    if (!brawlers.list || !Array.isArray(brawlers.list)) {
      console.error('Invalid brawler data received:', brawlers);
      return NextResponse.json(
        { error: 'Invalid brawler data format' },
        { status: 500 }
      );
    }

    console.log(`Fetching emojis for ${brawlers.list.length} brawlers...`);

    // Fetch all emoji images with proper error handling for each
    const emojiPromises = brawlers.list.map(async (brawler) => {
      try {
        const emojiUrl = `https://cdn.brawlify.com/brawlers/emoji/${brawler.id}.png`;
        console.log(`Fetching emoji for ${brawler.name} from ${emojiUrl}`);

        const response = await axios.get(emojiUrl, {
          responseType: 'arraybuffer',
          timeout: 5000 // 5 second timeout
        });

        return {
          brawlerId: brawler.id,
          brawlerName: brawler.name,
          emojiData: Buffer.from(response.data).toString('base64')
        };
      } catch (error) {
        console.error(`Failed to fetch emoji for brawler ${brawler.name}:`, error);
        return null;
      }
    });

    const emojis = (await Promise.all(emojiPromises)).filter(Boolean);

    if (emojis.length === 0) {
      console.error('No emojis were successfully fetched');
      return NextResponse.json(
        { error: 'Failed to fetch any brawler emojis' },
        { status: 500 }
      );
    }

    console.log(`Successfully fetched ${emojis.length} emojis`);
    cache.set(EMOJI_CACHE_KEY, emojis);

    return NextResponse.json(emojis);
  } catch (error) {
    console.error('Error in getBrawlerEmojis:', error);

    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status || 500;
      const errorMessage = error.response?.data?.message || error.message;

      return NextResponse.json(
        { error: `Failed to fetch brawler emojis: ${errorMessage}` },
        { status: statusCode }
      );
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred while fetching brawler emojis' },
      { status: 500 }
    );
  }
}