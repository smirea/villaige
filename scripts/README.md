# Local decisions

`decide` runs GLiNER2.5-Decide through Python/PyTorch. Install `uv`, then run:

```sh
scripts/decide 'I am exhausted and need to recover energy' --labels rest work walk_to_farm
printf '%s' 'I need clay for a pot' | scripts/decide --labels collect_clay use_potter_wheel rest
scripts/decide 'Input context' --schema decisions.json
```

Schemas map decision names to candidate labels or GLiNER task definitions:

```json
{
	"action": ["rest", "work", "collect_clay"],
	"needs": { "labels": ["food", "sleep", "money"], "multi_label": true, "cls_threshold": 0.5 }
}
```

Results are JSON on stdout, with labels and confidence scores. Diagnostics go to stderr. `uv` installs pinned dependencies in its cache; the first model load downloads weights from Hugging Face. Inference runs locally, using Apple GPU or CUDA when available, otherwise CPU. Use `--device cpu` to override.

To reuse an existing download, set `GLINER_MODEL` to its model directory or pass `--model /absolute/path/to/model`. After dependencies and weights are cached, `UV_OFFLINE=1 HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1` prevents network access.

For repeated tree decisions, start `scripts/decide --jsonl` and send one request per stdin line:

```json
{"text":"I am exhausted","schema":{"action":["rest","work"]}}
{"text":"I need clay for a pot","schema":{"action":["collect_clay","rest"]}}
```

The model loads once and emits one JSON result per request. Invalid requests return an `error` object; subsequent requests continue. `--labels` or `--schema` can supply a default schema for the stream.

This classifier selects supplied labels; it cannot generate dialogue or arbitrary action arguments. The game engine still uses its existing LLM until its action and argument decisions are mapped to classification schemas.
