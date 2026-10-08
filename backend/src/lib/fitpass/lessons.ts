/**
 * Mapeo disciplinas FitPass (lessons) <-> class_types de Casa Shé.
 *
 * API estable:
 *   normalizeClassName(s)                         minúsculas, sin acentos/puntuación, espacios colapsados
 *   planLessonAutoMap(lessons, classTypes, aliases?) -> { assignments, skipped }   (PURA, testeable)
 *   autoMapLessons(lessons)                       aplica el plan en BD; NUNCA sobreescribe un fitpass_lesson_id existente
 *   setClassTypeLesson(classTypeId, lessonId|null, quota) -> fila actualizada | null
 *
 * Reglas del plan: 1) nombre normalizado idéntico; 2) alias (gym-config fitpassClassAliases:
 * nombreFP -> nombreClassType). Sin coincidencia difusa (mejor no mapear que mapear mal).
 * Varios class_types con el mismo nombre (p. ej. "Reformer Classic") se mapean todos.
 * Si dos lessons de FP compiten por el mismo class_type, se salta ese class_type (ambiguo).
 */
import { query, queryOne } from '../../config/database.js';
import { fitpassClassAliases } from '../gym-config.js';

export interface FitpassLesson { id: number; name: string }
export interface ClassTypeRef { id: string; name: string; fitpass_lesson_id: number | null }

export function normalizeClassName(s: string): string {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

export interface AutoMapPlan {
    assignments: Array<{ classTypeId: string; classTypeName: string; lessonId: number; lessonName: string; via: 'name' | 'alias' }>;
    skipped: Array<{ lessonId?: number; lessonName?: string; classTypeId?: string; classTypeName?: string; reason: string }>;
}

export function planLessonAutoMap(
    lessons: FitpassLesson[],
    classTypes: ClassTypeRef[],
    aliases: Record<string, string> = fitpassClassAliases(),
): AutoMapPlan {
    const plan: AutoMapPlan = { assignments: [], skipped: [] };
    const candidates = new Map<string, Array<{ lesson: FitpassLesson; via: 'name' | 'alias' }>>();

    for (const lesson of lessons) {
        const n = normalizeClassName(lesson.name);
        if (!n) continue;
        const targets = new Map<string, 'name' | 'alias'>();
        targets.set(n, 'name');
        const aliased = aliases[n] ?? aliases[lesson.name.toLowerCase()];
        if (aliased) {
            const a = normalizeClassName(aliased);
            if (a && !targets.has(a)) targets.set(a, 'alias');
        }
        let matched = false;
        for (const [target, via] of targets) {
            const hits = classTypes.filter((ct) => normalizeClassName(ct.name) === target);
            if (hits.length === 0) continue;
            matched = true;
            for (const ct of hits) {
                const list = candidates.get(ct.id) ?? [];
                list.push({ lesson, via });
                candidates.set(ct.id, list);
            }
            break; // el nombre exacto gana al alias
        }
        if (!matched) plan.skipped.push({ lessonId: lesson.id, lessonName: lesson.name, reason: 'sin class_type equivalente' });
    }

    for (const ct of classTypes) {
        const cands = candidates.get(ct.id);
        if (!cands) continue;
        if (ct.fitpass_lesson_id != null) {
            plan.skipped.push({ classTypeId: ct.id, classTypeName: ct.name, reason: 'ya tiene fitpass_lesson_id (no se sobreescribe)' });
            continue;
        }
        const unique = new Map(cands.map((c) => [c.lesson.id, c]));
        if (unique.size > 1) {
            plan.skipped.push({ classTypeId: ct.id, classTypeName: ct.name, reason: `ambiguo: lessons ${[...unique.keys()].join(', ')}` });
            continue;
        }
        const only = [...unique.values()][0];
        plan.assignments.push({
            classTypeId: ct.id, classTypeName: ct.name,
            lessonId: only.lesson.id, lessonName: only.lesson.name, via: only.via,
        });
    }
    return plan;
}

export async function autoMapLessons(lessons: FitpassLesson[]): Promise<AutoMapPlan & { applied: number }> {
    const classTypes = await query<ClassTypeRef>(`SELECT id, name, fitpass_lesson_id FROM class_types`);
    const plan = planLessonAutoMap(lessons, classTypes);
    let applied = 0;
    for (const a of plan.assignments) {
        // Doble guarda en SQL: nunca pisar un mapeo manual hecho entre el SELECT y el UPDATE.
        const rows = await query(
            `UPDATE class_types SET fitpass_lesson_id = $2 WHERE id = $1 AND fitpass_lesson_id IS NULL RETURNING id`,
            [a.classTypeId, a.lessonId],
        );
        applied += rows.length;
    }
    return { ...plan, applied };
}

export async function setClassTypeLesson(
    classTypeId: string,
    lessonId: number | null,
    quota: number,
): Promise<{ id: string; name: string; fitpass_lesson_id: number | null; fitpass_quota: number } | null> {
    return queryOne(
        `UPDATE class_types SET fitpass_lesson_id = $2, fitpass_quota = $3 WHERE id = $1
         RETURNING id, name, fitpass_lesson_id, fitpass_quota`,
        [classTypeId, lessonId, quota],
    );
}
