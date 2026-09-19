import { z } from "zod";

export const surveyQuestionInputSchema = z.object({
  question: z.string().trim().min(1).max(500),
  sort_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

export const surveyAnswersInputSchema = z.object({
  answers: z.record(z.string(), z.string().trim().max(2000)),
});