-- Normalize the account lifecycle state while retaining existing account rows.
ALTER TYPE "AccountStatus" RENAME VALUE 'PENDING_VERIFICATION' TO 'PENDING';

-- SYSTEM is reserved for explicitly authorized internal principals. It is not
-- available through public registration.
ALTER TYPE "UserRole" ADD VALUE 'SYSTEM';
