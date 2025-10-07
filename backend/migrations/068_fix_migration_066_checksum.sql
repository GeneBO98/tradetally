-- Fix migration 066 checksum after adding ticker column update
-- This migration updates the checksum to match the modified migration file

UPDATE migrations
SET checksum = 'f469fc172799c197b4915a3da6fb1eada89c154294c5f5b6965d4a84d535b225'
WHERE filename = '066_increase_symbol_length.sql';
