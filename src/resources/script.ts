import { db } from "../db";
import { scripts } from "../db/schema";
import { eq, InferSelectModel, InferInsertModel, and, desc } from "drizzle-orm";
import { ExperimentResource } from "./experiment";
import { Err, Ok, Result } from "../lib/result";
import { normalizeError, SrchdError } from "../lib/error";
import { concurrentExecutor } from "../lib/async";
import { spawn } from "child_process";
import { mkdir, access, writeFile } from "fs/promises";
import { constants } from "fs";
import { join } from "path";
import { PublicationResource } from "./publication";

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

  static async listByPublication(
    experiment: ExperimentResource,
    publication: PublicationResource
  ): Promise<ScriptResource[]> {
    const results = await db
      .select()
      .from(scripts)
      .where(
        and(
          eq(scripts.experiment, experiment.toJSON().id),
          eq(scripts.publication, publication.toJSON().id)
        )
      );

    return await concurrentExecutor(
      results,
      async (data) => {
        return await new ScriptResource(data, experiment).finalize();
      },
      { concurrency: 8 }
    );
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
    >,
    code: string
  ): Promise<Result<ScriptResource, SrchdError>> {
    try {
      const experimentName = experiment.toJSON().name;
      const scriptsDir = join(process.cwd(), "scripts");
      const experimentDir = join(scriptsDir, experimentName);

      await mkdir(experimentDir, { recursive: true });

      const scriptPath = join(experimentDir, data.path);
      await writeFile(scriptPath, code, "utf-8");

      const [created] = await db
        .insert(scripts)
        .values({
          ...data,
          experiment: experiment.toJSON().id,
          path: scriptPath,
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

  async runPython(id: number): Promise<Result<string, SrchdError>> {
    try {
      const [script] = await db
        .select({ path: scripts.path })
        .from(scripts)
        .where(eq(scripts.id, id));

      try {
        await access(script.path, constants.F_OK);
      } catch {
        return new Err(
          new SrchdError(
            "reading_file_error",
            `Script file not found at ${script.path}`
          )
        );
      }

      return new Promise((resolve) => {
        const process = spawn("python3", [script.path]);
        let stdout = "";
        let stderr = "";

        process.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        process.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        process.on("close", (code) => {
          if (code !== 0) {
            resolve(
              new Err(
                new SrchdError(
                  "script_execution_error",
                  `Script exited with code ${code}`,
                  new Error(stderr)
                )
              )
            );
          } else {
            resolve(new Ok(stdout));
          }
        });

        process.on("error", (error) => {
          resolve(
            new Err(
              new SrchdError(
                "script_execution_error",
                "Failed to execute script",
                normalizeError(error)
              )
            )
          );
        });
      });
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
