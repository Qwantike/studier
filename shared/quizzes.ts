import { z } from 'zod'
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export const DIFFICULTY_LABELS = {
  easy: 'Facile',
  medium: 'Intermédiaire',
  hard: 'Difficile',
}
export type Difficulty = (typeof DIFFICULTIES)[number]
const text = (max: number) => z.string().trim().min(1).max(max)
const question = z
  .object({
    prompt: text(1000),
    options: z.array(text(500)).length(4),
    correct_index: z.number().int().min(0).max(3),
    explanation: text(2000),
  })
  .strict()
const normalize = (s: string) =>
  s.toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim()
export const generatedQuizSchema = z
  .object({ questions: z.array(question).length(5) })
  .strict()
  .superRefine((quiz, ctx) => {
    if (new Set(quiz.questions.map((q) => normalize(q.prompt))).size !== 5)
      ctx.addIssue({ code: 'custom', message: 'Questions répétées' })
    for (const q of quiz.questions)
      if (new Set(q.options.map(normalize)).size !== 4)
        ctx.addIssue({ code: 'custom', message: 'Choix répétés' })
  })
export type GeneratedQuiz = z.infer<typeof generatedQuizSchema>
export interface QuizQuestion {
  id: string
  position: number
  prompt: string
  options: string[]
}
export interface QuizSummary {
  id: string
  chapter_id: string
  chapter_title: string
  difficulty: Difficulty
  status: 'generating' | 'ready' | 'failed'
  created_at: string
}
export interface QuizDetail extends QuizSummary {
  questions: QuizQuestion[]
  attempts: { id: string; score: number; total: number; created_at: string }[]
}
export interface QuizCorrection {
  id: string
  score: number
  total: number
  created_at: string
  questions: (QuizQuestion & {
    correct_index: number
    explanation: string
    selected_index: number
  })[]
}
export interface QuizConfig {
  enabled: boolean
  daily_limit: number
  remaining_today: number
  provider: 'OpenAI'
  max_source_chars: number
}
export interface GenerateRequest {
  id: string
  difficulty: Difficulty
  example: string
  consent: true
}
