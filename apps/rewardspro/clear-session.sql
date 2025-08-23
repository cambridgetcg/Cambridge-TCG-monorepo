-- Run this SQL in your database to clear the session
-- This will force the app to re-authenticate and get fresh shop data

-- First, check what sessions exist
SELECT id, shop, state FROM "Session";

-- Then delete the session for your shop (replace 'your-shop.myshopify.com' with your actual shop domain)
-- DELETE FROM "Session" WHERE shop = 'your-shop.myshopify.com';

-- Or clear all sessions (use with caution)
-- DELETE FROM "Session";