-- Run this in Railway SQL Editor or via psql
-- Adds class_type_color to user_bookings_view

CREATE OR REPLACE VIEW user_bookings_view AS
SELECT 
    b.id as booking_id,
    b.user_id,
    b.status as booking_status,
    b.waitlist_position,
    b.checked_in_at,
    c.id as class_id,
    c.date,
    c.start_time,
    c.end_time,
    ct.name as class_type_name,
    ct.level,
    ct.color as class_type_color,
    i.display_name as instructor_name
FROM bookings b
JOIN classes c ON b.class_id = c.id
JOIN class_types ct ON c.class_type_id = ct.id
JOIN instructors i ON c.instructor_id = i.id
ORDER BY c.date DESC, c.start_time DESC;

-- Verify the view was updated
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_bookings_view';
