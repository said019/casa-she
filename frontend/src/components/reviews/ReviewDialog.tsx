import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star, Loader2, Sparkles } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ReviewDialogProps {
    isOpen: boolean;
    onClose: () => void;
    bookingId: string;
    className: string;
    instructorName: string;
    onSuccess?: () => void;
}

export function ReviewDialog({ isOpen, onClose, bookingId, className, instructorName, onSuccess }: ReviewDialogProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [rating, setRating] = useState(0);
    const [hoveredRating, setHoveredRating] = useState(0);
    const [comment, setComment] = useState('');
    const [showComment, setShowComment] = useState(false);

    const ratingLabels: Record<number, string> = {
        1: '😔 No me gustó',
        2: '😐 Regular',
        3: '🙂 Bien',
        4: '😊 Muy bien',
        5: '🤩 ¡Increíble!'
    };

    const onSubmit = async () => {
        if (rating === 0) return;
        
        setIsSubmitting(true);
        try {
            await api.post('/reviews', {
                bookingId,
                overallRating: rating,
                comment: comment.trim() || undefined,
            });
            toast.success('¡Gracias por tu calificación! ⭐');
            setRating(0);
            setComment('');
            setShowComment(false);
            onSuccess?.();
            onClose();
        } catch (error) {
            console.error('Error submitting review:', error);
            toast.error('Error al enviar');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setRating(0);
        setComment('');
        setShowComment(false);
        onClose();
    };

    const displayRating = hoveredRating || rating;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader className="text-center pb-2">
                    <DialogTitle className="text-xl flex items-center justify-center gap-2">
                        <Sparkles className="w-5 h-5 text-warning" />
                        ¿Cómo estuvo?
                    </DialogTitle>
                    <DialogDescription className="text-center">
                        {className} con {instructorName}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-4">
                    {/* Estrellas grandes y bonitas */}
                    <div className="flex justify-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                type="button"
                                className="transition-all duration-150 hover:scale-125 active:scale-95 focus:outline-none"
                                onClick={() => setRating(star)}
                                onMouseEnter={() => setHoveredRating(star)}
                                onMouseLeave={() => setHoveredRating(0)}
                            >
                                <Star
                                    className={cn(
                                        "h-10 w-10 transition-colors",
                                        star <= displayRating 
                                            ? 'fill-amber-400 text-amber-400' 
                                            : 'text-muted-foreground/20 dark:text-muted-foreground/30'
                                    )}
                                    strokeWidth={star <= displayRating ? 0 : 1.5}
                                />
                            </button>
                        ))}
                    </div>

                    {/* Label de la calificación */}
                    <div className="text-center h-6">
                        {displayRating > 0 && (
                            <span className="text-lg font-medium animate-in fade-in duration-200">
                                {ratingLabels[displayRating]}
                            </span>
                        )}
                    </div>

                    {/* Botón para agregar comentario (opcional) */}
                    {rating > 0 && !showComment && (
                        <div className="text-center">
                            <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm"
                                onClick={() => setShowComment(true)}
                                className="text-muted-foreground"
                            >
                                + Agregar comentario (opcional)
                            </Button>
                        </div>
                    )}

                    {/* Comentario opcional */}
                    {showComment && (
                        <Textarea
                            placeholder="Cuéntanos más... (opcional)"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="min-h-[80px] resize-none"
                            maxLength={500}
                        />
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button 
                        type="button" 
                        variant="ghost" 
                        onClick={handleClose} 
                        disabled={isSubmitting}
                    >
                        Ahora no
                    </Button>
                    <Button 
                        onClick={onSubmit} 
                        disabled={isSubmitting || rating === 0}
                        className="min-w-[100px]"
                    >
                        {isSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            'Enviar'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
