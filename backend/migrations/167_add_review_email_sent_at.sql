-- Migration 167: Add review_email_sent_at and testimonials system
-- Tracks whether a review request email has been sent to a Pro subscriber
-- Creates testimonials table for user-submitted reviews displayed on homepage

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS review_email_sent_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  body TEXT NOT NULL,
  display_name VARCHAR(100),
  approved BOOLEAN DEFAULT FALSE,
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- One testimonial per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_testimonials_user_id ON testimonials(user_id);
-- For fetching approved testimonials on homepage
CREATE INDEX IF NOT EXISTS idx_testimonials_approved ON testimonials(approved, created_at DESC) WHERE approved = TRUE;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_testimonials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_testimonials_updated_at ON testimonials;
CREATE TRIGGER update_testimonials_updated_at
  BEFORE UPDATE ON testimonials
  FOR EACH ROW
  EXECUTE FUNCTION update_testimonials_updated_at();
