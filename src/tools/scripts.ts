import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentResource } from "../resources/agent";
import { errorToCallToolResult } from "../lib/mcp";
import { ScriptResource } from "../resources/script";
import { ExperimentResource } from "../resources/experiment";
import { SrchdError } from "../lib/error";
import { PublicationResource } from "../resources/publication";

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
    "Create a Python script and execute it immediately. The script will be saved and executed.",
    {
      name: z
        .string()
        .describe(
          "Name of the script (will be sanitized to valid Python filename)."
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
        name,
        path: fileName,
        code,
      });

      if (scriptResult.isErr()) {
        return errorToCallToolResult(scriptResult.error);
      }

      const script = scriptResult.value;

      const runResult = await script.runPython(script.toJSON().id);

      if (runResult.isErr()) {
        return errorToCallToolResult(runResult.error);
      }

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `Script created and executed successfully.\n\nOutput:\n${runResult.value}`,
          },
        ],
      };
    }
  );

  return server;
}
