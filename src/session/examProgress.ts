/** Course identity, entry and completion move together; never reset them in an effect. */
export interface ExamProgress<Project extends string> {
  project: Project
  entered: boolean
  completed: boolean
}

export function createExamProgress<Project extends string>(
  project: Project,
  entered = true,
): ExamProgress<Project> {
  return { project, entered, completed: false }
}

export function enterExamProject<Project extends string>(
  progress: ExamProgress<Project>,
  project: Project,
): ExamProgress<Project> {
  if (progress.project !== project || progress.entered) return progress
  return { ...progress, entered: true }
}

export function completeExamProject<Project extends string>(
  progress: ExamProgress<Project>,
  project: Project,
): ExamProgress<Project> {
  if (progress.project !== project || !progress.entered || progress.completed) return progress
  return { ...progress, completed: true }
}

export function advanceExamProgress<Project extends string>(
  progress: ExamProgress<Project>,
  sequence: readonly Project[],
): ExamProgress<Project> {
  const index = sequence.indexOf(progress.project)
  if (!progress.completed || index < 0 || index >= sequence.length - 1) return progress
  return createExamProgress(sequence[index + 1], false)
}

export function isExamComplete<Project extends string>(
  progress: ExamProgress<Project>,
  sequence?: readonly Project[],
): boolean {
  return progress.entered && progress.completed &&
    (sequence === undefined || (sequence.length > 0 && progress.project === sequence[sequence.length - 1]))
}
