import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, ChevronRight } from 'lucide-react';
import { ReviewDialog } from './ReviewDialog';
import api from '@/lib/api';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface PendingReview {
    booking_id: string;
    class_id: string;
    class_date: string;
    class_time: string;
    class_type: string;
    instructor_name: string;
    instructor_photo: string | null;
}

export function PendingReviewsList() {
    const [selectedBooking, setSelectedBooking] = useState<PendingReview | null>(null);
    const queryClient = useQueryClient();

    const { data: pendingReviews, isLoading } = useQuery({
        queryKey: ['pending-reviews'],
        queryFn: async () => {
            try {
                const res = await api.get('/reviews/pending');
                return res.data.pending as PendingReview[];
            } catch (err) {
                console.error("Failed to fetch pending reviews", err);
                return [];
            }
        },
        // Don't retry too much as this is optional/secondary UI
        retry: 1
    });

    const handleSuccess = () => {
        queryClient.invalidateQueries({ queryKey: ['pending-reviews'] });
        setSelectedBooking(null);
    };

    if (isLoading || !pendingReviews || pendingReviews.length === 0) {
        return null;
    }

    return (
        <>
            <div className="mb-6 space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                    Clases por calificar
                </h3>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {pendingReviews.map((review) => (
                        <Card key={review.booking_id} className="overflow-hidden border-l-4 border-l-primary hover:bg-muted/50 transition-colors">
                            <CardContent className="p-4 flex items-center justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-medium truncate">{review.class_type}</h4>
                                    <p className="text-sm text-muted-foreground truncate">{review.instructor_name}</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {format(new Date(review.class_date), "EEEE d 'de' MMMM", { locale: es })} • {review.class_time.substring(0, 5)}
                                    </p>
                                </div>
                                <Button size="default" onClick={() => setSelectedBooking(review)}>
                                    Calificar
                                    <ChevronRight className="ml-1 h-3 w-3" />
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {selectedBooking && (
                <ReviewDialog
                    isOpen={!!selectedBooking}
                    onClose={() => setSelectedBooking(null)}
                    bookingId={selectedBooking.booking_id}
                    className={selectedBooking.class_type}
                    instructorName={selectedBooking.instructor_name}
                    onSuccess={handleSuccess}
                />
            )}
        </>
    );
}
