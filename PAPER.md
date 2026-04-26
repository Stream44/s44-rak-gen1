*For Technical Readers. Written in partnership with AI.*

(c) April 2026 by Christoph A. Dorn licensed under CC BY-SA 4.0

# The Reflexive Algebraic Kernel: A Stratified-Homoiconic Substrate for Application Architecture

---

## Abstract

We introduce the **Reflexive Algebraic Kernel (RAK)**, a runtime substrate that unifies the conventionally disjoint artefacts of an application — schema, business rules, runtime state, capability policy, user-facing projections, tests, the kernel itself, and the compiler that optimises it — under a single content-addressed, structurally-typed, algebraically-composable regime. The organising principle, which we name **Stratified Homoiconicity**, applies the Lisp tradition of *programs as data* not to a single language stratum but to every level of an OMG MOF four-tier metamodel tower, terminating the regress at the meta-metamodel by a cryptographic fixed point. The kernel is realised as a sixteen-layer downward-import ladder. Each layer realises one well-bounded capability and is grounded in established traditions: structural type theory, content-addressed code, category-theoretic functor composition, capability-based security with macaroon-style attenuation, fuel-monad total interpreters, register-based virtual machines with parity invariants, declarative-from-data deployment, and reactive surface runtimes. We present the architecture as a layer-by-layer elaboration with tabular summaries linking each layer's central concepts to their canonical literature, situate the contribution against the most direct ancestors (the K Framework, Unison, the Kubernetes Resource Model, and macaroon-based authorisation), and discuss the design's limitations and trajectory.

---

## 1. Introduction

### 1.1 The five-artefact fracture

A conventional application is built across five disjoint substrates. The data schema lives in a database migration tool. The business rules live in application code. The runtime state lives in memory and on disk. The authorisation policy lives in a separate identity system. The test artefacts live in yet another framework. Each substrate has its own type system, change-management process, observability story, and failure modes. Most software pain is inter-substrate pain. A field added to an entity must be written into the migration, the model class, the form, the API schema, the policy file, and the test fixture, in something close to the same shape; any one of those that drifts is a future bug. The cost of integration grows with the product of the substrates. We will refer to this throughout as the **five-artefact fracture**.

The thesis of this work is that the fracture is contingent rather than necessary. If schema, code, state, policy, view, and test are all expressed as typed data over a shared substrate — and if the substrate's identity regime is cryptographic content-addressing — then they share an evolution surface, a verification surface, and a refactoring surface. Five artefacts collapse into one wearing five faces.

### 1.2 Prior art

The constituent ideas are not new. McCarthy's 1960 LISP [1] established that programs can be data; Abelson and Sussman's *Structure and Interpretation of Computer Programs* §4.1 [2] developed the meta-circular evaluator that makes the case operational; Smith's 1984 POPL paper on procedural reflection [3] and the CLOS metaobject protocol [4] extended it. The K Framework [5,6] treats language semantics themselves as executable data. Unison [7] makes code definitions content-addressed. The Kubernetes Resource Model [8] generalises declarative-state-with-controllers to operations infrastructure. The capability-security tradition descends from Shapiro's KeyKOS and EROS [9], Mark Miller's *Robust Composition* [10], Yee on capability-based interfaces [11], and the macaroon discipline of Birgisson et al. [12]. The OMG Meta-Object Facility (MOF) [13] gives the four-level stratification framework on which the metamodel tower is built.

What is new in this work is the unification. RAK takes content-addressed code, structural typing with cryptographic conformance, an explicit four-level metamodel tower, capability-based authorisation, an algebra of named transformations, and a reactive projection runtime, and composes them into a single substrate where every layer of the system is reachable through the same identity and evaluation regime.

### 1.3 The proposed framework: Stratified Homoiconicity

Homoiconicity in its classical Lisp formulation means that a program is a data structure in the same language it is written in. Reflection extends this to a system describing and modifying itself at runtime; Smith's 3-Lisp [3] introduced the tower of meta-levels. The OMG MOF tower [13] provides a complementary four-level structure for class-modelling tools: M0 (instances), M1 (models), M2 (metamodels), M3 (meta-metamodel).

In conventional MOF, the M3 stratum's self-conformance is asserted by committee — the OMG publishes a document that states M3 conforms to itself, and tools accept the assertion. RAK takes the strange loop of [14] literally and makes it cryptographic. The kernel computes a content-addressed identifier for its M3 meta-metamodel from the M3 body itself, excluding only the identity and conformance fields from the hash input, then fills those fields with the resulting identifier. The object that results conforms to itself in the strict sense: a third party reading the encoded bytes can compute the same hash and verify the loop has closed. The trust is mathematical [15,16].

Around that fixed point we apply the Lisp tradition at every stratum: M3 is data, M2 is data, M1 is data, M0 is data, and — critically — the engine that evaluates data is itself an M1 datum. The classical meta-circular evaluator returns at the architectural scale: programs are data; schemas are data; state is data; tests are data; the interpreter is data. We name this combined discipline **Stratified Homoiconicity**.

### 1.4 Contributions

This paper makes the following contributions:

1. We describe the **cryptographic strange loop** as a constructive replacement for committee-asserted self-conformance in MOF-style metamodel towers (§3, §4).
2. We articulate the **engine-as-data** discipline: the projection engine that interprets typed application models is itself a typed application model, reconstituted at boot by a small fixed loader (§5.10).
3. We present a **sixteen-layer downward-import ladder** (§5) that decomposes the substrate into named, well-bounded capabilities, each grounded in canonical prior art.
4. We articulate a **four-axis decision rubric** (algebraic / reflexive / performance / clean modelling) for the lift-vs-stay-imperative choice that governs the substrate-minimality axiom (§5.5, §6.2).
5. We integrate **macaroon-style capability attenuation** into the kernel by expressing caveats in the kernel's own algebra, eliminating the separate caveat-evaluation runtime (§5.6).

### 1.5 Organisation of the paper

§2 states the seven axioms that frame the architecture. §3 describes the four-level metamodel tower and its cryptographic termination. §4 presents the layer ladder in tabular form. §5 elaborates each layer, mapping its central concepts to canonical literature. §6 discusses limitations, the architecture's relationship to its closest ancestors, and design trajectory. §7 concludes. §8 acknowledges the human-AI partnership through which the work was developed. References follow.

---

## 2. The seven axioms

The kernel's commitments are stated as seven axioms (Table 1). Each is realised as a concrete mechanism in the layers below. They serve in this paper as the conceptual scaffold the layer walkthrough hangs from.

**Table 1.** The seven axioms of the Reflexive Algebraic Kernel, with realising layers and primary literature.

| # | Axiom | Statement | Primary realising layers | Primary refs. |
|---|---|---|---|---|
| 1 | Content-addressed identity | Every type, morphism, capability, and datum has a deterministic identifier derived from the canonical encoding of its content. | L01, L03, L05 | [7,15,16] |
| 2 | Cryptographic strange loop | The meta-metamodel conforms to itself: its declared conformance target is its own content-addressed identifier. | L03 | [13,14,15] |
| 3 | Engine as data | The kernel's evaluation machinery is declared as a data document and reconstituted at boot by a small fixed-size loader. | L00, L11 | [1,2,3,5,17] |
| 4 | Algebraic composition | Domain logic composes through a typed algebra of named transformations. | L04, L05 | [18,19,20] |
| 5 | Capability authority | All authority is conferred by possession of an unforgeable, content-addressed capability datum, attenuated by caveat. | L07 | [9,10,11,12] |
| 6 | Substrate minimality | The imperative floor is fixed and auditable; additions are governed by a four-axis rubric. | L04, L05 (governing), all layers (governed) | (this work) |
| 7 | Additive extensibility | New capabilities arrive as new data — a kind pack, a morphism document, a specialisation rule — not as new branches in lower-layer code. | L02, L08, L12 | [8,21,22] |

---

## 3. The four-level metamodel tower

The kernel's vertical structure begins with the OMG MOF tower [13]: a chain of conformance M0 ↦ M1 ↦ M2 ↦ M3, with M3 ↦ M3 closing the loop (Figure 1, Table 2). MOF was designed for class-modelling tools; we apply its stratification to a content-addressed runtime substrate.

**Figure 1.** The four-level tower with cryptographic termination.

```
                    ┌─────────────────────────────────┐
                    │  M3   meta-metamodel            │←─┐
                    │       conformsTo = cid(self)    │  │
                    └─────────────────────────────────┘  │  cryptographic
                                    ↑                    │  fixed point [14,15]
                                    │ conformsTo         │
                    ┌─────────────────────────────────┐  │
                    │  M2   metamodels                │  │
                    │       (entity-doc, morphism-doc,│──┘
                    │        capability-doc, ...)     │
                    └─────────────────────────────────┘
                                    ↑
                                    │ conformsTo
                    ┌─────────────────────────────────┐
                    │  M1   models                    │
                    │       (Order, OrderLifecycle,   │
                    │        loginUser, ...)          │
                    └─────────────────────────────────┘
                                    ↑
                                    │ conformsTo
                    ┌─────────────────────────────────┐
                    │  M0   instances                 │
                    │       (a particular Order,      │
                    │        a current session, ...)  │
                    └─────────────────────────────────┘
```

**Table 2.** The four levels of the metamodel tower.

| Level | Role | Examples in the kernel | Cardinality | Primary refs. |
|---|---|---|---|---|
| M3 | Meta-metamodel | The single self-conforming root | One object | [13,14,15] |
| M2 | Metamodels | Schema for entity documents, morphism documents, capability documents, acceptance suite documents, algebra-operator documents, specialisation-rule documents, pluggable-interface contract | A small fixed set, extensible by application | [13,23,24] |
| M1 | Models | Domain entities, lifecycle state machines, action specifications, capability declarations, projection models, the kernel's own morphisms | Open, additive | [13,18,20] |
| M0 | Instances | Runtime data — particular orders, sessions, projection trees | Open, runtime | [13] |

The conformance-checking mechanism is structural [23,25]. Two types with the same encoded shape are the same type, regardless of where they were declared. JSON Schema 2020-12 [24] provides the structural substrate. Conformance is verified at registration time and the verified identifier is content-addressed [15,16], so any later observer can re-verify in O(1) without re-walking the schema.

---

## 4. The layer ladder

The kernel is organised as a strict downward-import ladder of sixteen layers (Table 3). Higher-numbered layers may depend on lower-numbered layers; the reverse is forbidden. Crosscutting peers (`bin/`, `examples/`, `tests/`) consume the ladder but are not part of it.

**Table 3.** The sixteen-layer ladder, with role, central concepts, and primary literature for each layer.

| # | Layer | Role | Central concepts | Primary refs. |
|---|---|---|---|---|
| L00 | Model | The kernel itself as a loaded datum | Meta-circular evaluation; engine-as-data | [1,2,3,17] |
| L01 | Foundation | Primitive type contracts, canonical encoding, equality | Content-addressed identity; structural typing | [15,16,23,24] |
| L02 | Metamodels | M2 schema declarations | MOF stratification; pluggable-interface contract | [13,21,22] |
| L03 | Tower | M3 fixed-point bootstrap, type registry, conformance engine | Cryptographic strange loop; structural conformance; trait composition | [13,14,15,23,26] |
| L04 | Expression | The source-mode algebra interpreter | Total Expression Calculus; fuel-metered termination; semantic reference | [18,27,28,29] |
| L05 | Morphism | Named, content-addressed transformations + 5 type-system extension engines | Content-addressed code; refinement types; proof-carrying data; trait composition | [7,20,30,31,32,33] |
| L06 | Process | Declarative state-machine engine | Coalgebraic transitions; actor model | [34,35,36] |
| L07 | Agency | Intent-action boundary, capability authorisation, storage routing | Object capabilities; macaroon attenuation; W3C Annotation Body/Target | [9,10,11,12,37,38] |
| L08 | Kinds | Pluggable substrate (storage, surfaces, auth, transport) | Pluggable interface; event sourcing; reactive surfaces | [21,22,39,40,41,42] |
| L09 | Demand | Model loader, demand engine, unfolding functor | IO-monad protocol; IPLD selectors; Holon; Unfolding | [8,18,19,43,44,45] |
| L10 | Acceptance | Tree-of-7-entities behavioural conformance | BDD lineage; specification by example; anti-Hyrum's-Law | [46,47,48] |
| L11 | Projection | Kind-polymorphic projection engine; meta-circular kernel reload | UI as functor; tagless-final algebra; reactive runtime | [17,18,49,50,51] |
| L12 | Compiler | AOT compiler + opcode VM with parity invariants | Register VMs; type specialisation; source/compiled parity | [52,53,54,55,56] |
| L13 | Facade | Single public import surface; SDS-aware boot | Facade pattern; subpath-exports enforcement | [57,58] |
| L14 | Hosts | Transport adapters (HTTP+WS, REST, CLI, generic SDS host) | LiveView reactive transport; operator-from-manifest; REPL-over-transport | [8,42,59,60] |
| L15 | CLI | Command surface consumed by the binary | Command pattern; example-name indirection (kubectl model) | [57,61] |

The ladder is presented as a flow diagram in Figure 2.

**Figure 2.** Imports flow strictly downward.

```
  ┌──────────┐
  │ L15-cli  │  command surface
  └────┬─────┘
       ↓
  ┌──────────┐
  │ L14-hosts│  transport adapters (viewer, api-host, cli-host, sds-host)
  └────┬─────┘
       ↓
  ┌──────────┐
  │ L13-facade │  single public import surface
  └────┬─────┘
       ↓
  ┌────────────┐
  │ L12-compiler │  AOT compiler + opcode VM
  └────┬─────┘
       ↓
  ┌────────────────┐
  │ L11-projection │  kind-polymorphic engine; meta-circular reload
  └────┬─────┘
       ↓
  ┌──────────────┐
  │ L10-acceptance │  behavioural conformance as data
  └────┬─────┘
       ↓
  ┌──────────┐
  │ L09-demand │  compilation, materialisation, unfolding
  └────┬─────┘
       ↓
  ┌─────────┐
  │ L08-kinds │  pluggable substrate
  └────┬─────┘
       ↓
  ┌──────────┐
  │ L07-agency │  intent, capabilities, storage routing
  └────┬─────┘
       ↓
  ┌───────────┐
  │ L06-process │  state-machine engine
  └────┬─────┘
       ↓
  ┌────────────┐
  │ L05-morphism │  algebraic backbone + 5 type-system engines
  └────┬─────┘
       ↓
  ┌──────────────┐
  │ L04-expression │  source-mode interpreter (semantic reference)
  └────┬─────┘
       ↓
  ┌─────────┐
  │ L03-tower │  M3 fixed point + type registry + conformance
  └────┬─────┘
       ↓
  ┌──────────────┐
  │ L02-metamodels │  M2 schema declarations
  └────┬─────┘
       ↓
  ┌──────────────┐
  │ L01-foundation │  primitive type contracts, canonical encoding
  └────┬─────┘
       ↓
  ┌─────────┐
  │ L00-model │  kernel as data (single YAML asset)
  └─────────┘
```

---

## 5. Elaboration

The walkthrough is read from the bottom up: each rung adds one capability, building on what the lower rungs supply.

### 5.1 L00 — The kernel as data

The bottom rung contains no code. It is a single declarative document that *is* the kernel: it declares the types the kernel registers, the morphisms it evaluates, the state machines it instantiates, the actions it dispatches, the capabilities it issues, and the kind packs it loads. A small loader at L11 reconstitutes a fully functional kernel from the document. The architectural pattern is meta-circular interpretation [1,2,3] generalised from a programming-language semantics to a typed application substrate, in the family of K [5,6], Lean 4 macros [62], and PyPy/RPython [17]. The Futamura projection lineage [63] is the relevant theoretical lens.

### 5.2 L01 — Foundation

The foundation layer holds the primitive vocabulary on which everything else builds: type references, datums, content identifiers, canonical encoding, equality, and the shape contracts of higher-layer constructs. Two ideas earn separate citation. **Canonical encoding** is the operation that turns an in-memory value into a deterministic byte string suitable for hashing — the discipline Git [16], IPFS [15], and Unison [7] all rely on. **Structural type contracts** define a type by its encoded shape, not by name — Cardelli's structural subtyping [23] generalised through JSON Schema 2020-12 [24], Avro [26], and the GraphQL Interfaces model [25].

### 5.3 L02 — Metamodels

The metamodel layer is the M2 stratum: a small set of schema documents declaring what an M1 model can be. The pluggable-interface contract is the kernel's mechanism for additive extensibility — a new storage backend, surface, or authentication scheme is declared as a metamodel-conforming document and routed through registration. The structural family is OSGi [21], Eclipse extension points [22], and Kubernetes Custom Resource Definitions [8].

### 5.4 L03 — Tower

The tower layer is where the cryptographic strange loop is computed and the metamodel registry is populated. At boot, the layer hashes its M3 meta-metamodel — with identity and conformance fields excluded — and fills those fields with the resulting hash. The strange loop closes; the closure is verifiable. From that point, every type registration runs through structural validation against M3, parent resolution, level check, and validation against the parent's schema. Schema composition [25,32] and forward/backward compatibility analysis [26,64] live at this layer. The reader will recognise the discipline from Apache Avro [26], Protobuf wire compatibility [64], and the structural-subtyping literature [23].

### 5.5 L04 — Expression

A morphism is an expression: a node-tagged tree of operations with leaves that are values and interior nodes drawn from `lambda`, `apply`, `let`, `match`, `record`, `array`, plus arithmetic, comparison, and structural builtins. The expression layer is the source-mode interpreter for these trees.

**Termination by construction** is enforced by gas metering [27]: every recursive evaluation step decrements a shared counter; exhaustion produces a typed error. The pattern follows Wasmi's per-instruction fuel metering, the [Total Expression Calculus](#) of [29], Turner's *Total Functional Programming* [28], and Agda [65].

**The interpreter as semantic reference** is the layer's defining role. The expression evaluator is the ground-truth definition of what a morphism means. A faster execution path will exist higher in the ladder, parity-tested against this one. The discipline matches V8 Ignition vs TurboFan [54], the BEAM interpreter and its JIT [53], and LuaJIT's `-j off` invariant [55].

### 5.6 L05 — Morphism

A morphism is a typed transformation `A → B` with a stable name, content-addressed identifier, source type, target type, and body — either an expression tree or a typed handler reference. The discipline is Unison's [7]: code is identified by hash, not by name; renaming, moving, or re-importing does not change identity.

Five auxiliary engines sit around the morphism registry. **Refinement types** narrow a base type by predicate, in the Liquid Haskell tradition [30,31]. **Branding** introduces nominal isolation atop the structural type system. **Proof-carrying data** treats boolean predicates as named propositions and witnesses, in the Curry–Howard correspondence and Necula's *Proof-Carrying Code* [33]. **Dependent typing** allows type families parameterised by values, in the Martin-Löf [66] / Idris [67] lineage. **Trait composition** assembles partial schemas into composite types by flat-merge [25,32].

The lift-vs-stay-imperative choice — which TypeScript blocks become morphisms and which remain imperative — is governed by a **four-axis rubric**: (1) *algebraic*: pure typed transformation? (2) *reflexive*: does the logic walk the kernel's own declared seams? (3) *performance*: is per-call interpreter overhead acceptable? (4) *clean modelling*: are inputs and outputs nameable as tower contracts? A `yes/yes/acceptable/yes` block lifts; a `no` on (1), (2), or (4) stays imperative; a `no` only on (3) lifts but is marked compile-mode-recommended for L12. The rubric is the substrate-minimality axiom in operational form.

### 5.7 L06 — Process

A state machine in the kernel is a declarative document, not compiled code. Its mathematical home is the **coalgebra**: a function $\alpha: S \times E \to S$, the dual of algebraic constructors that build values up. Jacobs's *Introduction to Coalgebra* [34] is the standard text; the application to system specification descends from Lamport's TLA+ [35] and Harel's Statecharts [68]. The actor lineage [36] underwrites the kernel's commitment to address each state-machine instance as a self-contained entity.

The engine has no custom interpreter. The four operations a state machine exposes — step, run, reachable-states, verify-invariants — are themselves expressions in the kernel's algebra, evaluated by the L04 interpreter.

### 5.8 L07 — Agency

The agency layer is where intention becomes effect. The conceptual centrepiece is the distinction between **Intent** and **Action**: an *intent* is a content-addressed datum recording what was attempted; an *action* is the typed specification of what may be attempted. The body/target distinction mirrors the W3C Web Annotation Model [37].

The authority model is **object capabilities**, not access-control lists. The lineage runs through Shapiro [9], Miller [10], Yee [11], with the classical Confused Deputy [38] failure mode of ACL systems structurally avoided. **Macaroons** [12] solve delegation: a holder of a capability produces an attenuated capability for another holder by adding caveats — predicates over the invocation context — that the new holder cannot remove. Caveat verification is decentralised.

What is distinctive in our implementation is that caveats are expressed in the kernel's own algebra. A caveat is a `KernelExpression` predicate evaluated by the same L04 interpreter that evaluates morphisms; no separate caveat-evaluation runtime exists.

### 5.9 L08 — The pluggable substrate

Every layer below L08 is generic with respect to where state lives, what surface a view renders to, and how transport carries actions. L08 is where that genericity meets the concrete world. The layer holds **kind packs** — adapters, each declaring its identity and conforming to a metamodel pluggable-interface contract. Four families live here: storage spaces (event-sourced [39,40] keyed-value stores and append-only journals); projection surfaces (HTML+WebSocket, REST, CLI), authenticating against the macaroon model at the surface boundary; auth and session; transport adapters. Each is interchangeable with another implementing the same contract.

### 5.10 L09 — Demand

The demand layer sits at the hinge between declaration and execution. **Compilation** turns a YAML model document into runtime artefacts and produces a `ModelBoot` — a narrow public surface (`submit`, `getState`, `setState`, `onEvent`, `issueCapability`) — that controls the booted application without exposing its internals. The mental model is the Kubernetes Resource Model [8] generalised one stratum lower.

**Materialisation** addresses the asynchronous-data problem through the two-phase **IO-monad protocol** of Wadler [18]: an action's expression is surveyed for its data requirements before evaluation; the requirements are resolved into a *loading plan*; the plan is executed; only when the context is hydrated does the action evaluate. The traversal language is structurally IPLD selectors [43]; the streaming model is Reactive Streams [19], with Akka Streams [69] and RxJS [70] as direct comparators.

**Unfolding** [44] is the procedure that takes a seed type and walks it through five strata — identity, structure, dynamics, agency, interface — producing a fully-realised application from a small declaration. The mathematical home is the functor [20]; the philosophical home is Koestler's [Holon](https://en.wikipedia.org/wiki/Holon_(philosophy)) [45].

### 5.11 L10 — Acceptance

Tests in the kernel are first-class data. A test suite is a tree-structured document with seven entities (persona, seed, step, assertion, scenario, use case, suite). The structure is a tree, not a sequence: every root-to-leaf path is an independent execution trace; all traces run; all must pass for the suite to pass. The discipline matches Dan North's BDD lineage [46] and Adzic's *Specification by Example* [47], extended to a branching structure.

The acceptance engine never reaches inside the kernel beyond the seven public methods of `ModelBoot`. The architectural commitment is the **anti-Hyrum's-Law** [48] one: internal refactoring cannot break a passing suite without also changing observable behaviour.

### 5.12 L11 — Projection

The projection layer maps from data, processes, and authority into user-facing surfaces. The thesis comes from category theory: a user interface is a **functor** [20] from the data-process-agency category to a target category indexed by the surface kind:

$$\mathcal{P}_k: \mathcal{W} \times \mathcal{Q} \times \mathcal{C} \longrightarrow \mathcal{T}_k$$

where $\mathcal{W}$ is world handles, $\mathcal{Q}$ is queries, $\mathcal{C}$ is the session capability scope, and $\mathcal{T}_k$ is a kind-indexed target category. The capability scope makes the functor monotone in caps. The shared algebra is encoded **tagless-final** [49]: each surface is an interpreter of the same algebra; adding a surface means adding an interpreter, not changing the algebra.

The reactive runtime model — static/dynamic algebra split, path-keyed wire frame, per-reference subscription, hierarchically-scoped context, typed effect adapter — has direct counterparts in Phoenix LiveView [50] and Solid.js [51].

The reflexive seam lives at this layer. The projection engine that interprets the algebra is itself an instance of the algebra: a small loader at L11 reconstitutes the running engine from the L00 document. The kernel projects itself.

### 5.13 L12 — Compiler

The expression interpreter at L04 is the semantic reference. It is intentionally unoptimised; its allocation pattern is uniform; its semantics are transparent. For a morphism evaluated thousands of times per render, that simplicity has a cost. The compiler layer addresses the cost.

The compiler lowers expression trees through a sequence of passes into register-based bytecode. The bytecode runs on a small VM in a tight dispatch loop. Register VMs out-perform stack VMs by 15–50% on the same work [52]. The architecture is recognisable from V8's Ignition [54], the BEAM [53], LuaJIT [55], and CPython's specialising adaptive interpreter [56].

Two disciplines distinguish the kernel's compiler. **Type specialisation** is registered as data: each rule is a content-addressed declaration; new rules arrive as new files. **Source/compiled parity** is a runtime mode, not a test fixture: both paths run on every invocation and a divergence produces a typed error. A divergence is a compiler bug, never a specification disagreement.

### 5.14 L13 — Facade

The facade is the kernel's single public import surface. Internal layers are hermetic: a consumer who attempts to reach into them gets a module-not-found error before any code runs. The discipline matches the classical Facade pattern [57] at the design level and the Node.js subpath-exports field [58] at the module-resolution level. The kernel's contractual surface is the surface the facade exposes, not the surface the implementation happens to permit.

### 5.15 L14 — Hosts

The kernel's projection algebra is transport-agnostic. The host layer is where transport opinions are stated, once per transport. Each host realises the projection-host contract as a transport that receives output from a projection backend, delivers it to an external consumer, and channels the consumer's actions back. The HTTP+WebSocket host follows the LiveView [50] reactive contract; the REST host bootstraps a projection kernel and routes requests through a configured pipeline morphism; the CLI host provides a line-oriented REPL structurally analogous to the IPython messaging protocol [59] and SLIME [60]; a generic host reads a sovereign-data-space declaration and boots an entire node tree from the manifest, applying the operator-from-manifest pattern [8].

### 5.16 L15 — CLI

The top of the ladder is the human-facing command surface: argument parsing, subcommand dispatch, exit code. The discipline of note is **example-name indirection**: the kernel ships with a registry of examples discovered at runtime by walking the filesystem; the binary never names a specific example in its source. The kernel binary is decoupled from the set of registered examples, the same way `kubectl` plug-ins [61] are decoupled from the kubectl binary.

---

## 6. Discussion

### 6.1 Closest ancestors

Three projects are the most direct ancestors of this work (Table 4). The contribution claimed here is the unification, not novelty in any single dimension.

**Table 4.** Closest ancestors and the dimension RAK extends.

| Ancestor | Discipline | What this work extends |
|---|---|---|
| K Framework [5,6] | Language semantics as executable data | Application substrate, not just language semantics |
| Unison [7] | Code identified by content hash | Recursively applied at every MOF stratum, including the type system |
| Kubernetes Resource Model [8] | Declarative state with controllers | Lifted to language-runtime granularity; CIDs replace etcd as identity |
| Macaroons [12] | Content-addressed authority with attenuation | Caveat language is the kernel's own algebra |

### 6.2 Limitations

Several specific limitations are inherent in the current design.

**Refinement subtype checking is sample-based.** L05's `RefinementEngine.isSubtype` is conservative — evaluated over numeric sample points — not a formal SMT-bridged proof. A future direction is to integrate Z3 [71] or Bitwuzla, upgrading refinement subtyping from conservative to verified for numeric domains.

**The compiler's parity invariant is a runtime observation, not a proof.** The source/compiled parity discipline tests equivalence on every invocation rather than proving equivalence statically. A formal-methods extension — verified compilation following the CompCert approach [72] — would replace observational parity with mechanically-checked refinement. This is exploratory and has no current spec.

**The four-axis rubric is heuristic.** §5.6's rubric directs the lift-vs-stay-imperative decision but does not formalise the decision rule. The rubric is repeatable enough that two engineers reading the same block reach the same verdict; it is not a theorem. Mechanising the rubric would require formalising "reflexive" and "clean modelling" in a way the current draft does not.

**Distributed merge semantics are not realised.** Multi-node concurrency resolution via Merkle-CRDT merge morphisms [73] is named in the chain corpus but not implemented. The kernel's storage layer warns of "eventual atomicity only" when a transaction spans multiple spaces.

### 6.3 Trajectory

The forward direction is set primarily by four design tracks. (1) Closing the parity battery between the imperative and meta-circular projection kernels would complete RAK-3 (engine as data) by retiring the imperative kernel. (2) Implementing the five-primitive reactive runtime — static/dynamic split, path-keyed wire frame, per-reference subscription, hierarchically-scoped context, typed effect adapter — under the LiveView [50] / Solid [51] influence pattern would close the gap between first-render and full-reactive-session at the HTML+WebSocket surface. (3) Additional kind packs (TUI, JSON-RPC agent) extending the projection-kind functor across new target categories. (4) Lifting further morphism families from imperative TypeScript using the four-axis rubric, using the parity gate as the regression harness.

---

## 7. Conclusion

We have presented the **Reflexive Algebraic Kernel**, a runtime substrate that unifies the conventionally disjoint substrates of an application under the discipline of **Stratified Homoiconicity**: the Lisp tradition of programs-as-data applied to every level of an OMG MOF metamodel tower, terminated by a cryptographic fixed point at the meta-metamodel. The architecture is realised as a sixteen-layer downward-import ladder, each layer adding one well-bounded capability grounded in established literature. The seven axioms (§2) state the architecture's commitments; the layer ladder (§4, §5) decomposes them into named seams; the four-axis rubric (§5.6) operationalises the substrate-minimality axiom; the discussion (§6) situates the work against its closest ancestors and articulates its limitations.

The contribution is the unification, not novelty in any single component. Every constituent discipline — content-addressing, structural typing, MOF stratification, capability-based authority, macaroon attenuation, reactive surfaces, register-VM compilation with parity invariants, total interpreters with fuel metering, declarative-from-data deployment — is established in the literature this paper cites. What is new is the consistent application of all of them to a single substrate, with the engine that evaluates the substrate being itself an instance of the substrate's data.

---

## 8. Acknowledgements

This work was developed in a sustained partnership between the human author and large language models acting as research collaborators. The partnership has a specific shape that we record explicitly here, in the spirit of [74,75].

**The architectural concepts and the corpus of design dissertations are the author's.** The seventeen "chain" notes that constitute the kernel's design genealogy (a body of work running to roughly 12,000 lines of prose) were produced through a multi-vibe code-in-chain (MVCIC) [76] collaboration in which the author authored the prompts, framed each successive question, decided which directions to pursue, and exercised final editorial judgement. The language models' role in producing those notes was synthesis from prior chain notes, technical grounding from the literature surveyed, and prose drafting under the author's direction.

**The fourteen design specifications** that translate the chain into implementation contracts were produced under the same partnership shape: the author specified what each spec needed to govern; language models drafted; the author revised, accepted, or rejected.

**The implementation** of the kernel was executed via an autonomous-agent swarm controller (Forge) directing language-model agents through programme-pack and work-pack contracts. The agents wrote code, ran tests, and reported. The author authored the programme-pack briefs that scoped each unit of work and made every architectural decision the briefs encoded.

**This paper** was drafted by an Anthropic Claude model (Opus 4.7, 1M context) at the author's specific direction, working from: (a) the seventeen chain dissertations, (b) the fourteen design specifications, (c) sixteen per-layer summary documents that had themselves been produced in this same session by sixteen subordinate language-model agents (Anthropic Claude Sonnet 4.6) reading the chain, the specifications, and the source filesystem. The author specified the structure (academic paper format, enumerated references, tables, diagrams, AI-partnership disclosure); the orchestrator drafted; the author retains editorial control over the final form.

The exact specification of the partnership for this paper is therefore: the author is the architect and editor; the language models are research collaborators that synthesise, draft, and execute under the author's direction. Errors of fact, omission, or framing in this document remain the author's responsibility.

---

## References

[1] J. McCarthy, "Recursive functions of symbolic expressions and their computation by machine, Part I," *Communications of the ACM*, vol. 3, no. 4, pp. 184–195, 1960. <https://www-formal.stanford.edu/jmc/recursive.pdf>

[2] H. Abelson and G. J. Sussman, *Structure and Interpretation of Computer Programs*, 2nd ed. MIT Press, 1996. §4.1 The Metacircular Evaluator. <https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/6515/sicp.zip/index.html>

[3] B. C. Smith, "Reflection and semantics in LISP," in *Proc. POPL '84*, ACM, 1984, pp. 23–35. <https://dl.acm.org/doi/10.1145/800017.800513>

[4] G. Kiczales, J. des Rivières, and D. G. Bobrow, *The Art of the Metaobject Protocol*. MIT Press, 1991.

[5] G. Roşu and T.-F. Şerbănuţă, "An overview of the K semantic framework," *J. Logic & Algebraic Programming*, vol. 79, no. 6, pp. 397–434, 2010. <https://kframework.org/papers/k-jlap-2010.pdf>

[6] K Framework Project. <https://kframework.org/>

[7] Unison Computing, "The Big Idea." <https://www.unison-lang.org/docs/the-big-idea/>

[8] Kubernetes Project, "Custom Resources." <https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/>; "Operator pattern." <https://kubernetes.io/docs/concepts/extend-kubernetes/operator/>

[9] J. S. Shapiro, J. M. Smith, and D. J. Farber, "EROS: A fast capability system," in *Proc. SOSP '99*, ACM, 1999, pp. 170–185. <https://dl.acm.org/doi/10.1145/319151.319163>

[10] M. S. Miller, *Robust Composition: Towards a Unified Approach to Access Control and Concurrency Control*, Ph.D. thesis, Johns Hopkins University, 2006. <http://www.erights.org/talks/thesis/>

[11] K.-P. Yee, *Secure Interaction Design and the Principle of Least Authority*, Ph.D. thesis, UC Berkeley, 2003. <https://zesty.ca/pubs/yee-phd.pdf>

[12] A. Birgisson, J. G. Politz, Ú. Erlingsson, A. Taly, M. Vrable, and M. Lentczner, "Macaroons: Cookies with contextual caveats for decentralized authorization in the cloud," in *Proc. NDSS '14*, 2014. <https://research.google/pubs/macaroons-cookies-with-contextual-caveats-for-decentralized-authorization-in-the-cloud/>

[13] Object Management Group, *Meta Object Facility (MOF) Core Specification*, v2.5.1, ISO/IEC 19508:2014. <https://www.omg.org/spec/MOF/2.5.1/>

[14] D. R. Hofstadter, *Gödel, Escher, Bach: An Eternal Golden Braid*. Basic Books, 1979.

[15] J. Benet, "IPFS — Content Addressed, Versioned, P2P File System," *arXiv:1407.3561*, 2014. <https://arxiv.org/abs/1407.3561>

[16] R. C. Merkle, "A digital signature based on a conventional encryption function," in *Advances in Cryptology — CRYPTO '87*, LNCS 293, Springer, 1988, pp. 369–378. <https://link.springer.com/chapter/10.1007/3-540-48184-2_32>; *Git Internals — Git Objects.* <https://git-scm.com/book/en/v2/Git-Internals-Git-Objects>

[17] PyPy Project, "What is RPython?" <https://pypy.org/posts/2007/02/what-is-rpython-67258847853257574.html>

[18] P. Wadler, "Monads for functional programming," in *Advanced Functional Programming*, LNCS 925, Springer, 1995. <https://homepages.inf.ed.ac.uk/wadler/papers/marktoberdorf/baastad.pdf>

[19] Reactive Streams Initiative. <https://www.reactive-streams.org/>

[20] S. Eilenberg and S. Mac Lane, "General theory of natural equivalences," *Trans. AMS*, vol. 58, pp. 231–294, 1945. <https://www.ams.org/journals/tran/1945-058-00/S0002-9947-1945-0013131-6/>

[21] OSGi Alliance, *OSGi Core Release 8 Specification*, 2020. <https://www.osgi.org/specifications/>

[22] Eclipse Foundation, "Extensions and Extension Points." <https://wiki.eclipse.org/FAQ_What_are_extensions_and_extension_points%3F>

[23] L. Cardelli, "A semantics of multiple inheritance," *Information and Computation*, vol. 76, nos. 2–3, pp. 138–164, 1988 (preprint 1984). <https://lucacardelli.name/Papers/Inheritance.A4.pdf>

[24] IETF, *JSON Schema*, Draft 2020-12. <https://json-schema.org/draft/2020-12/json-schema-core>

[25] GraphQL Foundation, "Schema and Types — Interfaces." <https://graphql.org/learn/schema/#interfaces>

[26] Apache Software Foundation, *Apache Avro 1.11.1 Specification*. <https://avro.apache.org/docs/1.11.1/specification/>

[27] Wasmi Project, *WebAssembly Interpreter*. <https://github.com/wasmi-labs/wasmi>

[28] D. A. Turner, "Total functional programming," *J. Universal Computer Science*, vol. 10, no. 7, pp. 751–768, 2004. <https://www.jucs.org/jucs_10_7/total_functional_programming/jucs_10_07_0751_0768_turner.pdf>

[29] J. Reynolds, "Definitional interpreters for higher-order programming languages," in *Proc. ACM Annual Conference*, 1972, pp. 717–740. (Higher-Order and Symbolic Computation reprint 1998.)

[30] P. Rondon, M. Kawaguchi, and R. Jhala, "Liquid types," in *Proc. PLDI '08*, ACM, 2008. <https://goto.ucsd.edu/~rjhala/liquid/liquid_types.pdf>

[31] T. Freeman and F. Pfenning, "Refinement types for ML," in *Proc. PLDI '91*, ACM, 1991. <https://www.cs.cmu.edu/~rwh/papers/refinements/refinements.pdf>

[32] M. Odersky et al., *The Scala Language Specification*, "Traits." <https://docs.scala-lang.org/tour/traits.html>

[33] G. C. Necula, "Proof-carrying code," in *Proc. POPL '97*, ACM, 1997, pp. 106–119. <https://dl.acm.org/doi/10.1145/263699.263712>

[34] B. Jacobs, *Introduction to Coalgebra: Towards Mathematics of States and Observation*. Cambridge University Press, 2016. <https://www.cs.ru.nl/B.Jacobs/CLG/JacobsCoalgebraIntro.pdf>

[35] L. Lamport, *Specifying Systems: The TLA+ Language and Tools for Hardware and Software Engineers*. Addison-Wesley, 2002. <https://lamport.azurewebsites.net/tla/tla.html>

[36] C. Hewitt, P. Bishop, and R. Steiger, "A universal modular actor formalism for artificial intelligence," in *Proc. IJCAI*, 1973. <https://www.researchgate.net/publication/220775134_A_Universal_Modular_Actor_Formalism_for_Artificial_Intelligence>

[37] R. Sanderson, P. Ciccarese, and B. Young (eds.), *Web Annotation Data Model*, W3C Recommendation, 23 February 2017. <https://www.w3.org/TR/annotation-model/>

[38] N. Hardy, "The Confused Deputy (or why capabilities might have been invented)," *ACM SIGOPS Operating Systems Review*, vol. 22, no. 4, pp. 36–38, 1988. <https://dl.acm.org/doi/10.1145/54289.871709>

[39] G. Young, "CQRS Documents." 2010. <https://cqrs.files.wordpress.com/2010/11/cqrs_documents.pdf>

[40] M. Fowler, "Event Sourcing." <https://martinfowler.com/eaaDev/EventSourcing.html>

[41] Phoenix LiveView Project. <https://hexdocs.pm/phoenix_live_view/>

[42] Hotwire Turbo Project. <https://turbo.hotwired.dev/>

[43] IPLD Selectors Specification. <https://specs.ipld.io/selectors/selectors.html>

[44] S. Eilenberg and S. Mac Lane, op. cit. [20]; treatment of unfolding via functor composition.

[45] A. Koestler, *The Ghost in the Machine*. Hutchinson, 1967. <https://en.wikipedia.org/wiki/Holon_(philosophy)>

[46] D. North, "Introducing BDD," *Better Software*, March 2006. <https://dannorth.net/introducing-bdd/>

[47] G. Adzic, *Specification by Example: How Successful Teams Deliver the Right Software*. Manning, 2011.

[48] H. Wright et al., "Hyrum's Law." <https://www.hyrumslaw.com/>

[49] O. Kiselyov, "Tagless-final style." <https://okmij.org/ftp/tagless-final/index.html>

[50] Phoenix LiveView Project, "Assigns and HEEx Templates." <https://hexdocs.pm/phoenix_live_view/assigns-eex.html>

[51] Solid.js Project, "Reactivity — Signals." <https://docs.solidjs.com/concepts/signals>

[52] Y. Shi and K. Casey, "Virtual machine showdown: Stack vs. registers," *ACM Transactions on Architecture and Code Optimization*, vol. 4, no. 4, art. 21, 2008. <https://dl.acm.org/doi/10.1145/1328195.1328197>

[53] Erlang/OTP Team, "A Brief BEAM Primer." <https://www.erlang.org/blog/a-brief-beam-primer/>

[54] V8 Project, "Launching Ignition and TurboFan." <https://v8.dev/blog/launching-ignition-and-turbofan>

[55] M. Pall, *LuaJIT FAQ.* <https://luajit.org/faq.html>

[56] M. Shannon, "PEP 659 — Specializing Adaptive Interpreter," CPython, 2021. <https://peps.python.org/pep-0659/>

[57] E. Gamma, R. Helm, R. Johnson, and J. Vlissides, *Design Patterns: Elements of Reusable Object-Oriented Software*. Addison-Wesley, 1994. §4.7 Facade.

[58] Node.js Project, "Subpath exports." <https://nodejs.org/api/packages.html#subpath-exports>

[59] Jupyter Project, *IPython Messaging Protocol*. <https://jupyter-client.readthedocs.io/en/stable/messaging.html>

[60] SLIME — The Superior Lisp Interaction Mode for Emacs. <https://common-lisp.net/project/slime/>

[61] Kubernetes Project, "Extend kubectl with plug-ins." <https://kubernetes.io/docs/tasks/extend-kubectl/kubectl-plugins/>

[62] Lean Project, *Lean 4 Metaprogramming.* <https://leanprover.github.io/lean4/doc/metaprogramming.html>

[63] Y. Futamura, "Partial evaluation of computation process — an approach to a compiler-compiler," *Systems, Computers, Controls*, vol. 2, no. 5, pp. 45–50, 1971. (Reprinted in *Higher-Order and Symbolic Computation*, vol. 12, 1999.) <https://www.brics.dk/~hosc/local/HOSC-12-4-pp381-391.pdf>

[64] Google, *Protocol Buffers — Updating a Message Type.* <https://protobuf.dev/programming-guides/proto3/#updating>

[65] U. Norell, "Dependently typed programming in Agda," in *Advanced Functional Programming*, LNCS 5832, Springer, 2009. <https://agda.readthedocs.io/en/latest/>

[66] P. Martin-Löf, "An intuitionistic theory of types: Predicative part," in *Logic Colloquium '73*, North-Holland, 1975, pp. 73–118.

[67] Idris Project. <https://www.idris-lang.org/>

[68] D. Harel, "Statecharts: A visual formalism for complex systems," *Science of Computer Programming*, vol. 8, no. 3, pp. 231–274, 1987. <https://www.sciencedirect.com/science/article/pii/0167642387900359>

[69] Lightbend, *Akka Streams Documentation.* <https://doc.akka.io/docs/akka/current/stream/>

[70] RxJS Project. <https://rxjs.dev/>

[71] L. de Moura and N. Bjørner, "Z3: An efficient SMT solver," in *Proc. TACAS '08*, LNCS 4963, Springer, 2008, pp. 337–340.

[72] X. Leroy, "Formal verification of a realistic compiler," *Communications of the ACM*, vol. 52, no. 7, pp. 107–115, 2009.

[73] M. Kleppmann and A. R. Beresford, "A conflict-free replicated JSON datatype," *IEEE Trans. Parallel Distrib. Syst.*, vol. 28, no. 10, pp. 2733–2746, 2017.

[74] Nature Editorial, "Tools such as ChatGPT threaten transparent science; here are our ground rules for their use," *Nature*, vol. 613, p. 612, 2023. <https://www.nature.com/articles/d41586-023-00191-1>

[75] ACM, *Policy on Authorship.* <https://www.acm.org/publications/policies/new-acm-policy-on-authorship>

[76] D. Campos Ramos, *MVCIC: A Human-MultiAI Orchestration Method*, EchoSystems, 20 February 2026. <https://echosystems.ai/MVCIC_Human-MultiAI_Orchestration_Method_CamposRamos_2026-02-20.pdf>

---

(c) April 2026 by Christoph A. Dorn licensed under CC BY-SA 4.0
