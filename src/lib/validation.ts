import { z } from "zod";

// Postgres's uuid type (and our seed data) doesn't enforce RFC 4122
// version/variant bits — z.uuid() does, so match the looser 8-4-4-4-12 hex
// shape instead.
export const uuidLike = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid UUID");
