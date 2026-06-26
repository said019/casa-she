import { Star, Wrench, Leaf, Flame, Home, Sparkles } from 'lucide-react';
import type { EventTypeInfo } from './types';

const iconMap = {
  star: Star,
  wrench: Wrench,
  leaf: Leaf,
  flame: Flame,
  home: Home,
  sparkles: Sparkles,
} as const;

/** Renders the Lucide icon for an event type at the given size */
export function EventTypeIcon({
  typeInfo,
  className = 'h-5 w-5',
}: {
  typeInfo: EventTypeInfo;
  className?: string;
}) {
  const Icon = iconMap[typeInfo.iconName];
  return <Icon className={className} style={{ color: typeInfo.color }} />;
}
