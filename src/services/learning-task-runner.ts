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
    let tracked!: Promise<void>;
    tracked = Promise.resolve()
      .then(task)
      .catch(() => {
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
