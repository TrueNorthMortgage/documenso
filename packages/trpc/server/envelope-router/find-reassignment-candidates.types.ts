import { z } from 'zod';

export const ZFindReassignmentCandidatesRequestSchema = z.object({
  teamId: z.number().int().positive(),
  search: z.string().trim().max(200).default(''),
  excludeUserId: z.number().int().positive().optional(),
});
export const ZFindReassignmentCandidatesResponseSchema = z.array(
  z.object({ id: z.number(), name: z.string().nullable(), email: z.string() }),
);
