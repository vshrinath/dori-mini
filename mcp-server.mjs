#!/usr/bin/env node
// Dori Mini as an MCP server — exposes actions.mjs's exposeToMcp:true entries
// as MCP tools, so external clients (Claude Desktop, Cursor, Raycast, and any
// other generic MCP client) can call Dori Mini primitives directly.
//
// Transport: stdio, not real Dori's Streamable HTTP (dori-engine/src/mcp/
// server.ts). That choice fits a persistent multi-client engine needing
// bearer-token auth over the network; Dori Mini is spawned fresh per client
// session on the same machine — stdio is the standard local-MCP-server
// pattern (same as Claude Desktop's own claude_desktop_config.json examples)
// and needs no auth layer, since only the process that spawned it can talk
// to its stdin/stdout.
//
// Install (Claude Desktop): add to claude_desktop_config.json:
//   "dori-mini": {
//     "command": "node",
//     "args": ["/Users/shri/.claude/skills/dori/mcp-server.mjs"]
//   }
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { actions, getAction } from './actions.mjs';

const server = new Server(
  { name: 'dori-mini', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: actions.filter((a) => a.exposeToMcp).map((a) => ({
    name: a.id,
    description: a.description,
    inputSchema: zodToJsonSchema(a.inputSchema),
    annotations: { readOnlyHint: a.scope === 'read' },
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const action = getAction(req.params.name);
  if (!action.exposeToMcp) throw new Error(`Action not exposed to MCP: ${action.id}`);
  const input = action.inputSchema.parse(req.params.arguments ?? {});
  const result = await action.handler(input);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

await server.connect(new StdioServerTransport());
