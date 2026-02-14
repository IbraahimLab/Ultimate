import { deleteFileIfExists, writeFile } from "../tools/fileTools.js";

interface FileSnapshot {
  path: string;
  existed: boolean;
  before: string;
  after: string;
}

export class ChangeTracker {
  private readonly snapshots = new Map<string, FileSnapshot>();
  private order: string[] = [];

  public recordBefore(path: string, existed: boolean, before: string): void {
    if (this.snapshots.has(path)) {
      return;
    }
    this.snapshots.set(path, {
      path,
      existed,
      before,
      after: before,
    });
    this.order.push(path);
  }

  public recordAfter(path: string, after: string): void {
    const existing = this.snapshots.get(path);
    if (!existing) {
      return;
    }
    existing.after = after;
  }

  public hasChanges(): boolean {
    return this.order.some((path) => {
      const snapshot = this.snapshots.get(path);
      return Boolean(snapshot && snapshot.before !== snapshot.after);
    });
  }

  public getChangedFiles(): FileSnapshot[] {
    return this.order
      .map((path) => this.snapshots.get(path))
      .filter((value): value is FileSnapshot => Boolean(value))
      .filter((snapshot) => snapshot.before !== snapshot.after);
  }

  public async rollback(workspaceRoot: string): Promise<string[]> {
    const restored: string[] = [];
    const targets = [...this.order].reverse();

    for (const path of targets) {
      const snapshot = this.snapshots.get(path);
      if (!snapshot || snapshot.before === snapshot.after) {
        continue;
      }

      if (snapshot.existed) {
        await writeFile(workspaceRoot, snapshot.path, snapshot.before);
      } else {
        await deleteFileIfExists(workspaceRoot, snapshot.path);
      }
      restored.push(snapshot.path);
    }

    return restored.reverse();
  }
}
