import { BadRequestException } from '@nestjs/common';

import { EvaluationQuestionType } from '../../generated/prisma/client';

export type EvaluationScoreItemInput = {
  questionId: string;
  score?: number;
  textValue?: string;
  note?: string;
};

type ScorableQuestion = {
  id: string;
  title: string;
  type: EvaluationQuestionType;
  maxScore: unknown;
  weight: unknown;
};

export type EvaluationScoreSummary = ReturnType<
  typeof calculateEvaluationScore
>;

/**
 * คิดคะแนนถ่วงน้ำหนักจากหัวข้อประเมิน
 * แยกเป็นฟังก์ชันบริสุทธิ์เพื่อให้ทั้งโมดูล performance และ onboarding
 * (ตอนรีวิวทดลองงาน) ใช้เกณฑ์เดียวกันเป๊ะ
 */
export function calculateEvaluationScore(
  questions: ScorableQuestion[],
  scoreItems: EvaluationScoreItemInput[],
) {
  if (questions.length === 0) {
    throw new BadRequestException('แบบประเมินนี้ยังไม่มีหัวข้อประเมิน');
  }

  const questionMap = new Map(questions.map((item) => [item.id, item]));

  let totalScore = 0;
  let maxScore = 0;

  const items = scoreItems.map((item) => {
    const question = questionMap.get(item.questionId);

    if (!question) {
      throw new BadRequestException(
        `ไม่พบหัวข้อประเมิน questionId: ${item.questionId}`,
      );
    }

    const weight = Number(question.weight);
    const questionMaxScore = Number(question.maxScore);

    maxScore += questionMaxScore * weight;

    let score = 0;

    if (question.type === EvaluationQuestionType.SCORE) {
      score = Number(item.score ?? 0);

      if (score > questionMaxScore) {
        throw new BadRequestException(
          `คะแนนของหัวข้อ "${question.title}" ห้ามเกิน ${questionMaxScore}`,
        );
      }

      totalScore += score * weight;
    }

    return {
      questionId: question.id,
      title: question.title,
      type: question.type,
      maxScore: questionMaxScore,
      weight,
      score,
      textValue: item.textValue ?? null,
      note: item.note ?? null,
    };
  });

  const percent = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

  return {
    items,
    totalScore: Number(totalScore.toFixed(2)),
    maxScore: Number(maxScore.toFixed(2)),
    percent: Number(percent.toFixed(2)),
  };
}
