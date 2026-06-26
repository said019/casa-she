import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Play, X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

interface VideoItem {
  id: string;
  title: string;
  subtitle: string;
  tagline: string;
  thumbnail: string;
  videoUrl: string;
  embedUrl: string;
  color: string;
  days: string;
}

// Fallback data in case API is not yet set up
const fallbackVideos: VideoItem[] = [
  {
    id: "barre",
    title: "Barre",
    subtitle: "elegance in motion",
    tagline: "Ballet · Pilates · Funcional",
    thumbnail: "/videos/barre-thumb.jpg",
    videoUrl: "/videos/barre.mp4",
    embedUrl: "",
    color: "#8C8475",
    days: "Lunes, Miércoles y Viernes",
  },
  {
    id: "pilates",
    title: "Pilates Mat",
    subtitle: "strength meets precision",
    tagline: "Core · Flexibilidad · Control",
    thumbnail: "/videos/pilates-thumb.jpg",
    videoUrl: "/videos/pilates.mp4",
    embedUrl: "",
    color: "#A2A88B",
    days: "Martes y Jueves",
  },
  {
    id: "yoga-sculpt",
    title: "Hot Pilates",
    subtitle: "energy unleashed",
    tagline: "Fuerza · Flexibilidad · Energía",
    thumbnail: "/videos/yoga-sculpt-thumb.jpg",
    videoUrl: "/videos/yoga-sculpt.mp4",
    embedUrl: "",
    color: "#D4A574",
    days: "Sábados",
  },
  {
    id: "sculpt",
    title: "Sculpt",
    subtitle: "energy unleashed",
    tagline: "Full Body · HIIT · Tonificación",
    thumbnail: "/videos/sculpt-thumb.jpg",
    videoUrl: "/videos/sculpt.mp4",
    embedUrl: "",
    color: "#C6A77A",
    days: "Domingos",
  },
];

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const VideoGallery = () => {
  // Fetch published videos from API
  const { data: apiVideos, isLoading } = useQuery<any[]>({
    queryKey: ['public-videos'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/videos/public`);
      if (!res.ok) throw new Error('Failed to fetch videos');
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  // Map API response to VideoItem format, fallback to static data
  const videos: VideoItem[] = (apiVideos && apiVideos.length > 0)
    ? apiVideos.map((v: any) => ({
        id: v.id,
        title: v.title,
        subtitle: v.subtitle || '',
        tagline: v.tagline || v.category_name || '',
        thumbnail: v.thumbnail_url || '',
        videoUrl: v.video_url || '',
        embedUrl: v.embed_url || '',
        color: v.brand_color || v.category_color || '#8F9A8A',
        days: v.days || '',
      }))
    : fallbackVideos;

  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePlayer();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  const openVideo = (video: VideoItem) => {
    setActiveVideo(video);
    document.body.style.overflow = "hidden";
  };

  const closePlayer = () => {
    setActiveVideo(null);
    document.body.style.overflow = "";
  };

  const navigateVideo = (direction: "prev" | "next") => {
    if (!activeVideo) return;
    const currentIndex = videos.findIndex((v) => v.id === activeVideo.id);
    const newIndex =
      direction === "next"
        ? (currentIndex + 1) % videos.length
        : (currentIndex - 1 + videos.length) % videos.length;
    setActiveVideo(videos[newIndex]);
  };

  return (
    <>
      <section id="videos" className="py-24 lg:py-32 bg-foreground relative overflow-hidden">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div
            className="w-full h-full"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 50%, hsl(100 7% 57%) 0%, transparent 50%), radial-gradient(circle at 80% 50%, hsl(36 39% 63%) 0%, transparent 50%)",
            }}
          />
        </div>

        <div className="container mx-auto px-4 lg:px-8 relative z-10">
          {/* Section Header */}
          <div className="max-w-3xl mb-16">
            <span className="text-sm font-body text-balance-olive tracking-widest uppercase mb-4 block">
              Experiencia Visual
            </span>
            <h2 className="font-heading text-4xl md:text-5xl lg:text-6xl font-light text-primary-foreground mb-6">
              Conoce nuestras
              <br />
              <span className="font-semibold italic text-balance-olive">clases en acción</span>
            </h2>
            <p className="font-body text-lg text-primary-foreground/60">
              Descubre la energía, la técnica y el ambiente de cada disciplina a
              través de nuestros videos.
            </p>
          </div>

          {/* Video Grid */}
          <div className={`grid gap-6 ${
            videos.length === 1 ? 'md:grid-cols-1 max-w-md' :
            videos.length === 2 ? 'md:grid-cols-2 max-w-2xl' :
            videos.length === 3 ? 'md:grid-cols-3 max-w-4xl' :
            'md:grid-cols-2 lg:grid-cols-4'
          }`}>
            {isLoading ? (
              <div className="col-span-full flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary-foreground/40" />
              </div>
            ) : (
            videos.map((video) => (
              <div
                key={video.id}
                className="group relative cursor-pointer"
                onMouseEnter={() => setHoveredId(video.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => openVideo(video)}
              >
                {/* Thumbnail Container */}
                <div className="relative aspect-[3/4] rounded-sm overflow-hidden">
                  {/* Thumbnail / Placeholder */}
                  <div
                    className="absolute inset-0 transition-transform duration-700 group-hover:scale-105"
                    style={{
                      background: `linear-gradient(135deg, ${video.color}40 0%, ${video.color}80 100%)`,
                    }}
                  >
                    {/* Real thumbnail image if available */}
                    {video.thumbnail && (
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    {/* Brand pattern overlay (shown when no thumbnail or as overlay) */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span
                        className="font-heading text-[8rem] md:text-[6rem] lg:text-[5rem] font-bold leading-none text-white/10 select-none text-center"
                        style={{ letterSpacing: "-0.05em" }}
                      >
                        {video.title.split(" ").map((word, i) => (
                          <span key={i} className="block">
                            {word.toUpperCase()}
                          </span>
                        ))}
                      </span>
                    </div>
                  </div>

                  {/* Dark overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                  {/* Play button */}
                  <div
                    className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${
                      hoveredId === video.id ? "opacity-100 scale-100" : "opacity-0 scale-90"
                    }`}
                  >
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/30"
                      style={{ backgroundColor: `${video.color}CC` }}
                    >
                      <Play className="w-7 h-7 text-white ml-1" fill="white" />
                    </div>
                  </div>

                  {/* Content overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-5">
                    <span
                      className="text-xs font-body uppercase tracking-widest mb-1 block"
                      style={{ color: video.color }}
                    >
                      {video.days}
                    </span>
                    <h3 className="font-heading text-2xl font-semibold text-white mb-1">
                      {video.title}
                    </h3>
                    <p className="font-heading text-sm italic text-white/70">
                      {video.subtitle}
                    </p>
                    <p className="font-body text-xs text-white/50 mt-2">
                      {video.tagline}
                    </p>
                  </div>
                </div>

                {/* Bottom accent line */}
                <div
                  className="h-0.5 mt-0 transition-all duration-500 rounded-b-sm"
                  style={{
                    backgroundColor: video.color,
                    width: hoveredId === video.id ? "100%" : "0%",
                  }}
                />
              </div>
            ))
            )}
          </div>
        </div>
      </section>

      {/* ====================================== */}
      {/* Fullscreen Video Player Modal (iframe) */}
      {/* ====================================== */}
      {activeVideo && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-300"
          onClick={(e) => { if (e.target === e.currentTarget) closePlayer(); }}
        >
          {/* Backdrop with blur */}
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" />

          {/* Close button */}
          <button
            onClick={closePlayer}
            className="absolute top-[calc(env(safe-area-inset-top)+1rem)] right-4 md:top-6 md:right-6 z-50 w-10 h-10 md:w-11 md:h-11 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center hover:bg-white/20 hover:border-white/20 transition-all duration-200 group"
          >
            <X className="w-5 h-5 text-white/80 group-hover:text-white transition-colors" />
          </button>

          {/* Navigation arrows */}
          {videos.length > 1 && (
            <>
              <button
                onClick={() => navigateVideo("prev")}
                className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 z-50 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center hover:bg-white/15 hover:border-white/20 transition-all duration-200 group"
              >
                <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-white/70 group-hover:text-white transition-colors" />
              </button>
              <button
                onClick={() => navigateVideo("next")}
                className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 z-50 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center hover:bg-white/15 hover:border-white/20 transition-all duration-200 group"
              >
                <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-white/70 group-hover:text-white transition-colors" />
              </button>
            </>
          )}

          {/* Video container */}
          <div className="relative w-full max-w-5xl mx-4 md:mx-8 animate-in zoom-in-95 slide-in-from-bottom-4 duration-400 z-10">
            {/* Video title bar - glassmorphism */}
            <div className="flex items-center gap-3 md:gap-4 mb-3 md:mb-4 px-1">
              <div
                className="w-1 h-8 md:h-10 rounded-full shrink-0"
                style={{ backgroundColor: activeVideo.color }}
              />
              <div className="min-w-0">
                <h3 className="font-heading text-lg md:text-2xl lg:text-3xl font-semibold text-white truncate">
                  {activeVideo.title}
                </h3>
                <p className="font-heading text-xs md:text-sm italic text-white/50 truncate">
                  {activeVideo.subtitle}{activeVideo.days ? ` · ${activeVideo.days}` : ''}
                </p>
              </div>
              {activeVideo.tagline && (
                <span
                  className="hidden md:inline-flex ml-auto px-3 py-1 rounded-full text-xs font-body shrink-0 border"
                  style={{
                    backgroundColor: `${activeVideo.color}15`,
                    color: activeVideo.color,
                    borderColor: `${activeVideo.color}30`,
                  }}
                >
                  {activeVideo.tagline}
                </span>
              )}
            </div>

            {/* Video iframe container with rounded corners & shadow */}
            <div
              className="relative rounded-xl md:rounded-2xl overflow-hidden bg-black aspect-video shadow-2xl ring-1 ring-white/10"
            >
              {/* Decorative gradient border glow */}
              <div
                className="absolute -inset-px rounded-xl md:rounded-2xl opacity-30 pointer-events-none"
                style={{
                  background: `linear-gradient(135deg, ${activeVideo.color}40 0%, transparent 40%, transparent 60%, ${activeVideo.color}20 100%)`,
                }}
              />

              {activeVideo.embedUrl ? (
                <iframe
                  key={activeVideo.id}
                  src={activeVideo.embedUrl}
                  className="w-full h-full relative z-[1]"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  frameBorder="0"
                />
              ) : activeVideo.videoUrl ? (
                <video
                  src={activeVideo.videoUrl}
                  className="w-full h-full object-cover relative z-[1]"
                  controls
                  autoPlay
                  playsInline
                  poster={activeVideo.thumbnail}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 relative z-[1]">
                  <Play className="w-12 h-12 text-white/20" />
                  <p className="text-white/30 font-body text-sm">Video no disponible</p>
                </div>
              )}
            </div>

            {/* Mobile tagline */}
            {activeVideo.tagline && (
              <div className="mt-3 flex justify-center md:hidden">
                <span
                  className="px-4 py-1.5 rounded-full text-xs font-body border"
                  style={{
                    backgroundColor: `${activeVideo.color}15`,
                    color: activeVideo.color,
                    borderColor: `${activeVideo.color}30`,
                  }}
                >
                  {activeVideo.tagline}
                </span>
              </div>
            )}

            {/* Video counter indicator */}
            {videos.length > 1 && (
              <div className="mt-4 flex justify-center gap-1.5">
                {videos.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setActiveVideo(v)}
                    className={`h-1 rounded-full transition-all duration-300 ${
                      v.id === activeVideo.id
                        ? 'w-6'
                        : 'w-1.5 bg-white/20 hover:bg-white/40'
                    }`}
                    style={v.id === activeVideo.id ? { backgroundColor: activeVideo.color } : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default VideoGallery;
