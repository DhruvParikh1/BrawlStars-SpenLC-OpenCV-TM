import Image from "next/image";
import { BrawlerDetection } from '../components/BrawlerDetection';

export default function Home() {
  return (
    <div className="container mx-auto py-8">
      <BrawlerDetection guideImagePath="/guides/SpenLC/Dueling-Beetles-S31.png" />
    </div>
  );
}
