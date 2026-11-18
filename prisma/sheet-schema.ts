import { z } from "zod";

export const sheetSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1),
  source: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80).default("DSA"),
  estimatedMinutes: z.number().int().positive().max(100_000).optional(),
  topics: z.array(z.object({
    name: z.string().trim().min(1).max(160),
    problems: z.array(z.object({
      title: z.string().trim().min(1).max(240),
      difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
      platform: z.enum(["LEETCODE", "GFG", "CODE360", "CODINGNINJAS", "HACKERRANK", "CODECHEF", "INTERVIEWBIT", "CODEFORCES", "OTHER"]),
      url: z.string().url().refine((value) => new URL(value).protocol === "https:", "URL must use HTTPS"),
      summary: z.string().trim().max(1000).optional(),
      subtopic: z.string().trim().max(160).optional(),
      patterns: z.array(z.string().trim().min(1).max(180)).max(10).default([]),
      placementPriority: z.number().int().min(1).max(5).optional(),
      estimatedMinutes: z.number().int().positive().max(600).optional(),
      attribution: z.string().trim().min(1).max(500).optional(),
    }).strict()).min(1),
  }).strict()).min(1),
}).strict();

export type SheetData = z.infer<typeof sheetSchema>;
