-- Add 'card_verified' to payment_method_type enum
ALTER TYPE payment_method_type ADD VALUE IF NOT EXISTS 'card_verified';
