import 'server-only';
import { and, asc, eq, gte } from 'drizzle-orm';
import {
  db as defaultDb,
  Database,
  branches,
  capsters,
  capsterSchedules,
  timeOffs,
} from '@/db';

export interface Shift {
  dayOfWeek: number; // 0 = Sunday ... 6 = Saturday
  startTime: string; // 'HH:mm'
  endTime: string; // 'HH:mm'
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/**
 * Parses a day's shift input like "09:00-12:00, 13:00-17:00" (empty = day off).
 * Pure; returns either the shifts or a human-readable error.
 */
export function parseDayShifts(
  dayOfWeek: number,
  input: string
): { ok: true; shifts: Shift[] } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, shifts: [] };

  const shifts: Shift[] = [];
  for (const part of trimmed.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean)) {
    const match = part.match(/^(\d{1,2}[:.]\d{2})\s*-\s*(\d{1,2}[:.]\d{2})$/);
    if (!match) {
      return { ok: false, error: `${DAY_NAMES_ID[dayOfWeek]}: format "${part}" tidak valid (contoh 09:00-12:00)` };
    }
    const norm = (t: string) => t.replace('.', ':').padStart(5, '0');
    const startTime = norm(match[1]);
    const endTime = norm(match[2]);
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
      return { ok: false, error: `${DAY_NAMES_ID[dayOfWeek]}: jam "${part}" tidak valid` };
    }
    if (startTime >= endTime) {
      return { ok: false, error: `${DAY_NAMES_ID[dayOfWeek]}: jam mulai harus sebelum jam selesai (${part})` };
    }
    shifts.push({ dayOfWeek, startTime, endTime });
  }

  shifts.sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let i = 1; i < shifts.length; i++) {
    if (shifts[i].startTime < shifts[i - 1].endTime) {
      return { ok: false, error: `${DAY_NAMES_ID[dayOfWeek]}: shift saling tumpang tindih` };
    }
  }
  return { ok: true, shifts };
}

/** Formats a day's shifts back into the editor's text format. */
export function formatDayShifts(shifts: { startTime: string; endTime: string }[]): string {
  return [...shifts]
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((s) => `${s.startTime}-${s.endTime}`)
    .join(', ');
}

/** Single-branch MVP: the first active branch. */
export async function getDefaultBranch(db: Database = defaultDb) {
  const [branch] = await db
    .select()
    .from(branches)
    .where(eq(branches.isActive, true))
    .orderBy(asc(branches.id))
    .limit(1);
  return branch ?? null;
}

export async function listCapsters(db: Database = defaultDb) {
  return db.select().from(capsters).orderBy(asc(capsters.id));
}

export async function createCapster(
  params: { branchId: number; name: string },
  db: Database = defaultDb
) {
  const [row] = await db
    .insert(capsters)
    .values({ branchId: params.branchId, name: params.name.trim(), isActive: true })
    .returning();
  return row;
}

export async function updateCapster(
  params: { id: number; name: string; isActive: boolean },
  db: Database = defaultDb
) {
  const [row] = await db
    .update(capsters)
    .set({ name: params.name.trim(), isActive: params.isActive, updatedAt: new Date() })
    .where(eq(capsters.id, params.id))
    .returning();
  return row ?? null;
}

export async function getCapsterDetail(id: number, now: Date = new Date(), db: Database = defaultDb) {
  const [capster] = await db.select().from(capsters).where(eq(capsters.id, id));
  if (!capster) return null;

  const schedules = await db
    .select()
    .from(capsterSchedules)
    .where(eq(capsterSchedules.capsterId, id))
    .orderBy(asc(capsterSchedules.dayOfWeek), asc(capsterSchedules.startTime));

  const upcomingTimeOffs = await db
    .select()
    .from(timeOffs)
    .where(and(eq(timeOffs.capsterId, id), gte(timeOffs.endsAt, now)))
    .orderBy(asc(timeOffs.startsAt));

  return { capster, schedules, timeOffs: upcomingTimeOffs };
}

/** Replaces the full weekly schedule atomically. */
export async function replaceWeeklySchedule(
  capsterId: number,
  shifts: Shift[],
  db: Database = defaultDb
) {
  await db.transaction(async (tx) => {
    await tx.delete(capsterSchedules).where(eq(capsterSchedules.capsterId, capsterId));
    if (shifts.length > 0) {
      await tx.insert(capsterSchedules).values(shifts.map((s) => ({ ...s, capsterId })));
    }
  });
}

export async function addTimeOff(
  params: { capsterId: number; startsAt: Date; endsAt: Date; reason?: string },
  db: Database = defaultDb
) {
  if (params.endsAt <= params.startsAt) {
    return { success: false as const, reason: 'INVALID_RANGE' as const };
  }
  const [row] = await db
    .insert(timeOffs)
    .values({
      capsterId: params.capsterId,
      startsAt: params.startsAt,
      endsAt: params.endsAt,
      reason: params.reason?.trim() || null,
    })
    .returning();
  return { success: true as const, timeOff: row };
}

export async function deleteTimeOff(id: number, db: Database = defaultDb) {
  await db.delete(timeOffs).where(eq(timeOffs.id, id));
}
