import { ApiError } from "@/lib/http-errors";
import { ensureBookingSchema, getBookingPool } from "./db";
import { getBookingRow } from "./repository/bookings";

export interface SurveyQuestion {
  id: number;
  question: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SurveyResponse {
  id: number;
  booking_id: number;
  ride_id: number;
  user_id: number;
  booking_reference: string;
  answers: Record<string, string>;
  submitted_at: string;
}

interface SurveyQuestionRow {
  id: number;
  question: string;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

function questionDto(row: SurveyQuestionRow): SurveyQuestion {
  return {
    id: row.id,
    question: row.question,
    is_active: row.is_active,
    sort_order: row.sort_order,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function listSurveyQuestions(includeInactive = false): Promise<SurveyQuestion[]> {
  await ensureBookingSchema();
  const { rows } = await getBookingPool().query(
    `SELECT id, question, is_active, sort_order, created_at, updated_at
       FROM survey_questions
      ${includeInactive ? "" : "WHERE is_active = true"}
      ORDER BY sort_order ASC, id ASC`,
  );
  return rows.map(questionDto);
}

export async function createSurveyQuestion(question: string, sortOrder: number, isActive: boolean): Promise<SurveyQuestion> {
  await ensureBookingSchema();
  const { rows } = await getBookingPool().query(
    `INSERT INTO survey_questions (question, sort_order, is_active)
     VALUES ($1, $2, $3)
     RETURNING id, question, is_active, sort_order, created_at, updated_at`,
    [question, sortOrder, isActive],
  );
  return questionDto(rows[0]);
}

export async function updateSurveyQuestion(id: number, question: string, sortOrder: number, isActive: boolean): Promise<SurveyQuestion> {
  await ensureBookingSchema();
  const { rows } = await getBookingPool().query(
    `UPDATE survey_questions
        SET question = $2, sort_order = $3, is_active = $4, updated_at = now()
      WHERE id = $1
      RETURNING id, question, is_active, sort_order, created_at, updated_at`,
    [id, question, sortOrder, isActive],
  );
  if (!rows[0]) throw new ApiError(404, "Survey question not found");
  return questionDto(rows[0]);
}

export async function deleteSurveyQuestion(id: number): Promise<void> {
  await ensureBookingSchema();
  const result = await getBookingPool().query("DELETE FROM survey_questions WHERE id = $1", [id]);
  if (!result.rowCount) throw new ApiError(404, "Survey question not found");
}

export async function getBookingSurvey(bookingId: number, userId: number) {
  await ensureBookingSchema();
  const booking = await getBookingRow(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.user_id !== userId) throw new ApiError(403, "Not your booking");
  if (booking.status !== "completed") throw new ApiError(400, "Ride not completed yet");

  const { rows } = await getBookingPool().query(
    `SELECT id, booking_id, ride_id, user_id, answers, submitted_at
       FROM survey_responses WHERE booking_id = $1`,
    [bookingId],
  );
  return {
    questions: await listSurveyQuestions(),
    response: rows[0]
      ? { ...rows[0], submitted_at: rows[0].submitted_at.toISOString() }
      : null,
  };
}

export async function submitBookingSurvey(bookingId: number, userId: number, answers: Record<string, string>) {
  await ensureBookingSchema();
  const booking = await getBookingRow(bookingId);
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.user_id !== userId) throw new ApiError(403, "Not your booking");
  if (booking.status !== "completed") throw new ApiError(400, "Ride not completed yet");

  const questions = await listSurveyQuestions();
  const allowedIds = new Set(questions.map((item) => String(item.id)));
  const filteredAnswers = Object.fromEntries(
    Object.entries(answers).filter(([id, answer]) => allowedIds.has(id) && answer.trim().length > 0),
  );
  const { rows } = await getBookingPool().query(
    `INSERT INTO survey_responses (booking_id, ride_id, user_id, answers)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (booking_id) DO NOTHING
     RETURNING id, booking_id, ride_id, user_id, answers, submitted_at`,
    [bookingId, booking.ride_id, userId, JSON.stringify(filteredAnswers)],
  );
  if (!rows[0]) throw new ApiError(400, "Survey already submitted");
  return { ...rows[0], submitted_at: rows[0].submitted_at.toISOString() };
}

export async function listSurveyResponses(rideId?: number): Promise<SurveyResponse[]> {
  await ensureBookingSchema();
  const { rows } = await getBookingPool().query(
    `SELECT sr.id, sr.booking_id, sr.ride_id, sr.user_id, b.reference AS booking_reference,
            sr.answers, sr.submitted_at
       FROM survey_responses sr
       JOIN bookings b ON b.id = sr.booking_id
      WHERE ($1::integer IS NULL OR sr.ride_id = $1)
      ORDER BY sr.submitted_at DESC`,
    [rideId ?? null],
  );
  return rows.map((row) => ({ ...row, submitted_at: row.submitted_at.toISOString() }));
}