import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentResource } from "../resources/agent";
import { errorToCallToolResult } from "../lib/mcp";
import { ScriptResource } from "../resources/script";
import { ExperimentResource } from "../resources/experiment";

const SERVER_NAME = "scripts";
const SERVER_VERSION = "0.1.0";

export function createScriptsServer(
  experiment: ExperimentResource,
  agent: AgentResource
): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    title: "Scripts",
    description: "Tools to create and run Python scripts.",
    version: SERVER_VERSION,
  });

  server.tool(
    "create_and_run_script",
    "Run calculations in python with the help of numpy, pandas, matplotlib. Do not use other libraries",
    {
      name: z
        .string()
        .describe(
          "Name of the script (will be sanitized to valid Python filename). Should be descriptive of the calculation being performed."
        ),
      code: z.string().describe("Python code to execute."),
    },
    async ({ name, code }) => {
      const sanitizedName = name
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/^[0-9]/, "_$&");
      const fileName = sanitizedName.endsWith(".py")
        ? sanitizedName
        : `${sanitizedName}.py`;

      const scriptResult = await ScriptResource.create(experiment, {
        author: agent.toJSON().name,
        name: fileName,
        code,
      });

      if (scriptResult.isErr()) {
        return errorToCallToolResult(scriptResult.error);
      }

      const script = scriptResult.value;

      const runResult = await script.runPython(script, agent);

      if (runResult.isErr()) {
        return errorToCallToolResult(runResult.error);
      }

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `Script with id ${
              script.toJSON().id
            } created and executed successfully.\n\nOutput:\n${
              runResult.value
            }`,
          },
        ],
      };
    }
  );

  return server;
}
