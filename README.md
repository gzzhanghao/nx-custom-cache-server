# nx-plugin-custom-cache-server

## Usage

Add `nx-plugin-custom-cache-server` in your `nx.json`:

```json
{
  "plugins": [
    {
      "plugin": "nx-plugin-custom-cache-server",
      "options": {
        "customCacheHandler": "./nx-cache-handler"
      }
    }
  ]
}
```

Then create your custom `nx-cache-handler`:

```ts
// nx-cache-handler.ts
export default () => ({
  async storeFile(hash: string, req: Request): Promise<void> {
    // ...
  },
  async retrieveFile(hash: string): Promise<Response> {
    // ...
  }
})
```
