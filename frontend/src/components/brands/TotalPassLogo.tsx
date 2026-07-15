import { cn } from '@/lib/utils';

interface TotalPassLogoProps {
  className?: string;
  imageClassName?: string;
}

export function TotalPassLogo({ className, imageClassName }: TotalPassLogoProps) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full bg-[#171c1a] px-2.5 py-1', className)}
      title="TotalPass"
    >
      <img
        src="/brands/totalpass-logo.png"
        alt="TotalPass"
        className={cn('h-3 w-auto object-contain', imageClassName)}
      />
    </span>
  );
}
