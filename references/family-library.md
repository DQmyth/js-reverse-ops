# Family Library

This library turns recurring reverse targets into reusable operating patterns.

## Remote CoreJS Monolith

- trigger signals: thin HTML shell, external `match*.js`, tail-heavy request builder
- misleading signals: page helpers, login info endpoints
- first actions:
  1. extract request contract
  2. inspect tail neighborhood
  3. verify runtime endpoint

## Helper Page Plus Protected Runtime

- trigger signals: page HTML exposes `/api/answer` or similar helper endpoint while external challenge script loads
- misleading signals: helper endpoint looks complete enough to be mistaken for the protected request
- first actions:
  1. mark helper risk
  2. capture runtime request
  3. compare helper contract against runtime endpoint

## Launcher Page Plus App Shell

- trigger signals: outer page links into `/data`, Flutter, CanvasKit, generated bundle runtime
- misleading signals: launcher page looks like an inline challenge
- first actions:
  1. capture launcher page
  2. open data shell
  3. treat app shell runtime as the protected path

## Module or WASM Hidden Endpoint

- trigger signals: module scripts, `modulepreload`, Yew, wasm, but no obvious `/api/...` string
- misleading signals: absence of endpoint strings in loaded source
- first actions:
  1. freeze live request body
  2. record module and wasm artifacts
  3. recover upstream locals from paused frames or hooks

## Cookie Written After Challenge Response

- trigger signals: request uses cookie that is absent on first load and appears after challenge or preflight
- misleading signals: assuming every cookie is front-end generated
- first actions:
  1. instrument `document.cookie`
  2. capture helper/preflight responses
  3. prove write timing against consuming request

## Runtime Non-200 but Contract Partially Correct

- trigger signals: runtime endpoint and fields look plausible, server still rejects
- misleading signals: assuming the algorithm alone is wrong
- first actions:
  1. inspect trigger path
  2. inspect prerequisite state
  3. preserve rejected sample as a risk-bearing artifact
