// utils/getGuideImages.ts
import fs from 'fs';
import path from 'path';

export function getGuideImages(): string[] {
  const guidesDirectory = path.join(process.cwd(), 'public', 'guides', 'SpenLC');
  
  try {
    // Read all files in the directory
    const files = fs.readdirSync(guidesDirectory);
    
    // Filter for image files (you can add more extensions if needed)
    const imageFiles = files.filter(file => 
      /\.(jpg|jpeg|png|gif)$/i.test(file)
    );
    
    // Convert to public URLs
    return imageFiles.map(file => `/guides/SpenLC/${file}`);
  } catch (error) {
    console.error('Error reading guide images:', error);
    return [];
  }
}