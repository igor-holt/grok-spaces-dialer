/** Shared copy so the page and the API cannot drift apart. */

export const TOKEN_SECRET_NAME = "X_BEARER_TOKEN";

export const VALUE_PROP =
  "Find a public X Space by topic, hear a short list, and open it on X.";

export const DISCLAIMER =
  "Discovery only. This does not join, stream, or bridge Space audio.";

export const CACHE_TTL_SECONDS = 60;

export const PUBLIC_MAX_RESULTS = 5;

export const RATE_LIMIT_PER_MINUTE = 30;

export const SPACE_FIELDS = [
  "title",
  "host_ids",
  "creator_id",
  "speaker_ids",
  "participant_count",
  "state",
  "scheduled_start",
  "started_at",
  "lang",
].join(",");
