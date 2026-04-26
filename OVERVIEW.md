*For Technical Readers. Written in partnership with AI.*

(c) April 2026 by Christoph A. Dorn licensed under CC BY-SA 4.0

# The Reflexive Algebraic Kernel

*A conceptual overview*

---

## Abstract

This document introduces the **Reflexive Algebraic Kernel (RAK)**: a runtime substrate in which every artefact of an application — its data schema, its business rules, its runtime state, its capability policy, its user interfaces, its tests, the kernel itself, and the compiler that optimises it — is simultaneously a content-addressed datum, a typed entry in a typed algebra, and a causally-connected runtime object. The kernel's organising principle is what we call **Stratified Homoiconicity**: the Lisp tradition of *programs as data* applied not to a single language stratum but to every level of an [OMG MOF-style](https://www.omg.org/spec/MOF/2.5.1/) metamodel tower, with the engine that evaluates the data being itself an instance of the data it evaluates.

The kernel is structured as a sixteen-layer ladder, each layer adding one well-bounded capability. This document walks the reader through that ladder conceptually: what each layer means, what computing tradition it descends from, and how the layers compose into a coherent whole. The aim is comprehension before code.

---

## 1. The problem

Conventional applications are built on five disjoint substrates. The data schema lives in a database migration tool. The business rules live in application code. The runtime state lives in memory and on disk. The authorisation policy lives in a separate identity system. The tests live in yet another framework. Each substrate has its own type system, its own change-management process, its own observability story, and its own failure modes.

Most software pain is inter-substrate pain. A field added to an entity must be written into the migration, the model class, the form, the API schema, the policy file, and the test fixture, in something close to the same shape, and any one of those that drifts is a future bug. The cost of integration grows with the product of the substrates. We will call this the **five-artefact fracture**.

The thesis of RAK is that the fracture is contingent, not necessary. If schema, code, state, policy, view, and test are all expressed as typed data over a shared substrate — and if the substrate's identity regime is cryptographic content-addressing — then they share an evolution surface, a verification surface, and a refactoring surface. They become one artefact wearing five faces.

This is not a new idea. McCarthy's 1960 LISP made the case that programs can be data ([McCarthy 1960](https://www-formal.stanford.edu/jmc/recursive.pdf)); Abelson and Sussman's *Structure and Interpretation of Computer Programs* (1985) §4.1 develops the meta-circular evaluator that makes the case operational; the Smalltalk metaobject protocol and CLOS extended it ([Kiczales et al. 1991](https://mitpress.mit.edu/9780262610742/the-art-of-the-metaobject-protocol/)); the [K Framework](https://kframework.org/) treats language semantics themselves as executable data; the [Unison language](https://www.unison-lang.org/docs/the-big-idea/) makes code definitions content-addressed; the [Kubernetes Resource Model](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/) generalises the controller-from-declarative-data pattern to operations.

What is new is the unification. RAK takes content-addressed code, structural typing with cryptographic conformance, an explicit four-level metamodel tower, capability-based authorisation, and an algebra of named transformations, and it composes them into a single substrate where every layer of the system is reachable through the same identity and evaluation regime.

---

## 2. The central thesis: Stratified Homoiconicity

Homoiconicity in its classical Lisp formulation means that a program is a data structure in the same language it is written in. The Lisp programmer can construct, traverse, and transform programs using the same tools they use for any other data. Reflection — a system describing and modifying itself at runtime — was the next step in that tradition; [Brian C. Smith's 1982 thesis](https://dspace.mit.edu/handle/1721.1/15961) on procedural reflection in Lisp formalised it, and 3-Lisp introduced the tower of meta-levels in which a program can reason about its own evaluator, which can reason about its own evaluator, indefinitely.

That tower historically terminated with engineering, not mathematics. At some level a meta-circular interpreter delegates to a primitive substrate — the bare metal, the C runtime, the silicon — and the regress stops. The substrate is trusted, but its trust is social: a vendor, a committee, a release.

The OMG Meta-Object Facility (MOF) tower ([ISO/IEC 19508:2014](https://www.iso.org/standard/62313.html)) introduced a formal four-level stratification that the modelling community has used for two decades. **M0** is concrete instances. **M1** is the model — a class diagram, a domain model, a data definition. **M2** is the metamodel — the schema that says what an M1 model can contain. **M3** is the meta-metamodel — the schema that says what an M2 metamodel can contain. The tower terminates because M3 conforms to itself.

In conventional MOF, that self-conformance is asserted by committee. The OMG publishes a document; it states that M3 conforms to itself; tools accept the assertion. The strange loop ([Hofstadter, *Gödel, Escher, Bach*, 1979](https://en.wikipedia.org/wiki/G%C3%B6del,_Escher,_Bach)) is real — M3 describes itself — but the proof is bureaucratic.

RAK takes the strange loop literally and makes it cryptographic. The kernel computes a content-addressed identifier for its M3 meta-metamodel from the M3 body itself — excluding only the identifier and conformance fields from the hash input — and then fills those fields with the resulting identifier. The object that results conforms to itself in the strict sense: a third party reading the encoded bytes can compute the same hash and verify the loop has closed. The trust is mathematical. We call this the **cryptographic strange loop**, and it is the kernel's foundation.

Around that foundation we apply the Lisp tradition at every stratum of the tower:

- At **M3** the meta-metamodel is data — content-addressed, hashable, traversable.
- At **M2** the metamodels (schema for entity documents, schema for morphism documents, schema for capability documents, schema for state-machine documents, and so on) are data.
- At **M1** the application's models, morphisms, state machines, capabilities, and projections are data.
- At **M0** the runtime instances — the actual orders, users, sessions — are data.

And critically, the engine that evaluates data is itself an M1 datum — a YAML document declaring the morphisms, dispatch lifecycle, and capability chain that constitute the kernel. Bootstrapping the kernel reduces to interpreting that document with a small, fixed imperative loader. The classical Lisp meta-circular evaluator returns at the architectural scale: the system describes itself end to end. Programs are data. Schemas are data. State is data. Tests are data. The interpreter is data.

The combination — a stratified MOF tower, content-addressed at every level, where each level is reachable as data and where the engine joins the data — is what we call Stratified Homoiconicity. The closest existing comparator is the K Framework's "semantics as data" thesis; the closest non-academic comparator is Unison's "the big idea" applied recursively to the type system itself.

---

## 3. The seven axioms

The kernel's commitments can be stated as seven axioms. They are not aspirational; each is realised as a concrete mechanism in the layers below. They serve in this document as the conceptual scaffold the layer walkthrough hangs from.

1. **Content-addressed identity.** Every type, morphism, capability, and datum has a deterministic identifier derived from the canonical encoding of its content. Identity is mathematical, not nominal. Two systems that compute the same identifier from the same content agree on the identity of the artefact, without coordination. The pattern is [Merkle 1987](https://link.springer.com/chapter/10.1007/3-540-48184-2_32) generalised; [Git](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects), [IPFS](https://ipfs.tech/), and Unison are precedents at different layers of the stack.

2. **The cryptographic strange loop.** The meta-metamodel terminates the metamodel tower by content-addressing itself: its declared conformance target is its own identifier. The Hofstadter strange loop becomes a verifiable mathematical construction.

3. **The engine as data.** The kernel's evaluation machinery — the morphism set, the dispatch lifecycle, the capability authorisation chain — is declared as a data document and reconstituted at boot by a small fixed-size loader. The reader familiar with [Smith's 3-Lisp](https://dspace.mit.edu/handle/1721.1/15961) or [PyPy's RPython](https://doc.pypy.org/en/latest/rpython.html) will recognise the meta-circular pattern; here it is applied not to a programming language but to a typed projection algebra.

4. **Algebraic composition.** Domain logic composes through a typed algebra of named transformations — `compose`, `product`, `sum`, `fmap`, `cond`, `restrict`, `extend`, `guard` — rather than ad-hoc orchestration. The genealogy is category theory ([Eilenberg & Mac Lane 1945](https://www.ams.org/journals/tran/1945-058-00/S0002-9947-1945-0013131-6/)) by way of the functional-programming lineage that gave us [Wadler's monads](https://homepages.inf.ed.ac.uk/wadler/papers/marktoberdorf/baastad.pdf) and [Reactive Streams](https://www.reactive-streams.org/).

5. **Capability-based authority.** All authority in the system is conferred by possession of an unforgeable, content-addressed capability datum. Delegation works by attenuation — adding caveats that the holder cannot remove. There is no access-control list to consult at runtime, and no central authority to compromise. The lineage runs through [Mark Miller's Robust Composition](http://www.erights.org/talks/thesis/), [Shapiro's KeyKOS and EROS](https://dl.acm.org/doi/10.1145/319151.319163), [Yee on capability UIs](https://zesty.ca/pubs/yee-phd.pdf), and the [Macaroons paper](https://research.google/pubs/macaroons-cookies-with-contextual-caveats-for-decentralized-authorization-in-the-cloud/) of Birgisson et al., NDSS 2014.

6. **Substrate minimality.** The imperative floor — the code that cannot be expressed as data — is fixed and auditable. The decision to add to it is governed by a four-axis rubric (algebraic, reflexive, performance, clean modelling) applied case by case. The minimality is itself a tested invariant.

7. **Additive extensibility.** New capabilities arrive as new data — a new kind pack, a new morphism document, a new specialisation rule — not as new branches in lower-layer code. The architectural posture matches the [Kubernetes operator pattern](https://kubernetes.io/docs/concepts/extend-kubernetes/operator/) and the [OSGi service registry](https://www.osgi.org/specifications/), generalised one stratum lower.

The remaining sections walk the layers that realise these axioms.

---

## 4. The four-level metamodel tower

The kernel's vertical structure begins with the OMG MOF tower (chain of conformance: M0 ↦ M1 ↦ M2 ↦ M3, with M3 ↦ M3). MOF was designed for class-modelling tools; RAK applies its stratification to a content-addressed runtime substrate. The reader who has used [Eclipse EMF](https://www.eclipse.org/modeling/emf/), [JetBrains MPS](https://www.jetbrains.com/mps/), or any MDA tool will recognise the levels; the difference here is that the levels are runtime objects in a single content-addressed registry rather than a build-time artefact.

```
M3   Meta-metamodel   The cryptographic fixed point. One object. Self-conforming.
M2   Metamodels       Schemas: what an entity document is, what a morphism
                      document is, what a capability is. Eight or so canonical
                      schemas plus extensions registered by application code.
M1   Models           Concrete declarations: Order, User, the OrderLifecycle
                      state machine, the loginUser action. The kernel's own
                      morphism set lives at this level too.
M0   Instances        Runtime data: a particular Order, a particular User,
                      a current authenticated session.
```

Conformance flows downward. An M0 instance conforms to its M1 model. An M1 model conforms to its M2 metamodel. An M2 metamodel conforms to M3. M3 conforms to itself.

The mechanism that enforces conformance is structural. RAK does not require nominal type matching; it requires that the encoded shape of a datum satisfy the encoded shape of its declared metamodel ([JSON Schema 2020-12](https://json-schema.org/draft/2020-12/json-schema-core) is the structural substrate). The discipline descends from [Cardelli's structural typing](https://lucacardelli.name/papers.html) and survives in [GraphQL Interfaces](https://graphql.org/learn/schema/#interfaces) and [TypeScript's type system](https://www.typescriptlang.org/docs/handbook/2/types-from-types.html). What is distinctive in RAK is that conformance is verified at registration time and the verified identifier is content-addressed, so any later observer can re-verify in O(1) without re-walking the schema.

The tower is not a static taxonomy. New M2 metamodels can be registered, and the M3 fixed point validates them. New M1 models can be registered, and their declared M2 validates them. The system grows additively, with mathematical guarantees at each stratum that the new addition conforms to its stated parent.

---

## 5. The layer walkthrough

The kernel is organised as a strict downward-import ladder. Higher layers depend on lower layers; the reverse is forbidden. Each rung adds one well-bounded capability, building on what the lower rungs supply.

We walk from the bottom up. The reader who treats this as a tutorial will encounter the concepts in the order they are needed.

### L00 — The kernel as data

The bottom rung is unusual: it contains no code. It is a single declarative document that *is* the kernel.

The document declares the types the kernel registers, the morphisms it evaluates, the state machines it instantiates, the actions it dispatches, the capabilities it issues, and the kind packs it loads. A small loader — a few hundred lines of imperative code in a higher layer — reads the document and reconstitutes a fully functional kernel from it.

The reader familiar with PyPy/RPython, with [Lean 4's macro system](https://leanprover.github.io/lean4/doc/metaprogramming.html), or with K Framework's executable semantics will recognise the pattern: a system specification expressed in the system's own language, reduced to running code by a small bootstrapper. The pattern is meta-circular interpretation extended from a programming-language semantics to a full application substrate. The genealogy is McCarthy and SICP; the modern realisation is the Futamura projection lineage ([Futamura 1971](https://www.brics.dk/~hosc/local/HOSC-12-4-pp381-391.pdf)) that gives us the partial-evaluation viewpoint on interpreters.

The practical consequence is that adding a new operator to the kernel is a document edit, not a code change. The substrate's growth rate is set by the document, not by the loader.

### L01 — The foundation

The foundation layer holds the primitive vocabulary on which everything else builds. It defines what a type reference is, what a datum is, what a content identifier is, what a canonical encoding produces, what equality means, and what the shape contracts of higher-layer constructs look like.

Two ideas earn separate citation.

The **canonical encoding** is the operation that turns an in-memory value into a deterministic byte string suitable for hashing. Without canonicalisation — a fixed key ordering, a fixed numeric representation, a fixed treatment of whitespace — two systems running the same code on the same input would produce different identifiers, and content-addressing would fail to compose across processes. The discipline is the same one [Git applies to its tree objects](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects), [IPFS applies to its blocks](https://docs.ipfs.tech/concepts/content-addressing/), and the Unison runtime applies to its term references.

**Structural type contracts** are the second idea. A type at this layer is not a class with a name but a shape with a schema. Two types with the same encoded schema are the same type, regardless of where they were declared. The discipline aligns with [Cardelli's foundational paper on structural subtyping](https://lucacardelli.name/Papers/Inheritance.A4.pdf), with the JSON Schema standard, with [Avro's schema-resolution](https://avro.apache.org/docs/1.11.1/specification/) approach, and with how Protocol Buffers handle compatibility.

The foundation has no behaviour. It defines vocabulary; it does not act.

### L02 — The metamodels

The metamodel layer is the M2 stratum: a small collection of schema documents declaring what an M1 model can be. The schemas describe entity documents, morphism documents, capability documents, acceptance suite documents, algebra-operator documents, specialisation-rule documents, and the pluggable-interface contract that lets applications declare new extension points without changing the kernel.

The pluggable-interface contract deserves particular note. It is the kernel's mechanism for additive extensibility: a new storage backend, a new projection surface, a new authentication scheme is declared as a metamodel-conforming document, and the lower layers route to it through registration rather than through a hard-coded branch. The structural family is [OSGi's service registry](https://www.osgi.org/specifications/), [Eclipse's plug-in extension points](https://wiki.eclipse.org/FAQ_What_are_extensions_and_extension_points%3F), and the [Kubernetes Custom Resource Definition](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/) plus controller pattern, applied at the language-runtime layer.

The metamodels are not closed. New M2 documents can be registered by applications; the M3 fixed point validates them at registration time, and the resulting metamodel becomes a substrate over which new M1 models can conform.

### L03 — The tower

The tower layer is where the cryptographic strange loop is computed and the metamodel registry is populated.

At boot the layer hashes its M3 meta-metamodel — with the identity and conformance fields excluded from the input — and fills those fields with the resulting hash. A power-on self-test then validates the resulting object against its own schema before any other type is loaded. The strange loop has closed and been verified. From that point on, every type registration runs through a four-step gauntlet: structural validation against M3, parent resolution, level check, and validation against the parent's schema. Only then does the type receive its content-addressed identifier and join the registry.

Two ancillary capabilities live at this layer. **Schema composition** assembles richer types from reusable fragments — a discipline visible in [Scala traits](https://www.scala-lang.org/files/archive/spec/2.13/05-classes-and-objects.html#traits), in [GraphQL interfaces](https://graphql.org/learn/schema/#interfaces), in JSON Schema's `allOf`, and in the structural-subtyping literature. **Compatibility analysis** decides whether a type at version N is forward-, backward-, or fully-compatible with version N+1, an essential operation for any system that intends to live longer than its initial schema.

The reader familiar with the [TypeRegistry concept in Apache Avro](https://avro.apache.org/docs/1.11.1/specification/) or with [Protobuf's wire-compatibility rules](https://protobuf.dev/programming-guides/proto3/#updating) will recognise the discipline. What is distinctive here is that every registered type has a verifiable cryptographic identity that does not change when the type is moved between systems.

### L04 — Expression

A morphism is an expression: a node-tagged tree of operations whose leaves are values and whose interior nodes are operations like `lambda`, `apply`, `let`, `match`, `record`, `array`, plus a small library of arithmetic, comparison, and structural builtins. The expression layer is the source-mode interpreter for these trees.

Two ideas anchor the layer.

The first is **totality**. The interpreter enforces termination by metering: every recursive evaluation step decrements a shared counter; exhaustion produces a typed error rather than a non-terminating loop. The pattern is the [fuel-monad VM](https://dl.acm.org/doi/10.1145/2103746.2103748) that the WebAssembly runtime [Wasmi](https://github.com/wasmi-labs/wasmi) and other resource-bounded interpreters use, and it is a kernel-level commitment that arbitrary user-supplied morphisms cannot lock the system. The deeper genealogy runs through [Turner's total functional programming](https://www.jucs.org/jucs_10_7/total_functional_programming/jucs_10_07_0751_0768_turner.pdf), [Agda's totality checker](https://agda.readthedocs.io/en/latest/), and the work that descends from them.

The second is **the interpreter as semantic reference**. The expression evaluator is the ground truth for what a morphism means. A faster execution path will exist higher in the ladder; that path will be parity-tested against this one. The reader will recognise the discipline from [V8's Ignition vs TurboFan](https://v8.dev/blog/launching-ignition-and-turbofan) story, from the [BEAM interpreter and JIT relationship](https://www.erlang.org/blog/a-brief-beam-primer/), and from [LuaJIT's `-j off` invariant](https://luajit.org/faq.html). Compiled paths earn their existence by passing parity, never by replacing the reference.

### L05 — Morphism

A morphism in RAK is a typed transformation `A → B` that has a stable name, a content-addressed identifier, a source type, a target type, and a body — either an expression tree or a reference to a typed handler. Morphisms can be stored, retrieved, composed, and executed. They are the kernel's algebraic backbone.

The reader familiar with Unison will recognise the central discipline: code is identified by hash, not by name. Two morphisms with the same content have the same identifier; renaming, moving, or re-importing does not change the identity. A function in this regime is shareable across processes, cacheable across builds, and refactorable without rebreaking dependents that addressed it by hash.

Around the morphism registry sit five auxiliary engines that extend what a "type" can mean.

**Refinement types** narrow a base type by a predicate: `PositiveInteger` is `Integer` plus `x > 0`. The discipline descends from [Liquid Haskell](https://ucsd-progsys.github.io/liquidhaskell/) ([Rondon, Kawaguchi & Jhala, *Liquid Types*, PLDI 2008](https://goto.ucsd.edu/~rjhala/liquid/liquid_types.pdf)) and from [Freeman & Pfenning's earlier *Refinement Types for ML*](https://www.cs.cmu.edu/~rwh/papers/refinements/refinements.pdf).

**Branding** introduces nominal isolation atop the structural type system: two structurally identical types can be made to refuse interchangeability by carrying different brands. The pattern is widely used in [TypeScript brand-types idioms](https://www.typescriptlang.org/play?#code/PTAEHcAcFNQOQK4FsCmAXAhgZxgIwEsB7AOzQHN5RtYAsAQQF5RLD1NZQAvBYAa1YA3BAGNYIXKACyOAB7M+jAGzMAFwG4ARi.GSAtDgDeQUKAg).

**Proof-carrying data** treats boolean predicates as named propositions: a `Proposition` is a name, a `KernelExpression` boolean statement, and an evidence type. The kernel can verify a proposition against a witness, or search for a witness from a candidate set. The Curry–Howard correspondence ([Wadler's "Propositions as Types"](https://homepages.inf.ed.ac.uk/wadler/papers/propositions-as-types/propositions-as-types.pdf)) is the conceptual ancestor; [Necula's *Proof-Carrying Code*](https://dl.acm.org/doi/10.1145/263699.263712) is the direct precedent.

**Dependent typing** allows type families parameterised by values: `Vec<Int, 3>` is a different type from `Vec<Int, 4>`. The lineage runs through [Martin-Löf type theory](https://link.springer.com/chapter/10.1007/978-94-009-8641-5_8), [Idris](https://www.idris-lang.org/), and the practical use of dependent types in modern proof assistants.

**Trait composition** assembles partial schemas into composite types by flat-merging properties. The discipline matches [Scala traits](https://docs.scala-lang.org/tour/traits.html), [Rust traits](https://doc.rust-lang.org/book/ch10-02-traits.html) at the type level (without the dispatch story), and the [JSON Schema `allOf`](https://json-schema.org/understanding-json-schema/reference/combining#allof) intersection semantics.

The boundary between what should be a morphism and what should remain imperative TypeScript is the kernel's most repeated decision. The substrate-minimality axiom commits to a small imperative floor; the additive-extensibility axiom commits to growing the system as data. The boundary is governed by a four-axis rubric — algebraic, reflexive, performance, clean modelling — applied per block. We will not detail the rubric here; the point for this overview is that the imperative-vs-algebraic choice is a discipline, not a default.

### L06 — Process

A state machine in RAK is a declarative document, not compiled code. The document names states and events, declares transitions with optional guards, and decides successor states through expression bodies that evaluate against the current state and incoming event.

The mathematical home is the **coalgebra**: a state machine is a function $\alpha: S \times E \to S$, the counterpart to algebraic constructors that build values up. [Jacobs's *Introduction to Coalgebra*](https://www.cs.ru.nl/B.Jacobs/CLG/JacobsCoalgebraIntro.pdf) (Cambridge UP 2016) is the standard text; the application to system specification has a long history through [Lamport's TLA+](https://lamport.azurewebsites.net/tla/tla.html), [Statecharts](https://www.sciencedirect.com/science/article/pii/0167642387900359), and most modern process-modelling tools.

The actor lineage is the practical companion. [Hewitt's 1973 paper](https://www.researchgate.net/publication/220775134_A_Universal_Modular_Actor_Formalism_for_Artificial_Intelligence) on actors as the unit of concurrent computation underwrites the kernel's commitment to address each state-machine instance as a self-contained entity that responds to messages. [Erlang and the BEAM platform](https://www.erlang.org/) are the most successful runtime instantiation of the model.

What is distinctive in RAK is that the engine that runs the state machine has no custom interpreter. The four operations a state machine exposes — step, run, reachable-states, verify-invariants — are themselves expressions in the kernel's algebra, evaluated by the same interpreter that evaluates every other morphism. The state machine's specification, the engine that runs it, and the tests that verify it share a substrate.

### L07 — Agency

The agency layer is where intention becomes effect. A user, an agent, or another system submits an intention; the kernel decides whether the submission is authorised, whether its preconditions hold, and what events it produces.

The conceptual centrepiece is the distinction between **Intent** and **Action**. An *intent* is a content-addressed datum that records what was attempted. An *action* is the typed specification of what may be attempted: an input schema, a target machine, a generated event class, a set of precondition expressions. The distinction mirrors the [W3C Web Annotation Model's body/target separation](https://www.w3.org/TR/annotation-model/) (Sanderson et al., W3C Recommendation 2017): the *body* is the content of a communication; the *target* is the resource it applies to. The kernel formalises this at the runtime layer.

The authority model is **object capabilities**, not access-control lists. The reader familiar with the foundational capability-systems literature will recognise the discipline from [Mark Miller's *Robust Composition*](http://www.erights.org/talks/thesis/) (2006), from [Shapiro's KeyKOS and EROS](https://srl.cs.jhu.edu/pubs/SRL2003-02.pdf), and from [Yee's work on capability-based user interfaces](https://zesty.ca/pubs/yee-phd.pdf). A capability is an unforgeable, content-addressed reference that conveys authority by possession; if the reference cannot be produced, the action cannot be invoked. The classical [Confused Deputy](https://en.wikipedia.org/wiki/Confused_deputy_problem) failure mode of ACL systems — an intermediary with broad authority can be tricked into acting on behalf of a less-trusted caller — is structurally avoided.

Delegation is solved by **macaroons**: ([Birgisson et al., NDSS 2014](https://research.google/pubs/macaroons-cookies-with-contextual-caveats-for-decentralized-authorization-in-the-cloud/)). A holder of a capability can produce an attenuated capability for another holder by adding caveats — predicates over the invocation context — that the new holder cannot remove. Caveat verification is decentralised: any holder can verify; no central authority needs to be consulted. Delegation chains form trees, attenuation accumulates downward, and the original authority cannot be exceeded.

What is distinctive in RAK is that caveats are expressed in the kernel's own algebra. A caveat is a `KernelExpression` predicate evaluated by the same interpreter that evaluates morphisms; no separate caveat-evaluation runtime exists.

### L08 — The pluggable substrate

Every layer below this one is generic with respect to where state lives, what surface a view renders to, and how transport carries actions. The kinds layer is where that genericity meets the concrete world.

The layer holds **kind packs** — self-contained adapters, each declaring its identity and conforming to one or more of the metamodels' pluggable-interface contracts. Each pack is interchangeable with another implementing the same contract; replacement is a registration change, not a recompilation.

Four families live here.

**Storage spaces** abstract durability. A *keyed-value store* covers mutable record stores. An *append-only journal* covers immutable event-ordered streams. Pairing the two — snapshot plus replay — applies the [event sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) discipline of [Greg Young](https://cqrs.files.wordpress.com/2010/11/cqrs_documents.pdf) and Martin Fowler. The runtime implementations include filesystem-backed and in-memory variants; new backends arrive as new packs.

**Projection surfaces** abstract user-facing rendering. The HTML+WebSocket surface, the REST surface, and the CLI surface are each registered kinds. The discipline of static-vs-dynamic algebra split, of per-reference subscription, and of typed effect adapters is most visible in [Phoenix LiveView's HEEx change tracking](https://hexdocs.pm/phoenix_live_view/) and [Solid.js's signal model](https://docs.solidjs.com/concepts/signals); the projection layer above this one composes the algebra, and the surfaces here interpret it.

**Authentication and session** abstracts identity. JWT verification, key-asset management, and session storage are each kind packs. The capability-token validation at the surface boundary preserves the object-capability trust perimeter.

**Transport adapters** abstract how requests reach the kernel and how responses leave it. The HTTP request lifecycle, the WebSocket frame protocol, and the standard-input/output stream protocol all live here.

The unifying concept is the pluggable interface contract. Adding a storage backend, a surface, an authentication scheme, or a transport is structurally the same operation: declare the contract conformance, implement the methods, register the pack.

### L09 — Demand

The demand layer sits at the hinge between declaration and execution. It does two things.

**Compilation** turns a declarative model document into runtime artefacts. A model document is a YAML declaration of entities, enums, relations, lifecycles, actions, and contracts. Compilation walks the document, registers types in the tower, registers actions in the agency layer, wires the lifecycle into a state-machine instance, and produces a `ModelBoot` — a narrow public surface (`submit`, `getState`, `setState`, `onEvent`, `issueCapability`) that controls the booted application without exposing its internals.

The mental model matches the [Kubernetes Resource Model](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/) generalised one stratum lower: the model document is the declaration; `ModelBoot` is the controller surface; the runtime instances are the resources. The reader familiar with [Hyrum's Law](https://www.hyrumslaw.com/) will recognise the architectural commitment: only the declared surface is observable, so only the declared surface can be depended on.

**Materialisation** addresses the asynchronous-data problem. Many actions need data the kernel does not have in memory: a stored entity by reference, a related record, a derived projection. The naive solution is to fetch synchronously and block. RAK's solution is the two-phase **IO-monad protocol** of [Wadler 1995](https://homepages.inf.ed.ac.uk/wadler/papers/marktoberdorf/baastad.pdf): an action's expression is surveyed for its data requirements before evaluation; the requirements are resolved into a *loading plan*; the plan is executed; only when the context is hydrated does the action evaluate. The kernel never blocks on I/O.

The traversal language is structurally [IPLD selectors](https://specs.ipld.io/selectors/selectors.html), the same discipline IPFS uses to express deep-fetch operations over content-addressed graphs. The streaming model is [Reactive Streams](https://www.reactive-streams.org/), with [Akka Streams](https://doc.akka.io/docs/akka/current/stream/) and [RxJS](https://rxjs.dev/) as direct comparators.

A third capability lives at this layer. **Unfolding** is the procedure that takes a seed type — say `Order` — and walks it through five strata: identity (the type's content address), structure (its fields), dynamics (its lifecycle state machine), agency (its allowable actions), and interface (its endpoints and projections). The result is a fully-realised application from a small declaration. The mathematical home is the functor (Eilenberg & Mac Lane 1945); the philosophical home is Arthur Koestler's [Holon](https://en.wikipedia.org/wiki/Holon_(philosophy)) — an entity that is simultaneously a whole at one level and a part at another. An order's data, state, intents, and view are not separate concerns; they are aspects of a single Holon.

### L10 — Acceptance

Tests in RAK are first-class data in the same registry as the code they test. A test suite is a tree-structured document with seven entities: personas, seeds, steps, assertions, scenarios, use cases, and the suite itself.

The structure is a tree, not a sequence. Real domain behaviour branches: an order, once placed, may be paid or cancelled; once paid, may be shipped or refunded. A linear script covers one branch; a tree covers all of them in one scenario. Every root-to-leaf path through the tree is an independent execution trace; all traces run; all must pass for the suite to pass. The discipline matches Dan North's [*Introducing BDD*](https://dannorth.net/introducing-bdd/) lineage and [Adzic's *Specification by Example*](https://gojko.net/books/specification-by-example/), extended to a branching structure.

Authorisation is real, not simulated. A persona at suite-load time receives content-addressed capability tokens for its declared verbs; each step of the scenario presents the token to the kernel's submission path; tokens that lack the verb fail submission exactly as they would in production. The capability layer (L07) is exercised the same way at test time as at run time.

Behaviour is observed only through the declared model boot surface. The acceptance engine never reaches inside the kernel beyond the seven public methods of `ModelBoot`. The architectural commitment is the anti-Hyrum's-Law one: internal refactoring cannot break a passing suite without also changing observable behaviour. Tests written against the surface remain valid as long as the surface remains valid.

### L11 — Projection

The projection layer is where data, processes, and authority become user-facing surfaces — HTML viewer, REST API, command-line interface, terminal user interface, agent-facing JSON-RPC. The central thesis comes from category theory: a user interface is a [functor](https://ncatlab.org/nlab/show/functor) from the data/process/agency category to a target category indexed by the surface kind.

$$
\mathcal{P}_k: \mathcal{W} \times \mathcal{Q} \times \mathcal{C} \longrightarrow \mathcal{T}_k
$$

A projection is a typed mapping from a world handle (the data and processes), a query (which slice of the world), and a capability scope (what the viewer is allowed to see and act on) into a kind-indexed target. Changing the kind — from HTML to REST to CLI — changes the target category but keeps everything else the same. The shared algebra is encoded **tagless-final** ([Kiselyov's tutorial](https://okmij.org/ftp/tagless-final/index.html) is the canonical reference): each surface is an interpreter of the same algebra; adding a surface means adding an interpreter, not changing the algebra.

The capability scope makes the functor monotone: more capabilities admit more of the surface. A viewer with only "read order" capability sees the order; the same viewer with "edit order" capability additionally sees the edit controls; the algebra computes both from the same projection model and the same data.

The reflexive seam lives at this layer. The projection engine that interprets the algebra is itself an instance of the algebra: the `kernel.model.yaml` document at L00 declares the kernel's morphisms, dispatch lifecycle, and capability chain, and a small loader at this layer reconstitutes the running engine from the document. The kernel projects itself. The strange loop visible at the M3 fixed point is replayed at the engine level; the imperative bootstrap floor is fixed and small.

Reactive surfaces live one layer down (L08), but the algebra they interpret lives here. The five-primitive runtime model — static/dynamic algebra split, path-keyed wire frame, per-reference subscription, hierarchically-scoped context, typed effect adapter — has direct counterparts in [Phoenix LiveView's HEEx model](https://hexdocs.pm/phoenix_live_view/assigns-eex.html), in [Solid.js signals](https://docs.solidjs.com/concepts/signals), and in [Hotwire Turbo Streams](https://turbo.hotwired.dev/handbook/streams).

### L12 — Compiler

The expression interpreter at L04 is the semantic reference. It is intentionally unoptimised; its allocation pattern is uniform; its semantics are transparent. For a morphism evaluated thousands of times per render, that simplicity has a cost.

The compiler layer addresses the cost. It takes the same expression trees and lowers them, through a sequence of well-defined passes, into register-based bytecode. The bytecode runs on a small virtual machine in a tight dispatch loop. The reader who has worked with [V8's Ignition interpreter](https://v8.dev/blog/launching-ignition-and-turbofan), with the [BEAM bytecode model](https://www.erlang.org/blog/a-brief-beam-primer/), with [LuaJIT's interpreter](https://luajit.org/luajit.html), or with [CPython's specialising adaptive interpreter](https://peps.python.org/pep-0659/) will recognise the architecture. The classic register-vs-stack performance literature — most directly [Shi & Casey's "Virtual Machine Showdown"](https://dl.acm.org/doi/10.1145/1328195.1328197) — favours register VMs by 15–50% on the same work, and the kernel matches that range.

Two disciplines distinguish RAK's compiler from a conventional one.

**Type specialisation** is registered as data. A specialisation rule — replace a generic less-than with an integer-typed less-than when both operands are statically known to be integers — is itself a content-addressed declaration. New rules arrive as new files; the compiler does not change. The discipline matches CPython's PEP 659 quickening but reifies the rules as first-class registered data.

**Source/compiled parity** is a runtime mode, not a test fixture. The kernel can run any morphism through both paths and assert that the results agree. A divergence is a compiler bug, never a specification disagreement. The same invariant LuaJIT enforces between `-j off` and `-j on`; here it is exposed as a runtime mode the developer can set and any consumer can rely on.

### L13 — Facade

The facade is the kernel's single public import surface. Internal layers are hermetic: a consumer who attempts to reach into them gets a module-not-found error before any code runs. The discipline matches the classical [Facade pattern](https://en.wikipedia.org/wiki/Facade_pattern) of [Gamma et al. 1994](https://en.wikipedia.org/wiki/Design_Patterns) at the design-pattern level, and the [Node.js subpath-exports field](https://nodejs.org/api/packages.html#subpath-exports) at the module-resolution level.

The conceptual point is that the kernel's contractual surface is the surface the facade exposes, not the surface the implementation happens to permit. A class that moves between two internal layers is invisible to consumers as long as the facade re-exports it under the same name. The kernel's internal evolution is decoupled from its consumers' compile-time dependencies.

The facade also provides the kernel's standard entry sequence — the procedure by which an application turns a directory of declarations into a running kernel. The procedure walks the filesystem upward to find the project root marker, reads the declarations, boots the layers in ladder order, and returns a configured kernel handle. The pattern matches [npm's `find-up`](https://github.com/sindresorhus/find-up), [Cargo's `cargo locate-project`](https://doc.rust-lang.org/cargo/commands/cargo-locate-project.html), and the Kubernetes operator boot sequence: identity comes from the manifest, not from the calling code.

### L14 — Hosts

The kernel's projection algebra is transport-agnostic. The host layer is where transport opinions are stated, once per transport.

Each host is a concrete realisation of the projection-host contract: a transport that receives output from a projection backend, delivers it to an external consumer, and channels the consumer's actions back into the kernel.

The HTTP+WebSocket host implements the [Phoenix LiveView](https://hexdocs.pm/phoenix_live_view/) contract: the server owns all state; the transport is the thinnest possible wire between a server-rendered diff and the client event that caused it. The REST host bootstraps a projection kernel and routes every HTTP request through a configured pipeline morphism. The CLI host provides a line-oriented read-eval-print loop in which each input line routes through a kernel-evaluated morphism, structurally analogous to [the IPython messaging protocol](https://jupyter-client.readthedocs.io/en/stable/messaging.html) and [SLIME](https://common-lisp.net/project/slime/). A generic host reads a sovereign-data-space declaration and boots an entire node tree from the manifest, applying the same operator-from-CRD discipline [Kubernetes operators](https://kubernetes.io/docs/concepts/extend-kubernetes/operator/) use.

What unifies the hosts is their separation from the algebra they serve. None defines what a projection means; each ships a projection to its consumer.

### L15 — Command line

The top of the ladder is the human-facing command surface: the `rak` command line. It parses arguments, looks up a subcommand handler, dispatches, and exits. Each subcommand is a thin shell over the lower layers.

The discipline of note is example-name indirection. The kernel ships with a registry of examples — the canonical demonstrations of how a model becomes an application. The command line discovers the registry at runtime by walking the filesystem; it never names a specific example in its source. Adding a new demonstration is a new directory; removing one is a directory deletion. The kernel binary is decoupled from the set of registered examples, the same way [`kubectl` plug-ins](https://kubernetes.io/docs/tasks/extend-kubectl/kubectl-plugins/) are decoupled from the kubectl binary.

---

## 6. Composition: how the layers fit

The walkthrough above treats each layer as a concept; the value of the architecture is in how the concepts compose.

**A typical request lifecycle.** A user submits an action through the HTTP+WebSocket host (L14). The host parses the frame and hands a typed `(action, payload, capabilities)` triple to the agency layer (L07). The agency layer validates the payload against the action's input schema (L01–L03), evaluates the action's preconditions through the expression interpreter (L04) routed through the morphism registry (L05), authorises the call against the presented capabilities and their macaroon caveats (also evaluated at L04), and emits the resulting events. Storage routing (L07) sends the events to the appropriate kind packs (L08). The state-machine engine (L06) advances the affected aggregates. Subscriptions on the projection layer (L11) recompute the affected slices of the surface; the host (L14) ships the updated wire frame back to the client.

Every step in this lifecycle is content-addressed. The action specification has an identifier. The capability has an identifier. The morphism has an identifier. The state machine has an identifier. The projection model has an identifier. The events have identifiers. The lifecycle is reproducible; the audit trail is verifiable; the same lifecycle can be replayed against a different host transport, a different storage backend, a different surface, with identical results.

**A typical model lifecycle.** A developer writes a YAML model document declaring an entity, a state machine, and a set of actions. The demand layer (L09) compiles the document: types are registered through the tower (L03) using the metamodels (L02) over the foundation (L01); the state machine is registered with the process layer (L06); the actions are registered with the agency layer (L07); the cross-reference index is built; the result is a `ModelBoot` surface. Acceptance scenarios (L10) execute against the live boot, exercising every branch of the state machine through the same submission path users take. The CLI host (L15) makes the resulting application servable through any of the registered surfaces (L11) via any of the registered transports (L14).

The development cycle and the runtime cycle share the same substrate. The model is data; the state is data; the test is data; the kernel is data; the compiler is data. Every artefact is reachable from every other through one identity regime, one validation regime, and one evaluation regime.

**Stratified Homoiconicity in operation.** This is what the central thesis means in concrete terms. The conventional five-artefact fracture — schema/code/state/policy/test in five disjoint substrates — has been replaced by a single Merkle DAG of typed datums, conformance-checked against a small set of metamodels, grounded in a cryptographic fixed point, evaluated by an algebra that is itself a member of the substrate. The reader who has built a system that lived through many years and many migrations will recognise what is being avoided. The reader who has wished, while debugging an integration failure, that the schema, the policy, the controller, the test, and the running state were one artefact wearing five faces will recognise what is being claimed.

---

## 7. Situating the work

RAK's lineage runs through Lisp, MOF, content-addressing, capability security, category theory, and reactive runtimes. None of these traditions is novel; the contribution is the unification.

The most direct conceptual ancestor is the **K Framework** ([kframework.org](https://kframework.org/)) — semantics as data, executed by an interpreter that is itself produced by the same framework. K is a research project for language semantics; RAK applies the principle to application substrates.

The most direct practical ancestor is **Unison** ([unison-lang.org](https://www.unison-lang.org/docs/the-big-idea/)) — code identified by content hash, immutable by construction, distributable by reference. Unison is a programming language; RAK applies the discipline at every stratum of an MOF tower, including the type system itself.

The most direct architectural ancestor is the **Kubernetes Resource Model** ([kubernetes.io/docs/concepts](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/)) — declarative state, controllers that reconcile actual state to desired state, custom resource definitions for additive extensibility. Kubernetes is an operations substrate; RAK lifts the same pattern to language-runtime granularity, with content-addressing replacing etcd as the identity regime.

The most direct security ancestor is **the macaroon-based capability discipline** ([Birgisson et al. 2014](https://research.google/pubs/macaroons-cookies-with-contextual-caveats-for-decentralized-authorization-in-the-cloud/)) — content-addressed authority tokens, attenuation by caveat, decentralised verification. RAK extends macaroons by making the caveat language the kernel's own algebra, eliminating the separate caveat-evaluation runtime.

What RAK adds to these is the recursive application of all of them at once — content-addressing, structural typing, algebraic composition, capability security, declarative-from-data, reactive surfaces — over a single MOF tower whose fixed point is cryptographic and whose evaluator is itself an instance of the data it evaluates.

The reader familiar with one or another of the traditions above will find RAK's instantiation of that tradition recognisable. The reader unfamiliar with all of them is invited to start with the foundation layer (L01) and walk upward; the layers compose in the order they were introduced.

---

## 8. Further reading

For the conceptual scaffolding cited above, the following are the canonical references.

**Meta-circular evaluation, homoiconicity, reflection.**
Abelson, H. & Sussman, G. J. *Structure and Interpretation of Computer Programs* (1985), §4.1. <https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/6515/sicp.zip/index.html>
Smith, B. C. "Reflection and Semantics in LISP" (POPL 1984). <https://dl.acm.org/doi/10.1145/800017.800513>
Kiczales, G., des Rivières, J., Bobrow, D. G. *The Art of the Metaobject Protocol* (MIT Press, 1991).

**The MOF tower and structural typing.**
OMG. *Meta Object Facility (MOF) Core Specification 2.5.1* (ISO/IEC 19508:2014). <https://www.omg.org/spec/MOF/2.5.1/>
Cardelli, L. "A Semantics of Multiple Inheritance" (1984). <https://lucacardelli.name/Papers/Inheritance.A4.pdf>

**Content-addressing.**
Merkle, R. C. "A Digital Signature Based on a Conventional Encryption Function" (CRYPTO 1987). <https://link.springer.com/chapter/10.1007/3-540-48184-2_32>
Benet, J. "IPFS — Content Addressed, Versioned, P2P File System" (arXiv:1407.3561, 2014). <https://arxiv.org/abs/1407.3561>
Unison Computing. "The Big Idea." <https://www.unison-lang.org/docs/the-big-idea/>

**Strange loops and the self-referential fixed point.**
Hofstadter, D. R. *Gödel, Escher, Bach: An Eternal Golden Braid* (Basic Books, 1979).

**Category theory and functors.**
Eilenberg, S. & Mac Lane, S. "General Theory of Natural Equivalences." *Trans. AMS* 58 (1945): 231–294. <https://www.ams.org/journals/tran/1945-058-00/S0002-9947-1945-0013131-6/>
Kiselyov, O. "Tagless-Final." <https://okmij.org/ftp/tagless-final/index.html>

**Capability-based security.**
Miller, M. S. *Robust Composition: Towards a Unified Approach to Access Control and Concurrency Control* (PhD thesis, Johns Hopkins, 2006). <http://www.erights.org/talks/thesis/>
Shapiro, J. S. et al. "EROS: A Fast Capability System." *SOSP 1999.* <https://dl.acm.org/doi/10.1145/319151.319163>
Yee, K.-P. *Secure Interaction Design and the Principle of Least Authority* (PhD thesis, Berkeley, 2003). <https://zesty.ca/pubs/yee-phd.pdf>
Birgisson, A. et al. "Macaroons: Cookies with Contextual Caveats for Decentralized Authorization in the Cloud." *NDSS 2014.* <https://research.google/pubs/macaroons-cookies-with-contextual-caveats-for-decentralized-authorization-in-the-cloud/>
Hardy, N. "The Confused Deputy (or why capabilities might have been invented)." *ACM SIGOPS OSR*, 1988. <https://dl.acm.org/doi/10.1145/54289.871709>

**Coalgebras, actor model, state-machine theory.**
Jacobs, B. *Introduction to Coalgebra: Towards Mathematics of States and Observation* (Cambridge UP, 2016). <https://www.cs.ru.nl/B.Jacobs/CLG/JacobsCoalgebraIntro.pdf>
Hewitt, C., Bishop, P., Steiger, R. "A Universal Modular Actor Formalism for Artificial Intelligence." IJCAI 1973.
Lamport, L. *Specifying Systems: The TLA+ Language and Tools.* Addison-Wesley, 2002.

**IO monads, reactive streams, demand-driven loading.**
Wadler, P. "Monads for Functional Programming." *Advanced Functional Programming*, LNCS 925 (1995). <https://homepages.inf.ed.ac.uk/wadler/papers/marktoberdorf/baastad.pdf>
Reactive Streams Initiative. <https://www.reactive-streams.org/>
IPLD Selectors specification. <https://specs.ipld.io/selectors/selectors.html>

**Refinement types, proof-carrying code, total functional programming.**
Rondon, P., Kawaguchi, M., Jhala, R. "Liquid Types." *PLDI 2008.* <https://goto.ucsd.edu/~rjhala/liquid/liquid_types.pdf>
Necula, G. C. "Proof-Carrying Code." *POPL 1997.* <https://dl.acm.org/doi/10.1145/263699.263712>
Turner, D. "Total Functional Programming." *J. UCS* 10:7 (2004). <https://www.jucs.org/jucs_10_7/total_functional_programming/jucs_10_07_0751_0768_turner.pdf>

**Acceptance, behavioural conformance, specification by example.**
North, D. "Introducing BDD." 2006. <https://dannorth.net/introducing-bdd/>
Adzic, G. *Specification by Example: How Successful Teams Deliver the Right Software.* Manning, 2011.

**Compiler architecture, register VMs, parity invariants.**
Shi, Y. & Casey, K. "Virtual Machine Showdown: Stack vs Registers." *ACM TACO* 4(4), 2007. <https://dl.acm.org/doi/10.1145/1328195.1328197>
V8 Project. "Launching Ignition and TurboFan." <https://v8.dev/blog/launching-ignition-and-turbofan>
CPython Project. *PEP 659 — Specializing Adaptive Interpreter.* <https://peps.python.org/pep-0659/>
Pall, M. *LuaJIT Project.* <https://luajit.org/luajit.html>

**Holon, stratified ontology.**
Koestler, A. *The Ghost in the Machine.* Hutchinson, 1967. <https://en.wikipedia.org/wiki/Holon_(philosophy)>

**Reactive runtimes.**
Phoenix LiveView. <https://hexdocs.pm/phoenix_live_view/>
Solid.js Reactivity. <https://docs.solidjs.com/concepts/signals>
Hotwire Turbo. <https://turbo.hotwired.dev/>

**Pluggable substrates.**
OSGi Alliance. *OSGi Core Release 8.* 2020. <https://www.osgi.org/specifications/>
Kubernetes Custom Resource Definitions and Operators. <https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/>

**The K Framework.**
Roşu, G. & Şerbănuţă, T.-F. "An Overview of the K Semantic Framework." *J. Logic & Algebraic Programming* 79(6), 2010. <https://kframework.org/papers/k-jlap-2010.pdf>

---

(c) April 2026 by Christoph A. Dorn licensed under CC BY-SA 4.0
