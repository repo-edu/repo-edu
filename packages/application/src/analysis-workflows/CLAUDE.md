# CLAUDE.md

Blame caching was removed deliberately after measurement showed
recompute is fast enough on representative student-repo cohorts. Do
not reintroduce a persistent cache without first publishing a stress
test that demonstrates user-perceptible latency on a real cohort.
The cost of a cache here is correctness discipline (schema versioning,
key normalization, invalidation on every behavior change);
reintroducing it without measured benefit imports that cost for free.
