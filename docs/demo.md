# Reproducible terminal demo

Run the complete offline recording from the repository root:

```bash
bun run demo:record
```

The command writes `.artifacts/demo/terminal-demo.txt`. It executes and captures:

1. mock-profile preflight and runtime identity;
2. successful request compilation and the written `demo-output/prompt.md` artifact;
3. deterministic malformed provider output delivered through the historical field-loop fallback;
4. the complete 64-case mock benchmark command and record count.

The transcript normalizes the repository path and terminal color codes. It requires no provider
credential, GPU, model download or network access after frozen dependency installation.
