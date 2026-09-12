# Final acceptance — Phase 25

The automated acceptance command is:

```sh
make acceptance
```

It runs the complete content validator and reference solutions, then requires exactly 47 lessons, 6 practicums, 89 valid practicum task slots, SK01–SK44, and the absence of excluded exam / Python+ modules, classes, and dataclass sources.

The release gate also includes:

```sh
node scripts/validate-content.test.mjs
cd frontend && npm run lint && npm test -- --run && npm run build
cd backend && go test ./...
```

Manual smoke checks cover guest lesson access, visible theory before Python starts, task execution and test protocol, pane collapse/resize, theme switch, teacher-only group access, admin blocking, and SPA deep-link fallback.
