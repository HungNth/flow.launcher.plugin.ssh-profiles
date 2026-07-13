# Flow Launcher Node.js Plugin Reference

This reference condenses the official Flow Launcher docs for JavaScript/TypeScript Node.js plugins:

- https://www.flowlauncher.com/docs/#/plugin-dev
- https://www.flowlauncher.com/docs/#/plugin.json
- https://www.flowlauncher.com/docs/#/nodejs-develop-plugins
- https://www.flowlauncher.com/docs/#/nodejs-setup-project
- https://www.flowlauncher.com/docs/#/nodejs-write-code
- https://www.flowlauncher.com/docs/#/json-rpc
- https://www.flowlauncher.com/docs/#/json-rpc-settings
- https://www.flowlauncher.com/docs/#/json-rpc-visual-settingstemplate-editor

## JSON-RPC Invocation

Flow calls Node.js plugins with a JSON payload argument. The official Node.js example parses:

```js
const { method, parameters, settings } = JSON.parse(process.argv[2]);
```

For a query request, Flow sends `method: "query"` and the user query in `parameters`. The Node.js example returns:

```js
console.log(JSON.stringify({
  result: [
    {
      Title: "Hello World Typescript",
      Subtitle: "Showing your query parameters: " + parameters,
      JsonRPCAction: {
        method: "do_something_for_query",
        parameters: ["https://github.com/Flow-Launcher/Flow.Launcher"]
      },
      IcoPath: "Images\\app.png",
      score: 0
    }
  ]
}));
```

Use stdout only for the JSON response. Debug logging should go to stderr or a file.

## Dispatcher Template

Use a dispatcher instead of a long series of unrelated `if` blocks once the plugin has more than one method:

```js
const handlers = {
  query: async ([query = ""], settings) => {
    return [
      {
        Title: query ? `Search: ${query}` : "Type a search",
        Subtitle: "Press Enter to run the default action",
        IcoPath: "Images\\app.png",
        score: query ? 80 : 20,
        JsonRPCAction: {
          method: "open_result",
          parameters: [query]
        }
      }
    ];
  },

  open_result: async ([query], settings) => {
    // Perform the side effect here. If returning a Flow API action,
    // return the action object and write it as JSON.
  }
};

let currentMethod = "query";

async function main() {
  const request = JSON.parse(process.argv[2] || "{}");
  const method = request.method;
  currentMethod = method;
  const parameters = Array.isArray(request.parameters) ? request.parameters : [];
  const settings = request.settings || {};
  const handler = handlers[method];

  if (!handler) {
    if (method === "query") {
      process.stdout.write(JSON.stringify({ result: [] }));
    }
    return;
  }

  const result = await handler(parameters, settings);
  if (method === "query") {
    process.stdout.write(JSON.stringify({ result: Array.isArray(result) ? result : [] }));
  } else if (result) {
    process.stdout.write(JSON.stringify(result));
  }
}

main().catch((error) => {
  console.error(error);
  if (currentMethod === "query") {
    process.stdout.write(JSON.stringify({
      result: [
        {
          Title: "Plugin error",
          Subtitle: error instanceof Error ? error.message : String(error),
          IcoPath: "Images\\app.png",
          score: 0
        }
      ]
    }));
  }
});
```

## plugin.json Checklist

`plugin.json` must be in the plugin root. Useful fields:

- `$schema`: `https://www.flowlauncher.com/schemas/plugin.schema.json`
- `ID`: stable UUID/GUID for the plugin
- `ActionKeyword`: default keyword, or `*` for global search
- `Name`, `Description`, `Author`, `Version`
- `Language`: `javascript` or `typescript`
- `Website`: plugin or author URL
- `IcoPath`: icon path relative to plugin root
- `ExecuteFileName`: runtime entry, such as `main.js`, `./dist/main.js`, or a verified `.ts` entry

## SettingsTemplate.yaml

Settings are defined by a root `SettingsTemplate.yaml`:

```yaml
#$schema: https://www.flowlauncher.com/schemas/settings-template.schema.json
body:
  - type: textBlock
    attributes:
      description: Configure the plugin behavior.
  - type: input
    attributes:
      name: apiBaseUrl
      label: API base URL
      description: Endpoint used for searches.
      defaultValue: https://example.com/api
  - type: passwordBox
    attributes:
      name: apiKey
      label: API key
      defaultValue: ""
  - type: dropdown
    attributes:
      name: resultMode
      label: Result mode
      defaultValue: Compact
      options:
        - Compact
        - Detailed
  - type: checkbox
    attributes:
      name: enableCache
      label: Enable cache
      defaultValue: true
```

The JSON-RPC payload includes a `settings` object. Read it defensively:

```js
function getSettings(settings = {}) {
  return {
    apiBaseUrl: settings.apiBaseUrl || "https://example.com/api",
    apiKey: settings.apiKey || "",
    resultMode: settings.resultMode || "Compact",
    enableCache: settings.enableCache !== false
  };
}
```

## Node.js Runtime And Dependencies

The official docs emphasize that users should not have to run `npm install`. Release zips should include dependencies. The docs also mention Flow Launcher's portable Node.js download, so avoid relying on a newer system Node unless the plugin verifies the current Flow runtime or bundles the relevant code.

For simple CommonJS plugins:

```js
const open = require("./node_modules/open");
```

For generated projects, ordinary `require("package-name")` also resolves local `node_modules` when the release zip includes it. If using TypeScript or ESM packages, compile or bundle to a Windows-friendly runtime target and test from the plugin root.

## Local Smoke Tests

PowerShell:

```powershell
node .\main.js '{"method":"query","parameters":["hello"],"settings":{}}'
```

Expected properties:

- Process exits successfully.
- stdout is a single valid JSON object.
- JSON has `result` array for query calls.
- Each result has a `Title` and usable `IcoPath`.
- Query errors are returned as a Flow-visible result or logged to stderr, not mixed into stdout.
