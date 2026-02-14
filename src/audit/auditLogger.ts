import fs from "node:fs/promises";
import path from "node:path";

export interface AuditEvent {
  ts: string;
  sessionId: string;
  type: string;
  data: unknown;
}

export class AuditLogger {
  private readonly auditPath: string;
  private readonly sessionId: string;
  private initialized = false;

  public constructor(stateDir: string, sessionId: string) {
    const auditDir = path.resolve(stateDir, "audit");
    this.auditPath = path.resolve(auditDir, `${sessionId}.jsonl`);
    this.sessionId = sessionId;
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public async log(type: string, data: unknown): Promise<void> {
    if (!this.initialized) {
      await fs.mkdir(path.dirname(this.auditPath), { recursive: true });
      this.initialized = true;
    }
    const event: AuditEvent = {
      ts: new Date().toISOString(),
      sessionId: this.sessionId,
      type,
      data,
    };
    await fs.appendFile(this.auditPath, `${JSON.stringify(event)}\n`, "utf8");
  }

  public getAuditPath(): string {
    return this.auditPath;
  }
}
