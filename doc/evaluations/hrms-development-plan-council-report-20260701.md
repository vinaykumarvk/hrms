# Council Evaluation: HRMS Development Plan

*2026-07-01 · Framed question: Should the HRMS development plan start by extracting and enhancing the PUDA workflow engine, and how should that plan be sequenced, tested, governed, and de-risked for a reusable enterprise/government HRMS platform?*

Process note: the first-pass council was run with independent sub-agents. One anonymous peer reviewer also ran as a sub-agent; the remaining peer reviews were completed using the skill's sequential fallback because the active agent thread limit was reached.

## Chairman's Verdict

The recommendation is to proceed with the PUDA workflow reuse strategy, but not as a big-bang shared-platform extraction. The corrected plan is: first capture PUDA golden behavior, then prove a thin strangler/facade boundary inside PUDA, then extract only the minimum reusable workflow core and adapter SPI, then embed that platform in the HRMS modulith for release 1. A separately deployed workflow service remains a future option, not a release-1 decision.

### Where the Council Agrees

The council strongly agrees that copying PUDA workflow code directly into HRMS would create a fork that becomes expensive and risky. It also agrees that a separate network microservice is premature because HRMS workflow actions are tightly coupled with G01 employee facts, G12 SR writes, G13 documents, P02 authorization, P05 audit, and transactional consistency. The shared conclusion is that workflow must be a platform capability with adapters, but the first release should consume it in-process.

The council also agrees that G03 leave and G05 transfer are the right proof slices. G03 validates the simple reporting-chain path. G05 validates the harder statutory workflow surface: position authority, parallel clearances, deemed outcomes, document output, notifications, and SR posting.

### Where the Council Clashes

The main clash was whether PH-00 should immediately create a reusable workflow-platform package. The proponent saw that as the right strategic investment. The contrarian argued that PUDA workflow code is likely entangled with PUDA/LAC concepts and that immediate package extraction would block all HRMS work if it slipped. The second pass resolved this by changing PH-00 into proof-oriented increments: inventory, provenance, golden tests, thin PUDA strangler boundary, minimum workflow-core extraction, adapter SPI, and conformance proof.

The second clash was how early to handle migration and coexistence. The original draft treated migration mostly as release hardening. Peer review correctly identified this as too late. The final plan now starts migration/coexistence in PH-00, adds legacy workflow state mapping in PH-01, adds migration staging/reconciliation services in PH-03, and keeps PH-10 as dry-run/certification/cutover rather than first discovery.

### Blind Spots Caught

The strongest blind spot caught through peer review was migration and coexistence. The first draft focused on new-build sequencing, PUDA extraction, authority resolution, and module waves, but did not sufficiently specify how historical employee records, service history, documents, audit trails, authority assignments, pending approvals, and legacy workflow states would be imported or legally certified.

Another peer-review blind spot was ownership. A workflow platform reused across PUDA, HRMS, and future applications needs named ownership, versioning, security patch rules, compatibility tests, and contribution rules. The final plan now adds workflow platform governance.

### Idea Evolution

The idea evolved from "extract PUDA workflow engine first" into "prove PUDA behavior through a boundary first, then extract a minimum reusable platform." It also evolved from a feature build plan into a controlled platform-and-product plan with governance, conformance tests, fixture packs, migration staging, and gates that prevent broad module build before G03/G05 evidence exists.

### Risk Register

| Risk | Severity | Source Advisor | Addressed in Second Pass? | Mitigation |
|---|---:|---|---|---|
| PUDA workflow code is too entangled with PUDA/LAC concepts | High | Contrarian | Yes | PH-00A/PH-00B inventory, provenance, and strangler proof before package extraction |
| HRMS build blocked by over-ambitious workflow platform productization | High | Executor, Contrarian | Yes | Extract minimum reusable slice first; defer advanced UI and committee workflow depth |
| Historical approvals become legally unexplainable after hierarchy changes | High | First Principles, Contrarian | Yes | Immutable resolver evidence with input facts, as-of date, candidate set, selected actor, rule/config version |
| Migration and coexistence are discovered too late | High | Peer Review | Yes | Migration stream starts PH-00; PH-01 state mapping; PH-03 staging; PH-10 certification |
| Platform ownership is unclear | Medium | Outsider, Proponent | Yes | Governance section with owner, semver, compatibility tests, patching, contribution rules |
| P01 workflow_tasks versus workflow_actions contradiction remains unresolved | High | Contrarian, Proponent | Yes | PH-01 formal schema/API amendment before PH-02 |
| Workflow config UI port delays backend proof | Medium | Executor | Yes | YAML-backed review/publish/simulation accepted until after PH-06 |
| Committee/quorum complexity delays G03/G05 proof | Medium | First Principles, Executor | Yes | Committee semantics are contract/fixture only in PH-02; full workflows wait for G06/G09 |
| Broad module teams start before platform proof | High | Executor | Yes | Gate 3 blocks PH-07, PH-08, and PH-09 until G03/G05 pass |

### Recommendation

Adopt the final plan in `docs/spec/phased-plan.yaml`. Its core decision is correct: extract and govern a reusable workflow platform, embed it in HRMS release 1, and prove it through G03/G05 before scaling module development. The chairman explicitly rejects direct code copying and also rejects a release-1 standalone workflow microservice.

### The One Thing to Do First

Start PH-00A: run a 3-5 day PUDA workflow inventory and golden-test capture. The output must classify each candidate file as reusable core, adapter code, or PUDA-domain code, and must produce the first PUDA golden behavior suite before extraction begins.

## Advisor Responses

### Proponent

The proponent endorsed the overall architecture. Their case was that HRMS is not simply fourteen independent modules; it is a statutory decision and record system where workflow, employee master data, SR ledger events, documents, authorization, and audit evidence must be transactionally coherent. PUDA already contains valuable workflow capabilities: queues, waits, fork/join, references, publish/review, simulation, and admin UI. Forking that code into HRMS would waste this investment and split future maintenance. Creating a separate network service immediately would introduce distributed transactions before the platform boundary is proven.

The proponent argued that the planned sequence was mostly right: workflow extraction first, P01 contract/schema reconciliation second, hierarchy and authority matrices third, then foundation services, then APIs/UI, then G03/G05 proof slices. They recommended strengthening the plan with platform governance: ownership, semantic versioning, adapter compatibility tests, contribution rules, IP/provenance checks, and a conformance suite. They also asked for explicit PUDA migration criteria so PUDA remains a protected consumer rather than an accidental casualty of HRMS reuse.

### Contrarian

The contrarian accepted the strategic value but attacked the extraction risk. Their strongest concern was that PUDA workflow code may be deeply entangled with PUDA/LAC application concepts, service-pack versions, LOI/order generation, routing reconciliation, and side effects. If the plan assumes clean extraction and that assumption fails, HRMS downstream phases are blocked before any module value is delivered. They argued for proving a thin strangler boundary around PUDA workflows before creating a separate platform repository.

They also raised a non-obvious legal risk: HRMS authority resolution cannot merely resolve "the current manager" or "the current competent authority." It must preserve why a historical actor was selected at the time of approval, even if hierarchy, delegation, acting charge, or policy rules later change. Without immutable resolver evidence and replay rules, statutory decisions become hard to defend. The contrarian also pressed for resolving the workflow_tasks/workflow_actions contradiction before implementation and warned against letting generic platform ambition absorb HRMS-specific resolver semantics.

### First Principles Thinker

The first-principles analysis reframed the goal. The real problem is not building fourteen HRMS modules; it is creating a trustworthy statutory decision-and-recording system. From that framing, workflow extraction is correct only if it improves decision trust, traceability, reuse, and correctness. The essential sequence is employee identity, authority facts, workflow decisions, audit evidence, documents, and SR ledger writes. Feature breadth comes after those foundations are demonstrably reliable.

This advisor challenged the plan to separate platform productization from platform refactoring. A platform needs ownership, release policy, compatibility guarantees, adapter boundaries, schema migration strategy, and a conformance suite. A refactor only moves code. The plan needed to say which one PH-00 was doing. They recommended a minimum reusable workflow slice first: actions, work items, waits, fork/join, config publish, one resolver SPI, and golden tests. They also recommended treating PH-02 as contract/schema/fixture preparation, not as full employee-master implementation, and deferring advanced UI and committee depth until after G03/G05 prove the spine.

### Outsider

The outsider found the plan direction understandable but said it assumed too much insider knowledge. Terms like P01, P02, P05, W.1, G03, SR, SoD, PrimeSoft, adapter, golden behavior, and semantic deduplication needed a glossary so future stakeholders and engineers do not misread the plan. They also flagged ownership as unclear: is the workflow platform a new repository, a package inside HRMS, a package inside PUDA, or a shared company platform? Without that answer, release cadence, security patching, version compatibility, and adapter breakages become ambiguous.

They also identified a sequencing confusion: the architecture discussion said platform services were already defined, but the plan treated PUDA extraction and P01 amendment as prerequisites. The final plan now clarifies that the existing HRMS artefacts define the target P01 contract, while PUDA is the implementation seed. The outsider asked for named owners, duration bands, and "what ships" per phase, which are now included.

### Executor

The executor judged the plan feasible only if PH-00 through PH-06 are protected as a critical path. Their immediate action was a small platform team and a three-to-five-day PUDA inventory plus golden-test capture. They recommended weekly PH-00 increments rather than a broad extraction milestone: inventory/provenance, strangler boundary, minimum core extraction, persistence/config/adapters, and conformance proof.

They also warned that frontend workflow configuration work could easily consume time before the backend platform is proven. Their recommendation was to accept YAML-backed reviewed workflow configs until after G03/G05 run end to end. They asked for fixture packs and CI command contracts per phase, plus specific staffing: architect, two senior backend engineers, database engineer, QA automation, and frontend only after backend contracts stabilize. The final plan incorporates this by making the inbox/task UI mandatory and the advanced workflow config UI optional until after PH-06.

## Peer Reviews

Anonymisation mapping: A = Contrarian, B = Proponent, C = Executor, D = Outsider, E = First Principles.

### Reviewer 1

Strongest response: B, because it connected architecture, sequencing, dependency reality, and governance without overstating the risk. Biggest blind spot: D, because it focused on onboarding clarity but underweighted technical and legal risks around immutable resolver evidence, domain leakage, migration safety, RLS/security, and workflow/SR correctness. What all five missed: migration and coexistence from current HRMS reality into the new workflow/SR spine, including existing employee records, pending approvals, service history, documents, authority assignments, legacy workflow states, and audit trails.

### Reviewer 2

Strongest response: A, because it found the plan's most dangerous hidden assumption: that PUDA workflow code is extractable on the planned schedule. Biggest blind spot: B, because it treated extraction governance as an additive control while not fully accounting for code entanglement and delivery blockage. What all five missed: data ownership at cutover. The plan must define which source wins when migrated employee profile data, SR facts, document metadata, and workflow evidence disagree.

### Reviewer 3

Strongest response: C, because it translated architecture into Monday-morning execution. The plan could fail through sequencing and staffing even if the architecture is correct. Biggest blind spot: E, because it reframed the problem well but did not sufficiently describe how teams should move from principle to parallel execution. What all five missed: acceptance criteria for stopping PH-00. A platform extraction can become endless unless the minimum reusable slice and fallback path are explicit.

### Reviewer 4

Strongest response: E, because it asked what system of trust HRMS is actually building and prevented premature module thinking. Biggest blind spot: C, because it emphasized speed but could under-invest in statutory evidence and legal replay if treated alone. What all five missed: operational ownership after go-live. Workflow failures will affect multiple departments, so incident response, schema migration ownership, adapter patching, and rollback authority must be defined.

### Reviewer 5

Strongest response: the combination of A and C. A exposed the extraction risk; C made it actionable. Biggest blind spot: B, because the strategic case could be read as permission to build too much platform before proving HRMS value. What all five missed: developer experience. If workflow configs, resolver fixtures, and SR conformance tests are hard to run locally, module teams will bypass the platform or create inconsistent shortcuts.

## Second Pass

### Contested Point 1: Big-Bang Platform Extraction vs Thin Strangler First

The pro-platform position was that a reusable workflow platform is the correct long-term asset and avoids a fork. The opposing position was that PUDA entanglement could make full extraction the critical-path failure. The strongest element on the pro side is reuse economics: future applications benefit only if the workflow engine is governed as a shared platform. The strongest element on the opposition side is sequencing: reuse value is irrelevant if extraction blocks HRMS for months.

Resolution: the plan now does both, in order. PH-00 starts with inventory, provenance, golden tests, and a thin PUDA facade. Only after that proof does it create the shared workflow-platform package and HRMS adapter. This preserves the strategic goal while reducing delivery risk.

### Contested Point 2: Migration at Release Hardening vs Migration from Day One

The original plan placed substantial migration work in PH-10. Peer review argued that this is too late because historical employee, SR, document, authority, workflow, and audit evidence shape the schema and resolver model. The opposing practical concern is that deep migration work can slow early platform development.

Resolution: migration is split. PH-00 starts inventory. PH-01 defines workflow/coexistence state mapping. PH-03 builds read-only staging and reconciliation services. PH-10 remains responsible for dry runs, certification, cutover, and exception acceptance. This keeps migration from blocking platform proof while preventing late discovery of legal data gaps.

### How Positions Evolved

The final verdict sides with the proponent on the destination, with the contrarian and executor on the route. The platform should be reusable, but extraction must be proof-first, adapter-led, and gated. The final plan also adopts the peer reviewers' migration critique and converts it into an explicit stream across phases.
