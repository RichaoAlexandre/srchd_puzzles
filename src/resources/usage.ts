import { InferSelectModel } from "drizzle-orm";
import { usages } from "../db/schema";
import { ExperimentResource } from "./experiment";
import { MessageResource } from "./messages";
import { AgentResource } from "./agent";
import { Usage } from "../models";
import { db } from "../db";

export class UsageResource {
  private data: InferSelectModel<typeof usages>;
  experiment: ExperimentResource;
  message: MessageResource;

  private constructor(
    data: InferSelectModel<typeof usages>,
    experiment: ExperimentResource,
    message: MessageResource,
  ) {
    this.data = data;
    this.experiment = experiment;
    this.message = message;
  }

  static async create(
    experiment: ExperimentResource,
    message: MessageResource,
    agent: AgentResource,
    usage: Usage,
  ): Promise<UsageResource> {
    const [created] = await db
      .insert(usages)
      .values({
        experiment: experiment.toJSON().id,
        agent: agent.toJSON().id,
        message: message.toJSON().id,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_creation_tokens: usage.cache_creation_tokens,
        cache_read_tokens: usage.cache_read_tokens,
      })
      .returning();
    return new UsageResource(created, experiment, message);
  }
}
