import sys
from pathlib import Path

# `workflow.py` uses bare imports (`from search import ...`) because in production it runs with
# `server/modules/prompt_enhancer/` as the working directory / on sys.path. Tests run from
# `server/` (see docs/DEV.md, .github/workflows/ci.yml), so replicate that here rather than
# changing the module's import style for the sake of tests.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
