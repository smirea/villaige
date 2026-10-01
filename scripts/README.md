# Local decisions

`decide` runs GLiNER2.5-Decide through Python/PyTorch. Install `uv`, then run:

```sh
scripts/decide 'I am exhausted and need to recover energy' --labels rest work walk_to_farm
printf '%s' 'I need clay for a pot' | scripts/decide --labels collect_clay use_potter_wheel rest
scripts/decide 'Input context' --schema decisions.json
```

For tool calls, pass a JSON Schema with `oneOf` for the possible actions. Each action has its own argument shape. The model selects an action, then selects only that action's arguments. The output is validated against the supplied schema.

The [three-action example](examples/villager-actions.json) defines:

| Action    | Arguments                               |
| --------- | --------------------------------------- |
| `rest`    | `time`: integer, 10, 30, or 60          |
| `walk`    | `to`: location string; `hurry`: boolean |
| `consume` | `item`: burger, beer, or fries          |

Give the model the villager's state, history, goals, and world facts. The input does not specify which action to take. For example:

```text
Villager: Bob, a farmer married to Marie.
Goal: bring Marie a clay pot by evening.
Current state: 11:00 AM, home, energy 95/100, hunger 0/100, inventory empty.
History: finished today's farm work; Marie mentioned that her old pot broke.
World: the river bank is the only source of clay; the square has a potter's wheel;
a pot requires 15 clay. Marie returns home at 6:00 PM.
```

Run the three [villager contexts](examples/villager-contexts.jsonl) using one persistent model:

```sh
scripts/decide --jsonl --schema scripts/examples/villager-actions.json < scripts/examples/villager-contexts.jsonl
```

`--schema` also accepts inline JSON when its first non-whitespace character is `{`:

```sh
scripts/decide 'Bob has energy 5/100 after carrying firewood. His goal is to finish farm work, which costs 50 energy.' \
  --schema '{"action": ["rest", "work", "walk_to_farm"]}'
```

Inline JSON works for structured tool schemas too. To pass the three-action schema directly:

```sh
scripts/decide --jsonl --schema "$(cat scripts/examples/villager-actions.json)" < scripts/examples/villager-contexts.jsonl
```

The output is the model's proposed next action based on the context. These examples check its behavior; they do not establish that it can reliably plan a whole day.

Observed locally with GLiNER2.5-Decide:

| Context                                                   | Actual output                                          | Assessment                                  |
| --------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------- |
| Energy 5/100 after carrying firewood; unfinished goals    | `{"action":"walk","args":{"to":"home","hurry":false}}` | Poor decision: already home; needs recovery |
| Energy 95/100; needs a pot; no clay; clay is at the river | `{"action":"walk","args":{"to":"home","hurry":true}}`  | Poor decision: does not advance the goal    |
| At tavern; hunger 95/100; pot already made                | `{"action":"consume","args":{"item":"burger"}}`        | Sensible next action                        |

Valid output shapes do not guarantee useful planning. The caller should restrict available actions and argument choices to those valid in the current world state.

Supported JSON Schema shapes: a root `oneOf` or object, nested objects, `const`, `enum` (including numeric values), and booleans. Objects must set `additionalProperties: false` and mark every property as required. Free-form strings/numbers, arrays, and nested unions are unsupported; give arguments explicit choices. Descriptions help the model choose. This returns a proposed tool call; your application executes it.

The original classification format also works. These schemas map decision names to candidate labels or GLiNER task definitions:

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

## Villager experiments

The [experiment results](experiments/README.md) compare state formats, history, action outcomes, and a small planner using the current game's action costs. The strongest tested approach uses GLiNER to interpret the goal and code to plan the next action.

```sh
scripts/experiment-decisions --modes json history goal_router goal_only planner
```

Use `GLINER_MODEL` and the offline environment settings above to reuse the local checkpoint. Full predictions and multi-action traces are saved under `scripts/experiments/`.
