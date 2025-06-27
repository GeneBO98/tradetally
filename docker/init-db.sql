-- Create database if it doesn't exist
SELECT 'CREATE DATABASE trader_vue'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'trader_vue')\gexec

-- Connect to the database
\c trader_vue;

-- Create schema (copy from backend/src/utils/schema.sql)
-- This will be executed when the container starts