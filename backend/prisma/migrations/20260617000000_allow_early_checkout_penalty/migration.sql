-- Allow CHECK_OUT to be punched before the standard checkout time.
-- Existing checkout rules will deduct 5 THB/minute for early checkout unless a non-zero rate is already configured.
UPDATE "attendance_session_rules"
SET
    "openTime" = '00:00',
    "earlyBeforeTime" = COALESCE(NULLIF("earlyBeforeTime", ''), COALESCE(NULLIF("expectedTime", ''), '17:00')),
    "lateOutAfterTime" = COALESCE(NULLIF("lateOutAfterTime", ''), COALESCE(NULLIF("expectedTime", ''), '17:00')),
    "earlyLeavePenaltyPerMinute" = CASE
        WHEN "earlyLeavePenaltyPerMinute" IS NULL OR "earlyLeavePenaltyPerMinute" = 0 THEN 5
        ELSE "earlyLeavePenaltyPerMinute"
    END,
    "allowEarlyPunch" = true,
    "collectLateOutMinutes" = true,
    "updatedAt" = NOW()
WHERE "sessionCode" = 'CHECK_OUT'
  AND "deletedAt" IS NULL;
