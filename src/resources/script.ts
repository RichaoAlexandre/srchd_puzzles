import { db } from "../db";
import { scripts } from "../db/schema";
import { eq, InferSelectModel, InferInsertModel, and, desc } from "drizzle-orm";
import { ExperimentResource } from "./experiment";
import { Err, Ok, Result } from "../lib/result";
import { normalizeError, SrchdError } from "../lib/error";
import { concurrentExecutor } from "../lib/async";
import { mkdir, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { PublicationResource } from "./publication";
import { Computer } from "../computer";
import { AgentResource } from "./agent";

export type Script = InferSelectModel<typeof scripts>;

export class ScriptResource {
  private data: Script;
  experiment: ExperimentResource;

  private constructor(data: Script, experiment: ExperimentResource) {
    this.data = data;
    this.experiment = experiment;
  }

  private async finalize(): Promise<ScriptResource> {
    return this;
  }

  static async findById(
    experiment: ExperimentResource,
    id: number
  ): Promise<ScriptResource | null> {
    const [result] = await db
      .select()
      .from(scripts)
      .where(eq(scripts.id, id))
      .limit(1);

    if (!result) return null;

    return await new ScriptResource(result, experiment).finalize();
  }

  static async getScriptbyPublication(
    experiment: ExperimentResource,
    publication: PublicationResource
  ): Promise<ScriptResource | null> {
    const scriptId = publication.toJSON().script;
    if (!scriptId) {
      return null;
    }
    const [result] = await db
      .select()
      .from(scripts)
      .where(
        and(
          eq(scripts.experiment, experiment.toJSON().id),
          eq(scripts.id, scriptId)
        )
      );

    return await new ScriptResource(result, experiment).finalize();
  }

  static async listByExperiment(
    experiment: ExperimentResource
  ): Promise<ScriptResource[]> {
    const results = await db
      .select()
      .from(scripts)
      .where(eq(scripts.experiment, experiment.toJSON().id))
      .orderBy(desc(scripts.created));

    return await concurrentExecutor(
      results,
      async (data) => {
        return await new ScriptResource(data, experiment).finalize();
      },
      { concurrency: 8 }
    );
  }

  static async create(
    experiment: ExperimentResource,
    data: Omit<
      InferInsertModel<typeof scripts>,
      "id" | "created" | "edited" | "experiment"
    >
  ): Promise<Result<ScriptResource, SrchdError>> {
    try {
      const experimentName = experiment.toJSON().name;

      const [created] = await db
        .insert(scripts)
        .values({
          ...data,
          experiment: experiment.toJSON().id,
        })
        .returning();

      return new Ok(await new ScriptResource(created, experiment).finalize());
    } catch (error) {
      return new Err(
        new SrchdError(
          "resource_creation_error",
          "Failed to create script",
          normalizeError(error)
        )
      );
    }
  }

  async runPython(
    script: ScriptResource,
    agent: AgentResource
  ): Promise<Result<string, SrchdError>> {
    try {
      if (!script) {
        return new Err(
          new SrchdError("reading_file_error", "No script provided !")
        );
      }

      const computerResult = await Computer.ensure(agent.toJSON().name);
      if (!computerResult.isOk()) {
        return new Err(computerResult.error);
      }
      const computer = computerResult.value;

      const scriptPath = `/home/agent/${script.toJSON().name}`;
      const writeResult = await computer.writeFile(
        scriptPath,
        Buffer.from(script.toJSON().code, "utf-8"),
        0o755 // Make executable
      );

      if (!writeResult.isOk()) {
        return new Err(
          new SrchdError(
            "script_execution_error",
            "Failed to write script to container",
            writeResult.error
          )
        );
      }

      const execResult = await computer.execute(`python3 ${scriptPath}`, {
        timeoutMs: 60000,
      });

      if (!execResult.isOk()) {
        return new Err(execResult.error);
      }

      const { exitCode, stdout, stderr } = execResult.value;

      if (exitCode !== 0) {
        return new Err(
          new SrchdError(
            "script_execution_error",
            `Script exited with code ${exitCode}`,
            new Error(stderr || "No error output")
          )
        );
      }

      return new Ok(stdout);
    } catch (error) {
      return new Err(
        new SrchdError(
          "script_execution_error",
          "Failed to run script",
          normalizeError(error)
        )
      );
    }
  }

  toJSON() {
    return {
      ...this.data,
      experiment: this.experiment,
    };
  }
}
