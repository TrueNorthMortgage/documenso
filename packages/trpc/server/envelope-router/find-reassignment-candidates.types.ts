import { z } from 'zod';

export const ZFindReassignmentCandidatesRequestSchema = z.object({ teamId: z.number().int().positive() });
export const ZFindReassignmentCandidatesResponseSchema = z.array(
  z.object({ id: z.number(), name: z.string().nullable(), email: z.string() }),
);
