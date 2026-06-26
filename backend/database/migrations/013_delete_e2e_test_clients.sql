-- ============================================
-- MIGRATION 013: Delete E2E Test Clients
-- Remove test users created during E2E test runs
-- ============================================

-- Delete registrations, bookings, and other dependent data first (CASCADE should handle it)
-- Then delete the test users themselves

DELETE FROM users
WHERE email LIKE 'test-%@mailinator.com'
   OR (display_name = 'Test Cliente' AND email LIKE '%mailinator.com');

-- ============================================
-- END OF MIGRATION 013
-- ============================================
