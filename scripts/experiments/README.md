# Local villager decision experiments

Measured October 1, 2026 with the existing GLiNER2.5-Decide checkpoint on this Mac using MPS. No fine-tuning or hosted inference.

Direct action selection was not reliable. The best direct format advanced the goal on 44.4% of validation decisions, and none of the seven model-only formats completed any of the three pot-delivery rollouts. A small state-space planner completed every rollout. Using GLiNER to interpret the goal and the planner to select actions was much stronger.

| Strategy                                   | Development progress | Validation progress | Goals completed within 16 actions |
| ------------------------------------------ | -------------------: | ------------------: | --------------------------------: |
| JSON state                                 |                48.3% |               44.4% |                               2/6 |
| Prose state                                |                40.2% |               28.9% |                               2/6 |
| Prose + recent history                     |                41.4% |               30.0% |                               1/6 |
| History + resource facts                   |                42.5% |               28.9% |                               2/6 |
| Predicted immediate outcomes               |                41.4% |               30.0% |                               1/6 |
| Planner distances given to GLiNER          |                39.1% |               28.9% |                               1/6 |
| Explicit decision question                 |                44.8% |               33.3% |                               1/6 |
| GLiNER reads full context; planner acts    |                96.6% |               96.7% |                               6/6 |
| GLiNER reads goal separately; planner acts |               100.0% |              100.0% |                               6/6 |
| Planner with known goal (reference)        |               100.0% |              100.0% |                               6/6 |

## What the successful approach does

The caller still supplies the full state, current goal, and legal available actions. GLiNER maps the goal wording onto one of four known goals. The planner simulates legal actions on copies of the state and selects a step that shortens the path to the target. It returns the action name and its concrete arguments.

For a villager at home with 10 clay, energy 92, and the goal of bringing Marie a pot, the tested trace was:

```text
walk_to_river_bank
collect_clay
walk_to_square
use_potter_wheel
walk_to_home
```

For the depleted-energy case it first rested, then gathered clay twice, made the pot, and came home. These paths emerge from searching the simulated actions; they are not supplied to GLiNER as instructions.

The planner already knows what each goal means in game terms, such as `clay_pot >= 1` and `location == home`. Its 100% snapshot score is expected because it is also the scoring reference. This is evidence for using deterministic planning in this small world, not evidence that GLiNER learned to plan.

## Goal wording and option order

With a fixed goal-label order, full-context goal routing initially scored 100%. Shuffling the four goal choices exposed mistakes: 169/177 goals were identified correctly and 171/177 actions advanced the intended goal. On validation snapshots alone, action progress was 96.7%. The same six rollouts still completed.

We then tested 16 new goal wordings across three goal-label orders (48 decisions). Full-context routing identified 44/48 correctly; reading only the goal wording identified 46/48 correctly. The latter method still confused taking pottery home with simply returning home in two orders, at roughly 51–52% confidence. Therefore even the stronger goal parser should not silently redefine the villager's goal. Keep the active goal stored explicitly as a target state once it is established.

Changing the order of action choices also changed direct action predictions. On validation snapshots, JSON format selected the same action across all three orders for only 20/30 cases. Higher confidence did not reliably mean progress; there were high-confidence wrong choices.

## Failure example

In the JSON pot-delivery rollout, the model rested, walked to the tavern, then chose a burger 14 times in succession. With history it went straight to the tavern and repeated burgers. With planner distances in its labels, it rested for all 16 steps. Every choice was physically legal, but it never pursued the pot goal.

## Method and limits

- 29 development and 30 validation snapshots: four goals crossed with different locations, energy levels, money, and inventories. Already-complete goals are omitted.
- Goals: bring a pot home to Marie, collect 20 clay, reach 160 copper, and return home. The explicit current goal changes while other state is held constant, to test goal sensitivity.
- Three deterministic label-order permutations per snapshot. These repeated decisions are not 90 independent validation examples. The initial fixed-order goal-routing probe is retained separately.
- A correct progress action reduces the shortest legal plan length. Any equally short first step is accepted. We optimize number of actions, not elapsed minutes, social behavior, or personality.
- Six validation rollouts per method, capped at 16 actions: three pot cases, one wages case, one clay case, and one return-home case. Goal completion is checked after executing each choice in the simulator.
- Available choices are concrete tool calls with arguments already enumerated, such as `rest(time=30)` and `consume(item=burger)`. This prevents mismatched tools and arguments; it differs from the two-stage shape filling in `scripts/decide`.
- The simulator mirrors walking distances, energy costs, clay collection/crafting, wages, and rest recovery from the current engine. It uses 30/60-minute rest choices. Think is a distraction without generated text; conversations are excluded. Bringing a pot means reaching home with it because the game has no gift action.
- The existing game does not deduct menu prices when consuming; this simulator follows that behavior. It does not introduce hunger.
- The search is bounded at 10 actions, sufficient for these cases. We replayed every saved rollout to verify state transitions, costs, legality, and terminal conditions.
- Validation uses new numerical states, not a different world or new goal types. Canonical goal wording is shared with development; the separate paraphrase audit tests wording changes. There is one active goal, not competing priorities. This is a small synthetic diagnostic, not a general reliability estimate.

## Recommendation

Represent the active goal explicitly, for example “be home with at least one pot.” Let a small planner use the state and action effects to choose the next tool call. GLiNER can interpret natural-language goals into that catalogue or make optional choices among equally useful actions. Keep a brief history for character flavor and memory; it did not repair planning in these tests.

If the requirement is that GLiNER alone reads all context and plans the next step, these experiments do not support shipping that approach. Fine-tuning on game-specific decision examples or using a model with stronger planning capability would be a separate experiment.

## Reproduce and inspect

Install `uv` and set `GLINER_MODEL` to the existing local model directory, then:

```sh
scripts/experiment-decisions --modes json history question goal_router goal_only planner
# All formats, including immediate outcomes and planner-distance labels:
scripts/experiment-decisions
# Just the sixteen reworded goals:
scripts/experiment-decisions --modes goal_router goal_only --audit-only
```

Use `UV_OFFLINE=1 HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1` after dependencies and the model are cached. `--device cpu` is available. Each run loads the model once.

- [Benchmark script](../experiment-decisions)
- [First seven strategies: predictions](gliner-villager/predictions.jsonl), [summaries and rollouts](gliner-villager/results.json)
- [Explicit question and fixed-order routing probe](gliner-villager-followup/results.json)
- [Goal routing with shuffled labels and paraphrases](gliner-villager-goal-order/results.json)
- [Goal-only routing with shuffled labels and paraphrases](gliner-villager-goal-only/results.json)

Checkpoint revision: `bbe10ff77ebb238777c17d3a8ac9260e30929057`; verified weight SHA-256: `40a5a23ff860dc3dff426cecd1048cacdd29c648c96db209dad818e9686dc997`. Runtime: gliner2 2.0.0, PyTorch 2.14.0, Transformers 4.57.6. The game engine and existing uncommitted edits were not changed.
