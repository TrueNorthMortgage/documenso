-- This self-hosted deployment supports up to twenty items in every envelope.
UPDATE "SubscriptionClaim" SET "envelopeItemCount" = 20;

-- Apply the same limit to every existing organisation claim.
UPDATE "OrganisationClaim" SET "envelopeItemCount" = 20;
