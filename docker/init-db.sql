-- Create database if it doesn't exist
SELECT 'CREATE DATABASE tradetally'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tradetally')\gexec

-- Connect to the database
\c tradetally;

-- Create schema (copy from backend/src/utils/schema.sql)
-- This will be executed when the container starts