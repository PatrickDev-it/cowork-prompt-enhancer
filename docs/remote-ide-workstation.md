# Remote IDE and Home Workstation

Prompt Enhancer is designed for a two-machine workflow:

- an always-on Windows or Ubuntu workstation at home runs the server, local model and GPU inference;
- a MacBook or lighter laptop runs the interactive client from the integrated terminal of the IDE;
- a private network connects them through the authenticated WebSocket protocol.

This is not a native IDE extension. The supported interface is the repository client running inside the
IDE terminal.

## Network boundary

Use a private overlay network, private VPN or equivalent protected route between the two machines. Do not
forward port 8080 directly from the public internet. Loopback is the default; remote binding must be
enabled deliberately and requires a shared secret of at least 32 characters.

The application authenticates WebSocket upgrades with short-lived, single-use HMAC challenges. This does
not replace private networking or TLS termination.

## 1. Prepare the home workstation

Install the local profile on the GPU-equipped workstation:

Windows PowerShell:

```powershell
.\setup.ps1 -Local
bun run preflight
```

Linux:

```bash
./setup.sh --local
bun run preflight
```

Start the server with the workstation's private-network interface and a process-environment secret:

Windows PowerShell:

```powershell
$env:COWORK_PROFILE = "local"
$env:COWORK_HOST = "0.0.0.0"
$env:COWORK_ALLOW_REMOTE = "true"
$env:COWORK_AUTH_SECRET = "<at-least-32-random-characters>"
bun run --cwd server start
```

Linux:

```bash
export COWORK_PROFILE=local
export COWORK_HOST=0.0.0.0
export COWORK_ALLOW_REMOTE=true
export COWORK_AUTH_SECRET='<at-least-32-random-characters>'
bun run --cwd server start
```

`0.0.0.0` exposes the service to every workstation interface. Restrict reachability with the host
firewall and private-network policy.

## 2. Connect from the portable machine

Clone the repository on the MacBook or laptop and install the deterministic client dependencies:

```bash
./setup.sh
```

From the IDE integrated terminal, set the private address of the home workstation and the same secret:

```bash
export COWORK_SERVER_IP='<private-workstation-address>'
export COWORK_SERVER_PORT=8080
export COWORK_AUTH_SECRET='<same-secret>'
bun run --cwd client start
```

Windows PowerShell:

```powershell
$env:COWORK_SERVER_IP = "<private-workstation-address>"
$env:COWORK_SERVER_PORT = "8080"
$env:COWORK_AUTH_SECRET = "<same-secret>"
bun run --cwd client start
```

The client reconnects with bounded exponential backoff and does not replay a completed command. Project
file operations remain confined to the client-side session root.

## 3. Operational checklist

- Keep the workstation on AC power and configure deliberate sleep/wake behavior.
- Keep the model and llama-server bound to workstation loopback; only the Prompt Enhancer server needs the
  private-network listener.
- Store the authentication secret in the process environment or a local secret manager, never in Git.
- Restrict port 8080 to the private-network interface and authorized devices.
- Terminate TLS at the private-network or reverse-proxy boundary when transport encryption is not already
  provided.
- Run `bun run preflight` after model, network or configuration changes.
