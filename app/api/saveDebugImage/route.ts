import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { base64Data, filename } = data;

    // Create path to debug directory inside public folder
    const debugDir = path.join(process.cwd(), 'public', 'debug-image-result');
    try {
      await fs.access(debugDir);
    } catch {
      await fs.mkdir(debugDir, { recursive: true });
    }

    // Remove data URL prefix if present
    const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Image, 'base64');

    // Save the file
    const filepath = path.join(debugDir, filename);
    await fs.writeFile(filepath, buffer);

    // Return the public URL path (without 'public' in the path)
    return NextResponse.json({ 
      success: true, 
      filepath: `/debug-image-result/${filename}` 
    });
  } catch (error) {
    console.error('Error saving debug image:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save debug image' },
      { status: 500 }
    );
  }
}