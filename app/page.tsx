/* eslint-disable @typescript-eslint/no-unused-vars */
import { getGuideImages } from '../utils/getGuideImages';
import { BrawlerDetection } from '../components/BrawlerDetection';

export default function Home() {
  const guideImages = getGuideImages();

  return (
    <div className="container mx-auto py-8">
      {guideImages.length > 0 ? (
        <BrawlerDetection guideImagePaths={guideImages} />
      ) : (
        <div className="text-red-500">
          No guide images found in /public/guides/SpenLC/ directory
        </div>
      )}
    </div>
  );
}