/**
 * Swayam404 Knowledge Base — Syllabus and Course Hierarchy Extractor
 *
 * Extracts structured CourseUnitMetadata and CourseLectureMetadata from
 * portal course outline task hierarchies without fabricating missing metadata.
 */

import { CourseTask } from '@/types';
import {
  CourseMetadataProposal,
  CourseUnitMetadata,
  CourseLectureMetadata,
} from '@/types/knowledge';

export class SyllabusExtractor {
  /**
   * Builds a CourseMetadataProposal from scanned outline tasks
   */
  static extractFromTasks(params: {
    courseId: string;
    courseTitle: string;
    tasks: CourseTask[];
    url?: string;
  }): CourseMetadataProposal {
    const { courseId, courseTitle, tasks, url } = params;

    const unitMap = new Map<string, CourseUnitMetadata>();
    const courseTopics = new Set<string>();

    for (const task of tasks) {
      // Determine unit key from unitTitle or fallback
      const unitKey = task.unitTitle || 'General Units';
      const weekMatch = unitKey.match(/(?:week|unit)\s*(\d+)/i);
      const weekNumberStr = weekMatch ? `Week ${weekMatch[1]}` : undefined;
      const unitId = this.generateStableUnitId(unitKey, weekMatch ? parseInt(weekMatch[1], 10) : undefined);

      if (!unitMap.has(unitId)) {
        unitMap.set(unitId, {
          unitId,
          unitNumber: weekNumberStr,
          title: unitKey,
          lectures: [],
          topics: [],
        });
      }

      const unit = unitMap.get(unitId)!;

      // Classify resource/reading/video tasks or tasks that aren't graded quizzes/assignments
      if (task.type === 'resource' || task.type === 'practice') {
        const lectureId = this.generateStableLectureId(unitId, task.id || task.title);
        const existingLec = unit.lectures.find((l) => l.lectureId === lectureId);

        if (!existingLec) {
          const lectureTopics: string[] = [];
          // Extract topic keywords if explicit in title (e.g., "Lecture 1: Law of Demand")
          const topicMatch = task.title.match(/:\s*(.+)$/);
          if (topicMatch && topicMatch[1].trim().length > 2) {
            const topic = topicMatch[1].trim();
            lectureTopics.push(topic);
            courseTopics.add(topic);
            if (!unit.topics.includes(topic)) {
              unit.topics.push(topic);
            }
          }

          const lecture: CourseLectureMetadata = {
            lectureId,
            title: task.title,
            topics: lectureTopics,
            sourcePageReference: task.url || undefined,
          };
          unit.lectures.push(lecture);
        }
      }
    }

    const units = Array.from(unitMap.values());

    return {
      courseId,
      courseTitle,
      units,
      topics: Array.from(courseTopics),
      extractedFromUrl: url,
      extractedAt: new Date().toISOString(),
    };
  }

  /**
   * Safely formats stable unit identifier
   */
  private static generateStableUnitId(unitTitle: string, weekNumber?: number): string {
    if (weekNumber !== undefined && weekNumber !== null) {
      return `unit-week-${weekNumber}`;
    }
    const clean = unitTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `unit-${clean || 'general'}`;
  }

  /**
   * Safely formats stable lecture identifier
   */
  private static generateStableLectureId(unitId: string, taskIdentifier: string): string {
    const clean = taskIdentifier.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `lec-${unitId}-${clean || 'item'}`.slice(0, 64);
  }
}
