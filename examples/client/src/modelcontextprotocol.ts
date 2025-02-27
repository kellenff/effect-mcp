#!/usr/bin/env node

import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { serverCwd } from "./shared.js";

const client = new McpClient({
  name: "Echo",
  version: "1.0.0",
});

const transport = new StdioClientTransport({
  command: "node",
  args: ["./dist/stdio.js"],
  cwd: serverCwd,
});
await client.connect(transport);

const prompts = await client.listPrompts();

console.dir(prompts, { depth: null });

const result = await client.getPrompt({
  name: "Echo",
  arguments: {
    message: "Hello, world!",
  },
});

console.dir(result, { depth: null });

await transport.close();
