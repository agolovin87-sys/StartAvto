/** Экзаменационные билеты ПДД (формат pdd-android-app-resources). */
export type PddTicketCategory = "A_B" | "C_D";

export interface PddAnswer {
  answer_text: string;
  is_correct: boolean;
}

export interface PddQuestion {
  title: string;
  ticket_number: string;
  ticket_category: string;
  image: string;
  question: string;
  answers: PddAnswer[];
  correct_answer: string;
  answer_tip: string;
  topic: string[];
  id: string;
}
