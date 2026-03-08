import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface EventGalleryProps {
  eventId: number;
  images?: string[];
}

export function EventGallery({ eventId, images: propImages }: EventGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const { data: queryImages = [] } = (trpc.gallery as any).listByEvent.useQuery(
    { eventId },
    { enabled: !propImages }
  );

  const images = propImages
    ? propImages.map((url, i) => ({ id: i, imageUrl: url, caption: "" }))
    : queryImages;

  // Handle keyboard navigation
  useEffect(() => {
    if (!lightboxOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxOpen(false);
      } else if (e.key === "ArrowLeft") {
        handlePrevious();
      } else if (e.key === "ArrowRight") {
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxOpen, currentImageIndex, images.length]);

  const handlePrevious = () => {
    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNext = () => {
    setCurrentImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  const openLightbox = (index: number) => {
    setCurrentImageIndex(index);
    setLightboxOpen(true);
  };

  if (images.length === 0) {
    return null;
  }

  return (
    <>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Galeria de Fotos</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((image, index) => (
            <Card
              key={image.id}
              className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all"
              onClick={() => openLightbox(index)}
            >
              <div className="relative aspect-video bg-gradient-to-br from-gray-900 to-gray-800">
                <img
                  src={encodeURI(image.imageUrl)}
                  alt={image.caption || `Foto ${index + 1}`}
                  className="w-full h-full object-contain"
                />
              </div>
              {image.caption && (
                <div className="p-2">
                  <p className="text-sm text-muted-foreground truncate">{image.caption}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Close button */}
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
            title="Fechar (ESC)"
          >
            <X className="h-6 w-6 text-white" />
          </button>

          {/* Image counter */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/50 rounded-full text-white text-sm">
            {currentImageIndex + 1} / {images.length}
          </div>

          {/* Previous button */}
          {images.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrevious();
              }}
              className="absolute left-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
              title="Anterior (←)"
            >
              <ChevronLeft className="h-8 w-8 text-white" />
            </button>
          )}

          {/* Image */}
          <div
            className="max-w-7xl max-h-[90vh] w-full h-full flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={encodeURI(images[currentImageIndex].imageUrl)}
              alt={images[currentImageIndex].caption || `Foto ${currentImageIndex + 1}`}
              className="max-w-full max-h-full object-contain"
            />
          </div>

          {/* Next button */}
          {images.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
              title="Próxima (→)"
            >
              <ChevronRight className="h-8 w-8 text-white" />
            </button>
          )}

          {/* Caption */}
          {images[currentImageIndex].caption && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-2xl px-6 py-3 bg-black/70 rounded-lg text-white text-center">
              {images[currentImageIndex].caption}
            </div>
          )}

          {/* Help text */}
          <div className="absolute bottom-4 right-4 text-white/60 text-sm">
            Use ← → para navegar | ESC para fechar
          </div>
        </div>
      )}
    </>
  );
}
