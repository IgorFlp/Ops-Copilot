import { errorDetail, logEvent } from "../lib/log.js";

export type LearningTask = () => Promise<void>;
export type LearningFailureReporter = (message: string) => void;

function reportLearningFailure(message: string): void {
  process.stderr.write(`${message}\n`);
}

export class LearningTaskRunner {
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly reportFailure: LearningFailureReporter =
      reportLearningFailure,
  ) {}

  schedule(task: LearningTask): void {
    const started = Date.now();
    logEvent("learning.task.start");
    let tracked!: Promise<void>;
    tracked = Promise.resolve()
      .then(task)
      .then(() => {
        logEvent("learning.task.success", {
          durationMs: Date.now() - started,
        });
      })
      .catch((error: unknown) => {
        logEvent("learning.task.failure", {
          durationMs: Date.now() - started,
          error: errorDetail(error),
        });
        try {
          this.reportFailure("[opspilot] learning task failed");
        } catch {
          reportLearningFailure("[opspilot] learning failure reporter failed");
        }
      })
      .finally(() => {
        this.pending.delete(tracked);
      });
    this.pending.add(tracked);
  }

  async drain(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
    }
  }
}
