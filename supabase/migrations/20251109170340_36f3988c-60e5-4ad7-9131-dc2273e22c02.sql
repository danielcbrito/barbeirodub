-- Update admin user role
UPDATE public.user_roles 
SET role = 'admin' 
WHERE user_id = 'a46b3160-c1ca-478c-8a8b-68f50a82d27d' AND role = 'cliente';

-- Also update profile name if needed
UPDATE public.profiles 
SET nome = 'Admin DUB' 
WHERE id = 'a46b3160-c1ca-478c-8a8b-68f50a82d27d';