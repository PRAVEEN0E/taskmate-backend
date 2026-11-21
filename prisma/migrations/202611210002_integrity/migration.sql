-- Prisma does not express CHECK constraints; retain these in future migrations.
ALTER TABLE "User" ADD CONSTRAINT "User_ownerSlot_singleton" CHECK ("ownerSlot" = 1);
ALTER TABLE "ExpenseTransaction" ADD CONSTRAINT "ExpenseTransaction_positive_amount" CHECK ("amount" > 0);
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_positive_duration" CHECK ("durationSeconds" >= 0);
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_nonnegative_bytes" CHECK ("bytes" >= 0);
