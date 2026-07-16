import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Point = { x: number; y: number };
type ImageSize = { width: number; height: number };

interface AvatarCropDialogProps {
  file: File | null;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const OUTPUT_SIZE = 1024;

function getRenderMetrics(viewportSize: number, imageSize: ImageSize, zoom: number) {
  const baseScale = Math.max(viewportSize / imageSize.width, viewportSize / imageSize.height);
  const scale = baseScale * zoom;
  return {
    scale,
    renderedWidth: imageSize.width * scale,
    renderedHeight: imageSize.height * scale,
  };
}

function clampOffset(point: Point, viewportSize: number, imageSize: ImageSize | null, zoom: number): Point {
  if (!viewportSize || !imageSize) return { x: 0, y: 0 };
  const { renderedWidth, renderedHeight } = getRenderMetrics(viewportSize, imageSize, zoom);
  const maxX = Math.max(0, (renderedWidth - viewportSize) / 2);
  const maxY = Math.max(0, (renderedHeight - viewportSize) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, point.x)),
    y: Math.min(maxY, Math.max(-maxY, point.y)),
  };
}

function canvasToFile(canvas: HTMLCanvasElement, sourceName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('No se pudo preparar la imagen.'));
          return;
        }
        const baseName = sourceName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '-') || 'perfil';
        resolve(new File([blob], `${baseName}-perfil.jpg`, { type: 'image/jpeg', lastModified: Date.now() }));
      },
      'image/jpeg',
      0.9,
    );
  });
}

export function AvatarCropDialog({ file, onCancel, onConfirm }: AvatarCropDialogProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ pointerId: number; start: Point; origin: Point } | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [viewportSize, setViewportSize] = useState(0);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [isImageReady, setIsImageReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setImageSize(null);
    setIsImageReady(false);
    setOffset({ x: 0, y: 0 });
    setZoom(MIN_ZOOM);
    setError(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!file || !viewportRef.current) return;
    const viewport = viewportRef.current;
    const updateSize = () => setViewportSize(viewport.getBoundingClientRect().width);
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [file]);

  useEffect(() => {
    setOffset((current) => clampOffset(current, viewportSize, imageSize, zoom));
  }, [imageSize, viewportSize, zoom]);

  const metrics = useMemo(() => {
    if (!imageSize || !viewportSize) return null;
    return getRenderMetrics(viewportSize, imageSize, zoom);
  }, [imageSize, viewportSize, zoom]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!imageSize) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: offset,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset(clampOffset({
      x: drag.origin.x + event.clientX - drag.start.x,
      y: drag.origin.y + event.clientY - drag.start.y,
    }, viewportSize, imageSize, zoom));
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleZoomChange = (nextZoom: number) => {
    const ratio = zoom > 0 ? nextZoom / zoom : 1;
    setOffset((current) => clampOffset(
      { x: current.x * ratio, y: current.y * ratio },
      viewportSize,
      imageSize,
      nextZoom,
    ));
    setZoom(nextZoom);
  };

  const handleConfirm = async () => {
    if (!file || !imageRef.current || !isImageReady || !imageSize || !viewportSize || !metrics) return;
    setIsProcessing(true);
    setError(null);
    try {
      const sourceSize = viewportSize / metrics.scale;
      const imageLeft = viewportSize / 2 + offset.x - metrics.renderedWidth / 2;
      const imageTop = viewportSize / 2 + offset.y - metrics.renderedHeight / 2;
      const sourceX = Math.min(imageSize.width - sourceSize, Math.max(0, -imageLeft / metrics.scale));
      const sourceY = Math.min(imageSize.height - sourceSize, Math.max(0, -imageTop / metrics.scale));

      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No se pudo preparar la imagen.');
      context.fillStyle = '#F6F0E4';
      context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        imageRef.current,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE,
      );
      onConfirm(await canvasToFile(canvas, file.name));
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : 'No se pudo preparar la imagen.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => !open && !isProcessing && onCancel()}>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-md overflow-y-auto rounded-[1.75rem] border-balance-sand/70 bg-balance-cream p-5 shadow-[0_28px_75px_-42px_rgba(22,38,26,0.72)] sm:p-6">
        <DialogHeader className="pr-7 text-left">
          <DialogTitle className="font-heading text-2xl font-semibold text-balance-dark">Encuadra tu foto</DialogTitle>
          <DialogDescription className="leading-relaxed text-balance-dark/60">
            Arrastra la imagen y ajusta el zoom hasta que quede bien dentro del círculo.
          </DialogDescription>
        </DialogHeader>

        <div className="mx-auto w-full max-w-[19rem] py-2">
          <div
            ref={viewportRef}
            role="application"
            aria-label="Área para encuadrar la foto de perfil"
            className="relative aspect-square w-full cursor-grab touch-none select-none overflow-hidden rounded-full bg-[#D8D0BF] ring-4 ring-balance-cream shadow-[0_0_0_1px_rgba(42,78,54,0.24),0_20px_45px_-30px_rgba(22,38,26,0.8)] active:cursor-grabbing"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >
            {imageUrl && metrics && (
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Vista previa para recortar"
                draggable={false}
                className="pointer-events-none absolute max-w-none"
                onLoad={() => setIsImageReady(true)}
                onError={() => setError('No pudimos abrir esta imagen. Prueba con JPG, PNG o WebP.')}
                style={{
                  width: metrics.renderedWidth,
                  height: metrics.renderedHeight,
                  left: `calc(50% + ${offset.x}px)`,
                  top: `calc(50% + ${offset.y}px)`,
                  transform: 'translate3d(-50%, -50%, 0)',
                }}
              />
            )}
            {imageUrl && !imageSize && (
              <img
                src={imageUrl}
                alt=""
                className="absolute h-full w-full object-cover opacity-0"
                onLoad={(event) => setImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })}
                onError={() => setError('No pudimos abrir esta imagen. Prueba con JPG, PNG o WebP.')}
              />
            )}
            <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/35" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-balance-dark/55">
            <label htmlFor="avatar-crop-zoom">Zoom</label>
            <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
          </div>
          <input
            id="avatar-crop-zoom"
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(event) => handleZoomChange(Number(event.target.value))}
            className="h-2 w-full cursor-pointer accent-balance-olive"
            aria-label="Zoom de la foto"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:space-x-0">
          <Button type="button" variant="outline" className="rounded-full" onClick={onCancel} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="rounded-full bg-balance-olive text-balance-cream active:scale-[0.98]"
            onClick={handleConfirm}
            disabled={!imageSize || !isImageReady || isProcessing}
          >
            {isProcessing ? 'Preparando…' : 'Usar esta foto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
