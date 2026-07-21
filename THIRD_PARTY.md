# Third-party artifact manifest

No binary, model, CUDA library, virtual environment, or generated artifact is distributed by this
repository or its source release.

| Artifact | Pinned identity | SHA-256 of validated workstation artifact | License | Source |
|---|---|---|---|---|
| `llama-server` | llama.cpp build `b9893`, commit `6f8895fee` | `90ccedbd05072261db807e5f4ad52ad3f5517d8af182e45d8189acdd75e2c5eb` | MIT | [ggml-org/llama.cpp b9893](https://github.com/ggml-org/llama.cpp/releases/tag/b9893) |
| `Qwen3-8B-Q4_K_M.gguf` | Qwen3-8B, Q4_K_M GGUF | `120307ba529eb2439d6c430d94104dabd578497bc7bfe7e322b5d9933b449bd4` | Apache-2.0 | [Qwen/Qwen3-8B-GGUF](https://huggingface.co/Qwen/Qwen3-8B-GGUF/tree/main) |
| CUDA runtime DLLs | supplied with the selected llama.cpp Windows CUDA archive | operator verifies the upstream archive | NVIDIA CUDA Toolkit EULA | [NVIDIA CUDA EULA](https://docs.nvidia.com/cuda/eula/index.html) |

The checksums document the local artifacts used for the release validation; they are not permission to
redistribute those artifacts. Setup scripts validate checksums and direct the operator to each upstream
license. A different model or llama.cpp build is an explicit configuration change and must be recorded in
benchmark environment metadata.
