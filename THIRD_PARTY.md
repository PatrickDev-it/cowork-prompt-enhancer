# Third-party artifact manifest

No binary, model, CUDA library, virtual environment, or generated artifact is distributed by this
repository or its source release.

| Artifact | Pinned identity | SHA-256 of validated workstation artifact | License | Source |
|---|---|---|---|---|
| `llama-server` | llama.cpp build `b9893`, commit `6f8895fee` | `90ccedbd05072261db807e5f4ad52ad3f5517d8af182e45d8189acdd75e2c5eb` | MIT | [ggml-org/llama.cpp b9893](https://github.com/ggml-org/llama.cpp/releases/tag/b9893) |
| `Qwen3-8B-Q4_K_M.gguf` | Qwen3-8B, Q4_K_M GGUF | `120307ba529eb2439d6c430d94104dabd578497bc7bfe7e322b5d9933b449bd4` | Apache-2.0 | [Qwen/Qwen3-8B-GGUF](https://huggingface.co/Qwen/Qwen3-8B-GGUF/tree/main) |
| CUDA runtime DLLs | supplied with the selected llama.cpp Windows CUDA archive | operator verifies the upstream archive | NVIDIA CUDA Toolkit EULA | [NVIDIA CUDA EULA](https://docs.nvidia.com/cuda/eula/index.html) |

Setup pins:

| Download | SHA-256 |
|---|---|
| `llama-b9893-bin-win-cuda-12.4-x64.zip` | `0620f1fa058b73ab59957d809684f192b1f86e6dd0a6b3827ebff2c8c5fe8e7a` |
| `cudart-llama-bin-win-cuda-12.4-x64.zip` | `8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6` |
| `llama-b9893-bin-ubuntu-x64.tar.gz` | `4eed74472fc50b6406e67b04c815f3ea78849831424f72452db1c3245a7da8fb` |
| `Qwen3-8B-Q4_K_M.gguf` at model revision `7c41481f57cb95916b40956ab2f0b139b296d974` | `d98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785` |

The first table records the workstation artifacts used for local validation; the setup table records the
separately pinned upstream downloads. Identical model labels can refer to revised bitstreams, so the
checksums are authoritative. They are not permission to redistribute any artifact. Setup scripts validate
downloads and direct the operator to each upstream license. A different model or llama.cpp build is an
explicit configuration change that must appear in benchmark environment metadata.
