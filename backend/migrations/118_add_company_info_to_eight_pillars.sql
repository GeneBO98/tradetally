-- Add company information columns to eight_pillars_analysis table
-- These columns store the company name, industry, and logo from Finnhub profile

ALTER TABLE eight_pillars_analysis
ADD COLUMN IF NOT EXISTS company_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS industry VARCHAR(255),
ADD COLUMN IF NOT EXISTS logo VARCHAR(512);
