// ============================================
// Review Types
// ============================================

export type ReviewStatus = 'pending' | 'published' | 'hidden' | 'flagged' | 'removed';

export type ResponseType = 'thank_you' | 'apology' | 'explanation' | 'offer' | 'follow_up';

export interface ReviewTag {
  id: string;
  name: string;
  name_en?: string;
  category: 'positive' | 'neutral' | 'negative';
  icon?: string;
}

export interface Review {
  id: string;
  booking_id: string;
  user_id: string;
  class_id: string;
  instructor_id: string;
  overall_rating: number;
  instructor_rating?: number;
  difficulty_rating?: number;
  ambiance_rating?: number;
  comment?: string;
  status: ReviewStatus;
  is_anonymous: boolean;
  is_featured: boolean;
  points_earned: number;
  created_at: string;
  updated_at: string;
}

export interface ReviewWithDetails extends Review {
  user_name: string;
  user_photo?: string;
  class_date: string;
  class_type: string;
  class_color?: string;
  instructor_name: string;
  instructor_photo?: string;
  tags: ReviewTag[];
  studio_response?: ReviewResponse;
}

export interface ReviewResponse {
  id: string;
  review_id: string;
  responded_by: string;
  response_type: ResponseType;
  response_text: string;
  is_public: boolean;
  is_resolved: boolean;
  compensation_offered?: string;
  compensation_value?: number;
  created_at: string;
}

export interface PendingReviewClass {
  booking_id: string;
  class_id: string;
  class_date: string;
  class_time: string;
  class_type: string;
  instructor_name: string;
  instructor_photo?: string;
  request_sent_at?: string;
}

export interface MyReview {
  id: string;
  overall_rating: number;
  instructor_rating?: number;
  comment?: string;
  status: ReviewStatus;
  is_anonymous: boolean;
  points_earned: number;
  created_at: string;
  class_date: string;
  class_type: string;
  instructor_name: string;
  has_response: boolean;
}

export interface CreateReviewRequest {
  bookingId: string;
  overallRating: number;
  instructorRating?: number;
  difficultyRating?: number;
  ambianceRating?: number;
  comment?: string;
  tagIds?: string[];
  isAnonymous?: boolean;
}

export interface UpdateReviewRequest {
  overallRating?: number;
  instructorRating?: number;
  difficultyRating?: number;
  ambianceRating?: number;
  comment?: string;
  tagIds?: string[];
  isAnonymous?: boolean;
}

export interface InstructorReviewSummary {
  totalReviews: number;
  avgOverallRating: number;
  avgInstructorRating: number;
  distribution: {
    fiveStar: number;
    fourStar: number;
    threeStar: number;
    lowRating: number;
  };
}

export interface ReviewStats {
  period: {
    start: string;
    end: string;
  };
  general: {
    totalReviews: number;
    avgRating: number;
    responseRate: number;
    conversionRate: number;
  };
  byInstructor: {
    instructorId: string;
    instructorName: string;
    reviewCount: number;
    avgRating: number;
  }[];
  topTags: {
    name: string;
    icon: string;
    category: string;
    count: number;
  }[];
}

export interface PublicReview {
  id: string;
  overall_rating: number;
  instructor_rating?: number;
  comment?: string;
  is_featured: boolean;
  created_at: string;
  user_name: string;
  user_photo?: string;
  class_type: string;
  instructor_name: string;
  tags: { name: string; icon: string }[];
}
