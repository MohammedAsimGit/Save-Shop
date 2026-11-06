import {
  Headphones,
  Shirt,
  Smartphone,
  Watch,
  Laptop,
  Camera,
  Footprints,
  Box,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Maps a demo-catalogue icon key to a Lucide component (never a remote image). */
export function resolveIcon(key: string): LucideIcon {
  switch (key) {
    case 'headphones':
      return Headphones;
    case 'smartphone':
      return Smartphone;
    case 'watch':
      return Watch;
    case 'laptop':
      return Laptop;
    case 'camera':
      return Camera;
    case 'footprint':
      return Footprints;
    case 'shirt':
      return Shirt;
    default:
      return Box;
  }
}
